const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const User = require("../models/User");

const removeFile = (filename) => {
  if (!filename) return;
  const filePath = path.join(__dirname, "..", "uploads", filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const cleanUser = (user) => {
  if (!user) return null;
  const cleaned = user.toObject ? user.toObject() : { ...user };
  delete cleaned.password;
  delete cleaned.__v;
  return cleaned;
};

exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user: cleanUser(user),
    });
  } catch (error) {
    console.error("Get My Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getPublicProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const query = mongoose.Types.ObjectId.isValid(userId)
      ? { _id: userId }
      : { username: userId };

    const user = await User.findOne(query).select(
      "-password -email -phone -blocked -likes -subscription -__v",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Public profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user: cleanUser(user),
    });
  } catch (error) {
    console.error("Get Public Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Profile not found.",
      });
    }

    const {
      username,
      fullName,
      age,
      location,
      bio,
      badge,
      interests,
      phone,
      gender,
      removePhoto,
    } = req.body;

    if (username && username.trim() && username !== user.username) {
      const existing = await User.findOne({ username: username.trim() });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Username already exists.",
        });
      }
      user.username = username.trim();
    }

    if (fullName !== undefined) {
      if (!fullName.trim()) {
        return res.status(400).json({
          success: false,
          message: "Full name cannot be empty.",
        });
      }
      user.fullName = fullName.trim();
    }

    if (age !== undefined) {
      const parsedAge = Number(age);
      if (!Number.isInteger(parsedAge) || parsedAge < 18 || parsedAge > 99) {
        return res.status(400).json({
          success: false,
          message: "Age must be an integer between 18 and 99.",
        });
      }
      user.age = parsedAge;
    }

    if (location !== undefined) {
      if (!location.trim()) {
        return res.status(400).json({
          success: false,
          message: "Location cannot be empty.",
        });
      }
      user.location = location.trim();
    }

    if (bio !== undefined) {
      if (bio.length < 20 || bio.length > 300) {
        return res.status(400).json({
          success: false,
          message: "Bio must be between 20 and 300 characters.",
        });
      }
      user.bio = bio;
    }

    if (badge !== undefined) {
      user.badge = badge;
    }

    if (phone !== undefined) {
      user.phone = phone;
    }

    if (gender !== undefined) {
      user.gender = gender;
    }

    if (interests !== undefined) {
      let parsedInterests = interests;
      if (typeof interests === "string") {
        try {
          parsedInterests = JSON.parse(interests);
        } catch {
          parsedInterests = [interests];
        }
      }

      user.interests = Array.isArray(parsedInterests)
        ? parsedInterests.filter((item) => item && item.toString().trim())
        : [parsedInterests].filter((item) => item && item.toString().trim());
    }

    if (removePhoto === "true" || removePhoto === true) {
      if (user.photo) {
        removeFile(user.photo);
        user.photo = "";
      }
    }

    if (req.file) {
      if (user.photo) {
        removeFile(user.photo);
      }
      user.photo = req.file.filename;
    }

    await user.save();

    const safeUser = await User.findById(user._id).select("-password");
    return res.status(200).json({
      success: true,
      user: cleanUser(safeUser),
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No photo uploaded.",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Profile not found.",
      });
    }

    if (user.photo) {
      removeFile(user.photo);
    }

    user.photo = req.file.filename;
    await user.save();

    const safeUser = await User.findById(user._id).select("-password");
    return res.status(200).json({
      success: true,
      user: cleanUser(safeUser),
    });
  } catch (error) {
    console.error("Upload Profile Photo Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteProfilePhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Profile not found.",
      });
    }

    if (user.photo) {
      removeFile(user.photo);
      user.photo = "";
      await user.save();
    }

    const safeUser = await User.findById(user._id).select("-password");
    return res.status(200).json({
      success: true,
      user: cleanUser(safeUser),
    });
  } catch (error) {
    console.error("Delete Profile Photo Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
