const mongoose = require("mongoose");
const { randomUUID } = require("crypto");

const RealtimeConnectionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: randomUUID,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("RealtimeConnection", RealtimeConnectionSchema);
