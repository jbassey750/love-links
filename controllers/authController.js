const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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

    username = username.trim();
    email = email.toLowerCase().trim();
    fullName = fullName.trim();
    phone = phone.trim();
    gender = gender.toLowerCase().trim();
    state = state ? state.trim() : "";
    region = region ? region.trim() : "";
    // lookingFor = lookingFor.toLowerCase().trim();

    if (!state) {
      return res.status(400).json({
        success: false,
        message: "State is required.",
      });
    }

    if (!region) {
      return res.status(400).json({
        success: false,
        message: "Region is required.",
      });
    }

    // Normalize interests payload when sent as JSON string
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

    // Normalize lookingFor
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

    // Normalize each value
    lookingFor = lookingFor.map((item) => item.toLowerCase().trim());

    // Add it here
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

    const isValid = lookingFor.every((item) =>
      allowedLookingFor.includes(item),
    );

    if (!isValid) {
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
    // Email Exists?
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

    //existing username?
    const existingUsername = await User.findOne({ username });

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

    res.status(201).json({
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
exports.login = async (req, res) => {
  try {
    let { email, password } = req.body;

    // ===============================
    // Validate
    // ===============================

    if (!email || !password) {
      return res.status(400).json({
        success: false,

        message: "Email and password are required.",
      });
    }

    email = email.toLowerCase().trim();

    // ===============================
    // Find User
    // ===============================

    const user = await User.findOne({
      email,
    });

    if (!user) {
      return res.status(401).json({
        success: false,

        message: "Invalid email or password.",
      });
    }

    // ===============================
    // Compare Password
    // ===============================

    const isMatch = await bcrypt.compare(
      password,

      user.password,
    );

    if (!isMatch) {
      return res.status(401).json({
        success: false,

        message: "Invalid email or password.",
      });
    }

    // ===============================
    // Generate Token
    // ===============================

    const token = generateToken(user);

    // ===============================
    // Set User Online
    // ===============================

    user.status = "online";
    await user.save();

    // ===============================
    // Safe User
    // ===============================

    const safeUser = await User.findById(user._id).select("-password");

    // ===============================
    // Response
    // ===============================

    res.status(200).json({
      success: true,

      message: "Login successful.",

      token,

      user: safeUser,
    });
  } catch (error) {
    console.error("Login Error:", error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
