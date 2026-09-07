const Payment = require("../models/Payment");
const Package = require("../models/Package");

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
  console.log("🔥 initializeCheckout was called", req.body);
  let txRef;
  try {
    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        message: "Point package is required.",
      });
    }

    const packageData = await Package.findById(packageId);
    console.log("✅ Step 1: packageData found:", !!packageData);

    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: "Point package not found.",
      });
    }

    if (!packageData.isActive || packageData.type !== "points") {
      return res.status(400).json({
        success: false,
        message: "This package is currently unavailable.",
      });
    }

    txRef = `enamora_${Date.now()}_${req.user._id}`;
    console.log("✅ Step 2: txRef generated:", txRef);

    const payment = await Payment.create({
      user: req.user._id,
      pointPackage: packageData._id,
      amount: packageData.price,
      currency: packageData.currency || "USD",
      pointsPurchased: packageData.points,
      paymentGateway: "flutterwave",
      customerEmail: req.user.email,
      status: "pending",
      txRef,
    });
    console.log("✅ Step 3: Payment record created:", payment._id);

    const flutterwaveResponse = await initializePayment({
      tx_ref: txRef,
      amount: packageData.price,
      currency: packageData.currency || "USD",
      redirect_url: `${process.env.CLIENT_URL}/payment/success?tx_ref=${encodeURIComponent(txRef)}`,
      customer: {
        email: req.user.email,
        name: req.user.fullName,
      },
      customizations: {
        title: "Enamora",
        description: `${packageData.points} Chat Points`,
      },
      meta: {
        userId: req.user._id.toString(),
        packageId: packageData._id.toString(),
        paymentId: payment._id.toString(),
      },
    });
    console.log(
      "✅ Step 4: Flutterwave response received:",
      flutterwaveResponse,
    );

    if (!flutterwaveResponse?.data?.link) {
      return res.status(500).json({
        success: false,
        message: "Flutterwave checkout link was not generated.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment initialized successfully.",
      checkoutUrl: flutterwaveResponse.data.link,
    });
  } catch (error) {
    console.error("🔥🔥 CAUGHT ERROR in initializeCheckout:", error);

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
