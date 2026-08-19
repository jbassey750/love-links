const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    data: {
      matchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Match",
      },

      chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Chat",
      },

      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },

      // Date Planner notification
      datePlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DatePlan",
      },
    },

    type: {
      type: String,
      enum: [
        "like",
        "match",
        "message",
        "subscription",
        "system",
        "match-reminder",

        // Date Planner
        "date",
        "date-reminder",
      ],
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    body: {
      type: String,
      required: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Notification", NotificationSchema);
