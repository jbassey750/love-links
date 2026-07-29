const Payment = require("../models/Payment");
const PointPackage = require("../models/PointPackage");

const {
  initializePayment,
  verifyTransaction,
} = require("../services/flutterwaveService");

const {
  processVerifiedPayment,
} = require("../services/paymentProcessingService");

/**
 * Initialize Flutterwave Payment
 */
exports.initializeCheckout = async (req, res) => {
  let txRef;
  try {
    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        message: "Point package is required.",
      });
    }

    const pointPackage = await PointPackage.findById(packageId);

    if (!pointPackage) {
      return res.status(404).json({
        success: false,
        message: "Point package not found.",
      });
    }

    if (!pointPackage.active) {
      return res.status(400).json({
        success: false,
        message: "This package is currently unavailable.",
      });
    }

    txRef = `lovelink_${Date.now()}_${req.user._id}`;

    // Create pending payment first
    const payment = await Payment.create({
      user: req.user._id,

      pointPackage: pointPackage._id,

      amount: pointPackage.price,

      currency: pointPackage.currency || "USD",

      pointsPurchased: pointPackage.points,

      paymentGateway: "flutterwave",

      customerEmail: req.user.email,

      status: "pending",

      txRef,
    });

    const flutterwaveResponse = await initializePayment({
      tx_ref: txRef,

      amount: pointPackage.price,

      currency: pointPackage.currency || "USD",

      redirect_url: `${process.env.CLIENT_URL}/payment/success?tx_ref=${encodeURIComponent(txRef)}`,

      customer: {
        email: req.user.email,

        name: req.user.fullName,
      },

      customizations: {
        title: "LoveLink",

        description: `${pointPackage.points} Chat Points`,
      },

      meta: {
        userId: req.user._id.toString(),

        packageId: pointPackage._id.toString(),

        paymentId: payment._id.toString(),
      },
    });

    if (!flutterwaveResponse?.link) {
      return res.status(500).json({
        success: false,
        message: "Flutterwave checkout link was not generated.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment initialized successfully.",
      checkoutUrl: flutterwaveResponse.link,
    });
  } catch (error) {
    if (txRef) {
      await Payment.findOneAndUpdate({ txRef }, { status: "failed" });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Verify Flutterwave Payment
 */
exports.verifyCheckout = async (req, res) => {
  try {
    const { transaction_id } = req.query;

    if (!transaction_id) {
      return res.status(400).json({
        success: false,

        message: "Transaction ID is required.",
      });
    }

    const verification = await verifyTransaction(transaction_id);

    if (
      verification.status !== "success" ||
      verification.data.status !== "successful"
    ) {
      return res.status(400).json({
        success: false,

        message: "Payment verification failed.",
      });
    }

    const transaction = verification.data;

    const result = await processVerifiedPayment(transaction);

    // Extra protection:
    // Only the logged-in owner can complete the request.
    if (result.payment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized payment verification.",
      });
    }

    return res.status(200).json({
      success: true,
      message: result.alreadyProcessed
        ? "Payment already verified."
        : "Payment verified successfully.",
      points: result.user.points,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  } 
};
