const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The actual moderator who typed the message.
    // Only populated when a moderator sends on behalf of a fake profile.
    moderator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    message: {
      type: String,
      trim: true,
      default: "",
    },

    image: {
      type: String,
      default: "",
    },

    audio: {
      type: String,
      default: "",
    },

    video: {
      type: String,
      default: "",
    },

    messageType: {
      type: String,
      enum: ["text", "image", "audio", "video"],
      default: "text",
    },

    delivered: {
      type: Boolean,
      default: false,
    },

    seen: {
      type: Boolean,
      default: false,
    },

    deletedForEveryone: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Message", MessageSchema);
