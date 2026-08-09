const mongoose = require("mongoose");

const FakeAccountAssignmentSchema = new mongoose.Schema(
  {
    fakeUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    moderator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    realUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "transferred", "closed"],
      default: "active",
    },

    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },

    assignedAt: {
      type: Date,
      default: Date.now,
    },

    releasedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model(
  "FakeAccountAssignment",
  FakeAccountAssignmentSchema,
);
