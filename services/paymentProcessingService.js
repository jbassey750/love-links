const mongoose = require("mongoose");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Package = require("../models/Package");
const Notification = require("../models/Notification");

const { getIO } = require("../socket/socketManager");

exports.processVerifiedPayment = async (transaction) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const txRef = transaction.tx_ref;

    const payment = await Payment.findOne({ txRef }).session(session);

    if (!payment) {
      throw new Error("Payment record not found.");
    }

    // Prevent duplicate processing
    if (payment.status === "completed") {
      await session.commitTransaction();

      return {
        alreadyProcessed: true,
        payment,
        user: await User.findById(payment.user),
      };
    }

    if (payment.status !== "pending") {
      throw new Error(
        `Cannot process payment with status '${payment.status}'.`
      );
    }

    // Verify payment metadata
    if (
      transaction.meta?.paymentId &&
      transaction.meta.paymentId !== payment._id.toString()
    ) {
      throw new Error("Payment ownership mismatch.");
    }

    if (
      transaction.meta?.userId &&
      transaction.meta.userId !== payment.user.toString()
    ) {
      throw new Error("Payment user mismatch.");
    }

    if (transaction.tx_ref !== payment.txRef) {
      throw new Error("Transaction reference mismatch.");
    }

    const pointPackage = await Package.findById(
      payment.pointPackage
    ).session(session);

    if (!pointPackage) {
      throw new Error("Point package not found.");
    }

    if (Number(transaction.amount) !== Number(payment.amount)) {
      throw new Error("Payment amount mismatch.");
    }

    if (transaction.currency !== payment.currency) {
      throw new Error("Payment currency mismatch.");
    }

    const user = await User.findById(payment.user).session(session);

    if (!user) {
      throw new Error("User not found.");
    }

    if (
      (transaction.customer?.email || "").toLowerCase() !==
      (user.email || "").toLowerCase()
    ) {
      throw new Error("Payment customer mismatch.");
    }

    // -----------------------------------------
    // 1. ADD POINTS TO USER
    // -----------------------------------------

    user.points += payment.pointsPurchased;

    await user.save({ session });

    // -----------------------------------------
    // 2. UPDATE PAYMENT
    // -----------------------------------------

    payment.status = "completed";
    payment.transactionId = String(transaction.id);
    payment.flutterwaveTransactionId = String(transaction.id);

    if (transaction.authorization?.url) {
      payment.receiptUrl = transaction.authorization.url;
    }

    await payment.save({ session });

    // -----------------------------------------
    // 3. CREATE NOTIFICATION
    // -----------------------------------------

    const notification = await Notification.create(
      [
        {
          receiver: user._id,
          type: "system",
          title: "Points Added",
          body: `Your payment was successful. ${
            payment.pointsPurchased
          } chat ${
            payment.pointsPurchased === 1 ? "point has" : "points have"
          } been added to your account. You can now use them to chat with people on Enamora.`,
          isRead: false,
        },
      ],
      { session }
    );

    // -----------------------------------------
    // 4. COMMIT EVERYTHING
    // -----------------------------------------

    await session.commitTransaction();

    // -----------------------------------------
    // 5. SEND REAL-TIME NOTIFICATION
    // -----------------------------------------

    try {
      const io = getIO();

      io.to(user._id.toString()).emit("notification-created", {
        notification: notification[0],
      });
    } catch (socketError) {
      // Do not fail the payment if Socket.IO has an issue.
      console.error(
        "Socket notification failed:",
        socketError.message
      );
    }

    return {
      alreadyProcessed: false,
      payment,
      user,
      notification: notification[0],
    };
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    throw error;
  } finally {
    await session.endSession();
  }
};