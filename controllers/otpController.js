const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const OTP = require("../models/OTP");
const { sendOTPEmail } = require("../services/emailService");

const { generateToken } = require("../controllers/authController");

// const jwt = require("jsonwebtoken");

// const generateToken = (user) => {
  // return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    // expiresIn: "30d",
  // });
// };

// ===============================
// OTP CONFIGURATION
// ===============================

const OTP_EXPIRATION_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

const MAX_VERIFICATION_ATTEMPTS = 5;

// Maximum OTP requests allowed within the request window
const MAX_OTP_REQUESTS = 5;
const OTP_REQUEST_WINDOW_MINUTES = 60;

const canUseOTP = (user) =>
  user.accountType !== "fake" && ["user", "premium"].includes(user.role);

// ===============================
// GENERATE OTP
// ===============================

const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

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

    const now = new Date();

    // Find existing OTP
    let otpRecord = await OTP.findOne({
      user: user._id,
    });

    // ===============================
    // RESEND COOLDOWN
    // ===============================

    if (otpRecord && otpRecord.lastSentAt) {
      const secondsSinceLastSend =
        (now.getTime() - otpRecord.lastSentAt.getTime()) / 1000;

      if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(
          RESEND_COOLDOWN_SECONDS - secondsSinceLastSend,
        );

        return res.status(429).json({
          success: false,
          message: `Please wait ${remainingSeconds} seconds before requesting another OTP.`,
          retryAfter: remainingSeconds,
        });
      }
    }

    // ===============================
    // OTP REQUEST LIMIT
    // ===============================

    if (otpRecord) {
      const windowAge =
        (now.getTime() - otpRecord.requestWindowStart.getTime()) / (1000 * 60);

      if (windowAge >= OTP_REQUEST_WINDOW_MINUTES) {
        // Reset request window
        otpRecord.requestCount = 0;
        otpRecord.requestWindowStart = now;
      }

      if (otpRecord.requestCount >= MAX_OTP_REQUESTS) {
        return res.status(429).json({
          success: false,
          message: "Too many OTP requests. Please try again later.",
        });
      }
    }

    // ===============================
    // GENERATE OTP
    // ===============================

    const otp = generateOTP();

    // Hash OTP before storing
    const otpHash = await bcrypt.hash(otp, 10);

    const expiresAt = new Date(
      now.getTime() + OTP_EXPIRATION_MINUTES * 60 * 1000,
    );

    // ===============================
    // CREATE / UPDATE OTP RECORD
    // ===============================

    // ===============================
    // CREATE / UPDATE OTP RECORD
    // ===============================

    if (!otpRecord) {
      otpRecord = new OTP({
        user: user._id,
        email: user.email,
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: now,
        requestCount: 1,
        requestWindowStart: now,
      });
    } else {
      // Refresh ALL important fields
      otpRecord.user = user._id;
      otpRecord.email = user.email;
      otpRecord.otpHash = otpHash;
      otpRecord.expiresAt = expiresAt;
      otpRecord.attempts = 0;
      otpRecord.lastSentAt = now;

      // Safely handle old/malformed records
      if (!otpRecord.requestWindowStart) {
        otpRecord.requestWindowStart = now;
      }

      if (typeof otpRecord.requestCount !== "number") {
        otpRecord.requestCount = 0;
      }

      otpRecord.requestCount += 1;
    }

    await otpRecord.save();

    // ===============================
    // SEND EMAIL
    // ===============================

    await sendOTPEmail({
      email: user.email,
      otp,
      fullName: user.fullName,
    });

    // ===============================
    // RESPONSE
    // ===============================

    return res.status(200).json({
      success: true,
      message: "A verification code has been sent to your email address.",
      expiresIn: OTP_EXPIRATION_MINUTES * 60,
      resendCooldown: RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    console.error("Send OTP error:", error);

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
    console.error("Verify OTP error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
    });
  }
};
