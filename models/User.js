const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
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

    phone: {
      type: String,
      default: "",
    },

    gender: {
      type: String,
      enum: [
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
      ],
    },

    lookingFor: {
      type: [String],
      enum: [
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
      ],
      default: ["female", "male"],
    },

    age: {
      type: Number,
      required: true,
    },

    state: {
      type: String,
      required: true,
    },

    region: {
      type: String,
      required: true,
    },

    location: {
      country: String,
      state: String,
      city: String,
      latitude: Number,
      longitude: Number,
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
      enum: ["online", "offline", "away"],
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

    accountType: {
      type: String,
      enum: ["real", "fake"],
      default: "real",
    },

    createdBy: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    role: {
      type: String,
      enum: ["user", "premium", "admin", "moderator"],
      default: "user",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("User", UserSchema);
