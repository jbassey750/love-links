const crypto = require("crypto");

const {
  processVerifiedPayment,
} = require("../services/paymentProcessingService");

exports.flutterwaveWebhook = async (req, res) => {
  try {
    // Verify Flutterwave signature
    const signature = req.headers["verif-hash"];

    if (!signature || signature !== process.env.FLW_WEBHOOK_SECRET_HASH) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature.",
      });
    }

    const payload = req.body;

    // Only process successful payments
    if (
      payload.event !== "charge.completed" ||
      payload.data.status !== "successful"
    ) {
      return res.status(200).json({
        success: true,
        message: "Event ignored.",
      });
    }

    // Reuse the same payment processing logic
    await processVerifiedPayment(payload.data);

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully.",
    });
  } catch (error) {
    console.error("Flutterwave Webhook Error:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed.",
    });
  }
};