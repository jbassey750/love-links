const mongoose = require("mongoose");

const RealtimeEventSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  { timestamps: true },
);

RealtimeEventSchema.index({ recipient: 1, _id: 1 });

module.exports = mongoose.model("RealtimeEvent", RealtimeEventSchema);
