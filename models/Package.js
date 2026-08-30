const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
  {
    // Package name
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    // Package type
    type: {
      type: String,
      required: true,
      enum: ["points", "subscription"],
    },

    // Package price
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    // Currency
    currency: {
      type: String,
      default: "USD",
      enum: ["USD"],
      uppercase: true,
    },

    // Points received by the user
    // Used only for points packages
    points: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Subscription duration
    // Example:
    // 17.5 days
    // 1 month
    duration: {
      type: Number,
      default: null,
      min: 0,
    },

    // Duration unit
    durationUnit: {
      type: String,
      enum: ["days", "months"],
      default: null,
    },

    // Package description
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    // Package availability
    isActive: {
      type: Boolean,
      default: true,
    },

    // Admin who created the package
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Package", packageSchema);