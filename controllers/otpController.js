const User = require("../models/User");
const OTP = require("../models/OTP");
const bcrypt = require("bcryptjs");
const { otpDeliveryService } = require("../services/otpDeliveryService");
const { safeEmailError } = require("../services/emailService");

const { generateToken } = require("./authController");

// const jwt = require("jsonwebtoken");

// const generateToken = (user) => {
  // return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    // expiresIn: "30d",
  // });
// };

// ===============================
// OTP CONFIGURATION
// ===============================

const MAX_VERIFICATION_ATTEMPTS = 5;

const canUseOTP = (user) =>
  user.accountType !== "fake" && ["user", "premium"].includes(user.role);

// ===============================
// GENERATE OTP
// ===============================

// ===============================
// SEND OTP
// ===============================

exports.sendOTP = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Find user
    const user = await User.findById(userId).select(
      "_id email fullName verified role accountType",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!canUseOTP(user)) {
      return res.status(403).json({
        success: false,
        message: "OTP is not required for this account.",
      });
    }

    const delivery = await otpDeliveryService.request({
      user,
      resend: true,
    });

    if (delivery.status === "cooldown") {
      return res.status(429).json({
        success: false,
        message: `Please wait ${delivery.retryAfter} seconds before requesting another OTP.`,
        requiresOTP: true,
        emailSent: delivery.emailSent,
        retryAfter: delivery.retryAfter,
      });
    }

    if (delivery.status === "rate_limited") {
      return res.status(429).json({
        success: false,
        message: "Too many OTP requests. Please try again later.",
        requiresOTP: true,
        emailSent: false,
      });
    }

    if (delivery.status === "delivery_failed") {
      return res.status(503).json({
        success: false,
        message: "Unable to send verification email. Please retry after the cooldown.",
        requiresOTP: true,
        emailSent: false,
        retryAfter: delivery.retryAfter,
      });
    }

    return res.status(200).json({
      success: true,
      message: "A verification code has been sent to your email address.",
      requiresOTP: true,
      emailSent: true,
      expiresAt: delivery.record.expiresAt,
      resendCooldown: delivery.retryAfter,
    });
  } catch (error) {
    console.error("Send OTP request failed:", safeEmailError(error));

    return res.status(500).json({
      success: false,
      message: "Failed to send verification code",
    });
  }
};

// ===============================
// VERIFY OTP
// ===============================

exports.verifyOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP are required",
      });
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "OTP must be a 6-digit code",
      });
    }

    // Find user
    // const user = await User.findById(userId).select("_id email verified");
    const user = await User.findById(userId).select(
      "_id email fullName verified role accountType points",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!canUseOTP(user)) {
      return res.status(403).json({
        success: false,
        message: "OTP is not required for this account.",
      });
    }

    // Find OTP
    const otpRecord = await OTP.findOne({
      user: user._id,
    });

    if (!otpRecord) {
      return res.status(404).json({
        success: false,
        message: "No active verification code found. Please request a new OTP.",
      });
    }

    if (
      otpRecord.deliveryStatus === "failed" ||
      otpRecord.deliveryStatus === "pending"
    ) {
      return res.status(400).json({
        success: false,
        message: "The verification email was not delivered. Please request a new code.",
      });
    }

    // ===============================
    // CHECK EXPIRATION
    // ===============================

    if (new Date() > otpRecord.expiresAt) {
      await OTP.deleteOne({ _id: otpRecord._id });

      return res.status(400).json({
        success: false,
        message:
          "Your verification code has expired. Please request a new one.",
      });
    }

    // ===============================
    // CHECK MAX ATTEMPTS
    // ===============================

    if (otpRecord.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await OTP.deleteOne({ _id: otpRecord._id });

      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect attempts. Please request a new verification code.",
      });
    }

    // ===============================
    // COMPARE OTP
    // ===============================

    const isValidOTP = await bcrypt.compare(otp, otpRecord.otpHash);

    if (!isValidOTP) {
      otpRecord.attempts += 1;
      await otpRecord.save();

      const remainingAttempts = MAX_VERIFICATION_ATTEMPTS - otpRecord.attempts;

      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
        remainingAttempts,
      });
    }

    // ===============================
    // SUCCESSFUL VERIFICATION
    // ===============================

    // ===============================
    // SUCCESSFUL VERIFICATION
    // ===============================

    user.verified = true;

    await user.save();

    // Delete OTP immediately
    await OTP.deleteOne({
      _id: otpRecord._id,
    });

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Email verified successfully. Welcome to Enamora!",
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        accountType: user.accountType,
        points: user.points,
      },
    });
  } catch (error) {
    console.error("Verify OTP request failed:", {
      name: error?.name || "Error",
      message: error?.message || "OTP verification failed",
      code: error?.code,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
    });
  }
};
