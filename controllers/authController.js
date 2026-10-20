const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudinary = require("../config/cloudinary");
const supabase = require("../config/supabase");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../services/emailService");

// Import email service
const { otpDeliveryService } = require("../services/otpDeliveryService");

/**
 * Generate JWT Token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    },
  );
};

/**
 * SIGN UP
 */
exports.signup = async (req, res) => {
  try {
    let {
      email,
      password,
      fullName,
      age,
      username,
      gender,
      lookingFor,
      phone,
      bio,
      badge,
      interests,
      state,
      region,
      relationshipStatus,
    } = req.body;

    // ===============================
    // Validate Required Fields
    // ===============================

    if (!username || !email || !password || !fullName || !age) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required fields.",
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required.",
      });
    }

    if (!gender) {
      return res.status(400).json({
        success: false,
        message: "Gender identity is required.",
      });
    }

    if (!relationshipStatus) {
      return res.status(400).json({
        success: false,
        message: "Relationship status is required.",
      });
    }

    // ===============================
    // Normalize Basic Fields
    // ===============================

    username = username.trim();
    email = email.toLowerCase().trim();
    fullName = fullName.trim();
    phone = phone.trim();
    gender = gender.toLowerCase().trim();
    relationshipStatus = relationshipStatus.toLowerCase().trim();

    state = state ? state.trim() : "";
    region = region ? region.trim() : "";

    // ===============================
    // Validate Relationship Status
    // ===============================

    const allowedRelationshipStatuses = [
      "single",
      "in a relationship",
      "married",
      "divorced",
      "widowed",
      "separated",
      "it's complicated",
      "prefer not to say",
    ];

    if (!allowedRelationshipStatuses.includes(relationshipStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid relationship status.",
      });
    }

    // ===============================
    // Validate State
    // ===============================

    if (!state) {
      return res.status(400).json({
        success: false,
        message: "State is required.",
      });
    }

    // ===============================
    // Validate Region
    // ===============================

    if (!region) {
      return res.status(400).json({
        success: false,
        message: "Region is required.",
      });
    }

    // ===============================
    // Normalize Interests
    // ===============================

    if (typeof interests === "string") {
      try {
        interests = JSON.parse(interests);
      } catch {
        interests = interests ? [interests] : [];
      }
    }

    if (!Array.isArray(interests)) {
      interests = [];
    }

    // ===============================
    // Normalize Looking For
    // ===============================

    if (typeof lookingFor === "string") {
      try {
        lookingFor = JSON.parse(lookingFor);
      } catch {
        lookingFor = [lookingFor];
      }
    }

    if (!Array.isArray(lookingFor)) {
      lookingFor = [];
    }

    lookingFor = lookingFor.map((item) => item.toLowerCase().trim());

    // ===============================
    // Validate Looking For
    // ===============================

    const allowedLookingFor = [
      "female",
      "male",
      "non-binary",
      "agender",
      "bigender",
      "genderfluid",
      "genderqueer",
      "transgender",
      "prefer not to say",
      "other",
    ];

    const isValidLookingFor = lookingFor.every((item) =>
      allowedLookingFor.includes(item),
    );

    if (!isValidLookingFor) {
      return res.status(400).json({
        success: false,
        message: "Invalid lookingFor value.",
      });
    }

    if (!lookingFor.length) {
      return res.status(400).json({
        success: false,
        message: "Please select who you are looking for.",
      });
    }

    // ===============================
    // Password Validation
    // ===============================

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // ===============================
    // Age Validation
    // ===============================

    if (age < 18 || age > 99) {
      return res.status(400).json({
        success: false,
        message: "Age must be between 18 and 99.",
      });
    }

    // ===============================
    // Check Existing Email
    // ===============================

    const existingUser = await User.findOne({
      email,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists.",
      });
    }

    // ===============================
    // Check Existing Username
    // ===============================

    const existingUsername = await User.findOne({
      username,
    });

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: "Username already exists.",
      });
    }

    // ===============================
    // Hash Password
    // ===============================

    const hashedPassword = await bcrypt.hash(password, 10);

    // ===============================
    // Upload Profile Photo
    // ===============================

    let photoUrl = "";

    if (req.file) {
      const fileExtension =
        req.file.originalname.split(".").pop()?.toLowerCase() || "jpg";

      const fileName = `profile-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 10)}.${fileExtension}`;

      const filePath = `profiles/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-images")
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error("Supabase Upload Error:", uploadError);

        return res.status(500).json({
          success: false,
          message: "Unable to upload profile photo.",
        });
      }

      const { data: publicUrlData } = supabase.storage
        .from("profile-images")
        .getPublicUrl(filePath);

      photoUrl = publicUrlData.publicUrl;
    }

    // ===============================
    // Create User
    // ===============================

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      fullName,
      phone,
      gender,
      lookingFor,
      age,
      state,
      region,
      relationshipStatus,
      bio: bio || "",
      badge: badge || "Love & Friends",
      interests,
      photo: photoUrl,
    });

    // ===============================
    // Generate Token
    // =============================== 

    const token = generateToken(user);

    // ===============================
    // Safe User Object
    // ===============================

    const safeUser = await User.findById(user._id).select("-password");

    // ===============================
    // Response
    // ===============================

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error("Signup Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * LOGIN
 */
/**
 * LOGIN
 */
exports.login = async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      console.warn("[AUTH] login rejected: missing credentials");
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    email = email.toLowerCase().trim();

    console.log("[AUTH] searching for login account");
    const user = await User.findOne({ email });

    if (!user) {
      console.warn("[AUTH] login failed: account not found");
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    console.log("[AUTH] user found; verifying password", {
      userId: user._id,
      role: user.role,
      accountType: user.accountType,
    });

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.warn("[AUTH] login failed: password mismatch", {
        userId: user._id,
      });

      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Moderators must use the dedicated moderator login
    if (user.role === "moderator") {
      console.warn("[AUTH] moderator attempted normal login", {
        userId: user._id,
      });

      return res.status(403).json({
        success: false,
        message: "Moderators must use the moderator login portal.",
      });
    }

    const requiresOTP =
      user.accountType !== "fake" && ["user", "premium"].includes(user.role);

    if (!requiresOTP) {
      const token = generateToken(user);

      console.log("[AUTH] login successful without OTP", {
        userId: user._id,
        role: user.role,
      });

      return res.status(200).json({
        success: true,
        message: "Login successful.",
        token,
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          accountType: user.accountType,
        },
      });
    }

    const delivery = await otpDeliveryService.request({ user });
    const otpResponse = {
      requiresOTP: true,
      emailSent: delivery.emailSent,
      userId: user._id,
      email: user.email,
      fullName: user.fullName,
      expiresAt: delivery.record?.expiresAt || null,
      retryAfter: delivery.retryAfter || 0,
      resendCooldown: delivery.retryAfter || 0,
    };

    if (delivery.status === "already_sent") {
      return res.status(200).json({
        success: true,
        message: "A verification code is active. Check your email.",
        ...otpResponse,
      });
    }

    if (delivery.status === "cooldown") {
      return res.status(429).json({
        success: false,
        message: `Please wait ${delivery.retryAfter} seconds before requesting another verification code.`,
        ...otpResponse,
      });
    }

    if (delivery.status === "rate_limited") {
      return res.status(429).json({
        success: false,
        message: "Too many verification code requests. Please try again later.",
        ...otpResponse,
        retryAfter: null,
      });
    }

    if (delivery.status === "delivery_failed") {
      return res.status(503).json({
        success: false,
        message: "Login requires email verification, but the verification email could not be sent. Please retry after the cooldown.",
        ...otpResponse,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login requires email verification. A verification code was sent to your email.",
      ...otpResponse,
    });
  } catch (error) {
    console.error("[AUTH] Login Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Login failed. Please try again.",
    });
  }
};

// =====================================================
// MODERATOR LOGIN
// POST /api/auth/moderator-login
// Moderators do NOT use OTP
// =====================================================
exports.moderatorLogin = async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    email = email.toLowerCase().trim();

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Only moderators can use this endpoint
    if (user.role !== "moderator") {
      return res.status(403).json({
        success: false,
        message: "This login portal is for moderators only.",
      });
    }

    // ==========================================
    // Check moderator account status
    // ==========================================
    // The extra check for a value makes this safe
    // for moderators created before the new field
    // was added to the User model.
    if (
      user.moderatorAccountStatus &&
      user.moderatorAccountStatus !== "active"
    ) {
      return res.status(403).json({
        success: false,
        message:
          user.moderatorAccountStatus === "suspended"
            ? "Your moderator account has been suspended."
            : "Your moderator account has been deactivated.",
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Generate moderator token
    const token = generateToken(user);

    // Mark moderator online
    user.status = "online";
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Moderator login successful.",
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        role: user.role,
        accountType: user.accountType,
        status: user.status,
        moderatorAccountStatus: user.moderatorAccountStatus || "active",
      },
    });
  } catch (error) {
    console.error("[AUTH] Moderator login failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Moderator login failed. Please try again.",
    });
  }
};

// =====================================================
// LOGOUT USER
// POST /api/auth/logout
// =====================================================
exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Mark user offline
    user.status = "offline";

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("Logout Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to logout.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};



/**
 * Request a password-reset email
 */
exports.forgotPassword = async (req, res) => {
  const genericResponse = {
    success: true,
    message:
      "If an account exists with that email, a password-reset link will be sent shortly.",
  };

  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please provide your email address.",
      });
    }

    const user = await User.findOne({ email });

    // Always use the same success response for unknown email addresses.
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Generate a secure token, but store only its SHA-256 hash.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 20 * 60 * 1000);

    await user.save();

    const frontendUrl = (
      process.env.FRONTEND_URL ||
      process.env.CLIENT_URL ||
      "https://enamora-app.com"
    ).replace(/\/+$/, "");

    const resetUrl = `${frontendUrl}/reset-password/${rawToken}`;

    try {
      await sendPasswordResetEmail({
        email: user.email,
        fullName: user.fullName,
        resetUrl,
      });
    } catch (emailError) {
      // Invalidate the token if the email could not be delivered.
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      console.error("Password-reset email could not be delivered.");
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error("Forgot-password request failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to process your request right now. Please try again.",
    });
  }
};

/**
 * Reset password using a valid, unused reset token
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "The password-reset link is invalid.",
      });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Your password must be at least 6 characters long.",
      });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select("+passwordResetToken +passwordResetExpires");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "This password-reset link is invalid or has expired. Please request a new one.",
      });
    }

    user.password = await bcrypt.hash(password, 10);

    // Make the reset link single-use.
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Your password has been reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Password reset failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to reset your password right now. Please try again.",
    });
  }
};



exports.generateToken = generateToken;
