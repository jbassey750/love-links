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
            email: user.email
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "30d"
        }
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
            location,
            bio,
            badge,
            interests
        } = req.body;

        // ===============================
        // Validate Required Fields
        // ===============================

        if (
            !email ||
            !password ||
            !fullName ||
            !age ||
            !location
        ) {
            return res.status(400).json({
                success: false,
                message: "Please fill in all required fields."
            });
        }

        email = email.toLowerCase().trim();
        fullName = fullName.trim();
        location = location.trim();

        // ===============================
        // Password Validation
        // ===============================

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters."
            });
        }

        // ===============================
        // Age Validation
        // ===============================

        if (age < 18 || age > 99) {
            return res.status(400).json({
                success: false,
                message: "Age must be between 18 and 99."
            });
        }

        // ===============================
        // Email Exists?
        // ===============================

        const existingUser = await User.findOne({
            email
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email already exists."
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

            email,

            password: hashedPassword,

            fullName,

            age,

            location,

            bio: bio || "",

            badge: badge || "Love & Friends",

            interests: interests || [],

            photo: req.file ? req.file.filename : ""

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

            user: safeUser

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

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

                message: "Email and password are required."

            });

        }

        email = email.toLowerCase().trim();

        // ===============================
        // Find User
        // ===============================

        const user = await User.findOne({

            email

        });

        if (!user) {

            return res.status(401).json({

                success: false,

                message: "Invalid email or password."

            });

        }

        // ===============================
        // Compare Password
        // ===============================

        const isMatch = await bcrypt.compare(

            password,

            user.password

        );

        if (!isMatch) {

            return res.status(401).json({

                success: false,

                message: "Invalid email or password."

            });

        }

        // ===============================
        // Generate Token
        // ===============================

        const token = generateToken(user);

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

            user: safeUser

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

};