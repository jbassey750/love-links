const mongoose = require("mongoose");

const DatePlanSchema = new mongoose.Schema(
  {
    // User who created the date
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Partner invited to the date
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Date title
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    // Description/details of the date
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    // Date and time of the planned date
    dateTime: {
      type: Date,
      required: true,
    },

    // Location of the date
    location: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    // Current status of the date
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "declined",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },

    // Whether reminders are enabled
    reminderEnabled: {
      type: Boolean,
      default: true,
    },

    // How many minutes before the date to send reminder
    reminderMinutesBefore: {
      type: Number,
      enum: [15, 30, 60, 120, 1440],
      default: 60,
    },

    // Prevent sending the same reminder multiple times
    reminderSent: {
      type: Boolean,
      default: false,
    },

    // When the date was cancelled
    cancelledAt: {
      type: Date,
      default: null,
    },

    // Optional cancellation reason
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("DatePlan", DatePlanSchema);