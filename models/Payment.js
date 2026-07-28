const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    pointPackage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PointPackage",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "USD",
    },

    pointsPurchased: {
      type: Number,
      required: true,
    },

    paymentGateway: {
      type: String,
      default: "stripe",
    },

    stripePaymentIntentId: {
      type: String,
      default: "",
    },

    receiptUrl: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Payment", PaymentSchema);