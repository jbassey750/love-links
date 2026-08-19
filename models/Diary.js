const mongoose = require("mongoose");

const DiarySchema = new mongoose.Schema(
  {
    // User who created the diary entry
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Diary entry title
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    // Main diary content
    content: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional mood for the diary entry
    mood: {
      type: String,
      enum: [
        "happy",
        "excited",
        "romantic",
        "loved",
        "calm",
        "sad",
        "angry",
        "lonely",
        "confused",
        "grateful",
        "other",
      ],
      default: "other",
    },

    // Whether the diary is private
    isPrivate: {
      type: Boolean,
      default: true,
    },

    // Optional partner the diary is shared with
    sharedWith: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Whether this diary entry has been shared with a partner
    isShared: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Diary", DiarySchema);

// {
//   "user": "66b123456789abcdef123456",
//   "title": "Our First Date",
//   "content": "Today was such a beautiful day. I really enjoyed spending time with my partner.",
//   "mood": "romantic",
//   "isPrivate": false,
//   "sharedWith": "66b987654321abcdef654321",
//   "isShared": true
// }

// {
  // "title": "Our First Date",
  // "content": "Today was beautiful...",
  // "mood": "romantic"
// }