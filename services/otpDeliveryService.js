const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const OTP = require("../models/OTP");
const { sendOTPEmail } = require("./emailService");

const OTP_EXPIRATION_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_REQUESTS = 5;
const OTP_REQUEST_WINDOW_MINUTES = 60;

const createOtpDeliveryService = ({
  otpModel = OTP,
  sendEmail = sendOTPEmail,
  now = () => new Date(),
  generateCode = () => crypto.randomInt(100000, 1000000).toString(),
} = {}) => ({
  async request({ user, resend = false }) {
    const requestedAt = now();
    let record = await otpModel.findOne({ user: user._id });
    const isActive = record && record.expiresAt > requestedAt;
    const emailSent =
      record?.deliveryStatus === "sent" || Boolean(record?.emailSentAt);

    if (!resend && isActive && emailSent) {
      return {
        status: "already_sent",
        record,
        emailSent: true,
        retryAfter: getRetryAfter(record.lastSentAt, requestedAt),
      };
    }

    const retryAfter = getRetryAfter(record?.lastSentAt, requestedAt);
    if (retryAfter > 0) {
      return { status: "cooldown", record, emailSent, retryAfter };
    }

    if (record) {
      const windowStart = record.requestWindowStart
        ? new Date(record.requestWindowStart)
        : requestedAt;
      if (
        requestedAt.getTime() - windowStart.getTime() >=
        OTP_REQUEST_WINDOW_MINUTES * 60 * 1000
      ) {
        record.requestWindowStart = requestedAt;
        record.requestCount = 0;
      }

      if ((record.requestCount || 0) >= MAX_OTP_REQUESTS) {
        return { status: "rate_limited", record, emailSent: false };
      }
    }

    const code = generateCode();
    const otpHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(
      requestedAt.getTime() + OTP_EXPIRATION_MINUTES * 60 * 1000,
    );

    if (!record) {
      record = new otpModel({
        user: user._id,
        email: user.email,
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: requestedAt,
        requestCount: 1,
        requestWindowStart: requestedAt,
        deliveryStatus: "pending",
        emailSentAt: null,
      });
    } else {
      record.email = user.email;
      record.otpHash = otpHash;
      record.expiresAt = expiresAt;
      record.attempts = 0;
      record.lastSentAt = requestedAt;
      record.requestCount = (record.requestCount || 0) + 1;
      record.requestWindowStart = record.requestWindowStart || requestedAt;
      record.deliveryStatus = "pending";
      record.emailSentAt = null;
    }

    await record.save();

    try {
      await sendEmail({
        email: user.email,
        fullName: user.fullName,
        otp: code,
      });
    } catch (error) {
      record.deliveryStatus = "failed";
      await record.save();
      return {
        status: "delivery_failed",
        record,
        emailSent: false,
        retryAfter: RESEND_COOLDOWN_SECONDS,
        error,
      };
    }

    record.deliveryStatus = "sent";
    record.emailSentAt = now();
    await record.save();

    return {
      status: "sent",
      record,
      emailSent: true,
      retryAfter: RESEND_COOLDOWN_SECONDS,
    };
  },
});

const getRetryAfter = (lastSentAt, requestedAt) => {
  if (!lastSentAt) return 0;

  const elapsedSeconds =
    (requestedAt.getTime() - new Date(lastSentAt).getTime()) / 1000;
  return elapsedSeconds < RESEND_COOLDOWN_SECONDS
    ? Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds)
    : 0;
};

module.exports = {
  createOtpDeliveryService,
  otpDeliveryService: createOtpDeliveryService(),
};
