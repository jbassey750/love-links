const crypto = require("crypto");
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
  let txRef;
  let currency;
  let packageId;
  let amount;

  try {
    ({ packageId } = req.body);

    if (!packageId) {
      return res.status(400).json({
        success: false,
        message: "Point package is required.",
      });
    }
    const packageData = await Package.findById(packageId);

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

    currency = packageData.currency || "USD";
    amount = packageData.price;

    if (currency !== "USD") {
      return res.status(400).json({
        success: false,
        message: "This package cannot be checked out in the configured currency.",
      });
    }

    if (!process.env.CLIENT_URL) {
      throw new Error("CLIENT_URL is missing.");
    }

    txRef = `enamora_${crypto.randomUUID()}`;
    const redirectUrl =
      `${process.env.CLIENT_URL.replace(/\/+$/, "")}/payment/success` +
      `?tx_ref=${encodeURIComponent(txRef)}`;

    const payment = await Payment.create({
      user: req.user._id,
      pointPackage: packageData._id,
      amount,
      currency,
      pointsPurchased: packageData.points,
      paymentGateway: "flutterwave",
      customerEmail: req.user.email,
      status: "pending",
      txRef,
    });

    const flutterwaveResponse = await initializePayment({
      tx_ref: txRef,
      amount,
      currency,
      redirect_url: redirectUrl,
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
    }, {
      transactionReference: txRef,
      requestedCurrency: currency,
      packageIdentifier: packageData._id.toString(),
      amount,
    });

    if (!flutterwaveResponse?.data?.link) {
      console.error("[Payment] Flutterwave response contained no checkout link", {
        transactionReference: txRef,
        requestedCurrency: currency,
        packageIdentifier: packageData._id.toString(),
        amount,
      });

      await Payment.findOneAndUpdate({ txRef }, { status: "failed" });

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
    console.error("[Payment] Checkout initialization failed", {
      transactionReference: txRef,
      requestedCurrency: currency,
      packageIdentifier: packageId ? String(packageId) : undefined,
      amount,
      errorCode: error.code,
    });

    if (txRef) {
      await Payment.findOneAndUpdate({ txRef }, { status: "failed" });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to initialize payment. Please try again.",
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

    // Verify the transaction directly with Flutterwave
    const verification = await verifyTransaction(transaction_id);

    if (
      verification.status !== "success" ||
      verification.data?.status !== "successful"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed.",
      });
    }

    const transaction = verification.data;

    // -----------------------------------------
    // CHECK LOCAL PAYMENT
    // -----------------------------------------

    const payment = await Payment.findOne({
      txRef: transaction.tx_ref,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found.",
      });
    }

    // -----------------------------------------
    // VERIFY PAYMENT OWNER BEFORE PROCESSING
    // -----------------------------------------

    if (payment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized payment verification.",
      });
    }

    // -----------------------------------------
    // PROCESS PAYMENT
    // -----------------------------------------

    const result = await processVerifiedPayment(transaction);

    return res.status(200).json({
      success: true,
      message: result.alreadyProcessed
        ? "Payment already verified."
        : "Payment verified successfully.",
      points: result.user.points,
    });
  } catch (error) {
    console.error("Payment verification error:", error.message);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Verify a Flutterwave browser return without requiring the customer's
 * browser session. The transaction is still verified server-to-server and
 * must match a locally-created payment reference.
 */
exports.verifyCheckoutReturn = async (req, res) => {
  try {
    const { transaction_id, tx_ref } = req.body;

    if (
      typeof transaction_id !== "string" ||
      !/^\d+$/.test(transaction_id) ||
      typeof tx_ref !== "string" ||
      !tx_ref.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Transaction ID and payment reference are required.",
      });
    }

    const payment = await Payment.findOne({
      txRef: tx_ref,
      paymentGateway: "flutterwave",
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found.",
      });
    }

    const verification = await verifyTransaction(transaction_id);
    const transaction = verification.data;

    if (
      verification.status !== "success" ||
      transaction?.status !== "successful" ||
      String(transaction.id) !== transaction_id ||
      transaction.tx_ref !== payment.txRef
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed.",
      });
    }

    const result = await processVerifiedPayment(transaction);

    return res.status(200).json({
      success: true,
      message: result.alreadyProcessed
        ? "Payment already verified."
        : "Payment verified successfully.",
      pointsAdded: result.payment.pointsPurchased,
    });
  } catch (error) {
    console.error("Payment return verification error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify the payment. Please try again.",
    });
  }
};
