const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    age: {
      type: Number,
      required: true,
    },

    location: {
      type: String,
      required: true,
    },

    photo: {
      type: String,
      default: "",
    },

    bio: {
      type: String,
      maxlength: 300,
      default: "",
    },

    interests: [
      {
        type: String,
      },
    ],

    badge: {
      type: String,
      enum: ["Romance", "Friends", "Love & Friends"],
      default: "Love & Friends",
    },

    verified: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      default: "offline",
    },

    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    blocked: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    subscription: {
      plan: {
        type: String,
        enum: ["free", "basic", "premium", "elite"],
        default: "free",
      },

      status: {
        type: String,
        enum: ["inactive", "active", "expired"],
        default: "inactive",
      },

      startDate: Date,

      endDate: Date,

      autoRenew: {
        type: Boolean,
        default: false,
      },
    },

    points: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("User", UserSchema);
