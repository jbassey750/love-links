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
        message: "Package is required.",
      });
    }
    const packageData = await Package.findById(packageId);

    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: "Point package not found.",
      });
    }

    // Allow both points and subscription packages.
    if (
      !packageData.isActive ||
      !["points", "subscription"].includes(packageData.type)
    ) {
      return res.status(400).json({
        success: false,
        message: "This package is currently unavailable.",
      });
    }

    // Validate the selected package according to its type.
    if (packageData.type === "points") {
      if (!Number.isFinite(packageData.points) || packageData.points <= 0) {
        return res.status(400).json({
          success: false,
          message: "This points package is not configured correctly.",
        });
      }
    }

    if (packageData.type === "subscription") {
      if (
        !Number.isFinite(packageData.duration) ||
        packageData.duration <= 0 ||
        !["days", "months"].includes(packageData.durationUnit)
      ) {
        return res.status(400).json({
          success: false,
          message: "This subscription package is not configured correctly.",
        });
      }
    }

    currency = packageData.currency || "USD";
    amount = packageData.price;

    if (currency !== "USD") {
      return res.status(400).json({
        success: false,
        message:
          "This package cannot be checked out in the configured currency.",
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

    const flutterwaveResponse = await initializePayment(
      {
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
          description:
            packageData.type === "subscription"
              ? `${packageData.name} Subscription`
              : `${packageData.points} Chat Points`,
        },
        meta: {
          userId: req.user._id.toString(),
          packageId: packageData._id.toString(),
          paymentId: payment._id.toString(),
        },
      },
      {
        transactionReference: txRef,
        requestedCurrency: currency,
        packageIdentifier: packageData._id.toString(),
        amount,
      },
    );

    if (!flutterwaveResponse?.data?.link) {
      console.error(
        "[Payment] Flutterwave response contained no checkout link",
        {
          transactionReference: txRef,
          requestedCurrency: currency,
          packageIdentifier: packageData._id.toString(),
          amount,
        },
      );

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

/** Verify Flutterwave payment when the browser returns from checkout */
exports.verifyCheckoutReturn = async (req, res) => {
  try {
    const { transaction_id, tx_ref } = req.body;

    // Validate the information returned by Flutterwave.
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

    // Verify the transaction directly with Flutterwave.
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

    // Process the payment. Already-completed payments are handled safely
    // by the existing paymentProcessingService.
    const result = await processVerifiedPayment(transaction);

    if (!result.user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    // Retrieve the package to determine what the customer purchased.
    const packageData = await Package.findById(payment.pointPackage);

    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: "The package associated with this payment was not found.",
      });
    }

    // Return different responses for points and subscription purchases.
    if (packageData.type === "points") {
      return res.status(200).json({
        success: true,
        message: "Points purchase verified successfully.",
        alreadyProcessed: result.alreadyProcessed,
        purchaseType: "points",
        packageName: packageData.name,
        pointsAdded: Number(payment.pointsPurchased) || 0,
        totalPoints: Number(result.user.points) || 0,
      });
    }

    if (packageData.type === "subscription") {
      const packageName = String(packageData.name || "");
      const normalizedName = packageName.toLowerCase();

      let purchasedPlan = null;

      if (normalizedName.includes("premium")) {
        purchasedPlan = "premium";
      } else if (normalizedName.includes("elite")) {
        purchasedPlan = "elite";
      }

      if (!purchasedPlan) {
        return res.status(400).json({
          success: false,
          message:
            "The subscription plan could not be identified from the package name.",
        });
      }

      const subscription = result.user.subscription || {};

      // Only return the current expiry date when the purchased plan
      // matches the user's current subscription.
      const isCurrentPlan = subscription.plan === purchasedPlan;

      return res.status(200).json({
        success: true,
        message: isCurrentPlan
          ? "Subscription payment verified successfully."
          : "Your payment was verified, but this is no longer your current subscription plan.",
        alreadyProcessed: result.alreadyProcessed,
        purchaseType: "subscription",
        packageName: packageData.name,
        plan: purchasedPlan,
        subscriptionStatus: isCurrentPlan
          ? subscription.status
          : "not_current",
        duration: packageData.duration,
        durationUnit: packageData.durationUnit,
        endDate: isCurrentPlan
          ? subscription.endDate || null
          : null,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Unsupported package type.",
    });
  } catch (error) {
    console.error("Payment return verification error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify the payment. Please try again.",
    });
  }
};