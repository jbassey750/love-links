const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Import OTP model
const OTP = require("../models/OTP");

// Import email service
const { sendOTPEmail } = require("../services/emailService");

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
        // Handle JSON string: '["male","female"]'
        lookingFor = JSON.parse(lookingFor);
      } catch {
        // Handle plain string: "male"
        lookingFor = [lookingFor];
      }
    }

    if (!Array.isArray(lookingFor)) {
      lookingFor = [];
    }

    // Normalize each lookingFor value
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
      photo: req.file ? req.file.filename : "",
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

    console.log("[AUTH] login request received", {
      hasEmail: Boolean(email),
      hasPassword: Boolean(password),
      emailProvided: email ? String(email).trim() : "",
    });

    if (!email || !password) {
      console.warn("[AUTH] login rejected: missing credentials");
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    email = email.toLowerCase().trim();

    console.log("[AUTH] searching user in MongoDB", { email });
    const user = await User.findOne({ email });

    if (!user) {
      console.warn("[AUTH] login failed: user not found", { email });
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
        email: user.email,
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

    const existingOTP = await OTP.findOne({
      user: user._id,
      expiresAt: { $gt: new Date() },
    });

    if (existingOTP) {
      console.warn(
        "[AUTH] login requires OTP but an active OTP already exists",
        {
          userId: user._id,
          otpId: existingOTP._id,
        },
      );

      return res.status(429).json({
        success: false,
        message:
          "A verification code has already been sent. Please check your email.",
        requiresOTP: true,
        userId: user._id,
        email: user.email,
        fullName: user.fullName,
      });
    }

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    console.log("[AUTH] creating OTP record for user", {
      userId: user._id,
      expiresAt,
    });

    await OTP.create({
      user: user._id,
      email: user.email,
      otpHash,
      expiresAt,
      attempts: 0,
    });

    try {
      console.log("[AUTH] sending OTP email", {
        userId: user._id,
        email: user.email,
      });
      await sendOTPEmail({
        email: user.email,
        fullName: user.fullName,
        otp: otpCode,
      });
    } catch (emailError) {
      console.error("[AUTH] OTP email send failed", emailError);
      return res.status(500).json({
        success: false,
        message:
          "Login failed because the verification email could not be sent.",
        requiresOTP: false,
      });
    }

    console.log("[AUTH] OTP required response sent to frontend", {
      userId: user._id,
      email: user.email,
    });

    return res.status(200).json({
      success: true,
      message:
        "Login successful. A verification code has been sent to your email.",
      requiresOTP: true,
      userId: user._id,
      email: user.email,
      fullName: user.fullName,
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

    console.log("[AUTH] moderator login request received", {
      hasEmail: Boolean(email),
      hasPassword: Boolean(password),
      emailProvided: email ? String(email).trim() : "",
    });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    email = email.toLowerCase().trim();

    const user = await User.findOne({ email });

    if (!user) {
      console.warn("[AUTH] moderator login failed: user not found", {
        email,
      });

      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    console.log("[AUTH] moderator account found", {
      userId: user._id,
      role: user.role,
      accountType: user.accountType,
    });

    // Only moderators can use this endpoint
    if (user.role !== "moderator") {
      console.warn("[AUTH] non-moderator attempted moderator login", {
        userId: user._id,
        role: user.role,
      });

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
      console.warn("[AUTH] moderator account is not active", {
        userId: user._id,
        moderatorAccountStatus: user.moderatorAccountStatus,
      });

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
      console.warn("[AUTH] moderator login failed: password mismatch", {
        userId: user._id,
      });

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

    console.log("[AUTH] moderator login successful", {
      userId: user._id,
      email: user.email,
    });

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
        moderatorAccountStatus:
          user.moderatorAccountStatus || "active",
      },
    });
  } catch (error) {
    console.error("[AUTH] Moderator Login Error:", error);

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

exports.generateToken = generateToken;
