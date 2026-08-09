const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const User = require("../models/User");

exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required.",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        location: {
          country: "",
          state: "",
          city: "",
          latitude,
          longitude,
        },
      },
      {
        new: true,
      },
    ).select("location");

    res.status(200).json({
      success: true,
      message: "Location updated successfully.",
      location: user.location,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
