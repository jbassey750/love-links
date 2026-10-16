
const mongoose = require("mongoose");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Package = require("../models/Package");
const Notification = require("../models/Notification");
const { getIO } = require("../socket/socketManager");

exports.processVerifiedPayment = async (transaction) => {
  const txRef = transaction.tx_ref;

  if (!txRef) {
    throw new Error("Payment reference is missing.");
  }

  if (transaction.status !== "successful") {
    throw new Error("Payment transaction was not successful.");
  }

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(
      async () => {
        const payment = await Payment.findOne({
          txRef,
          paymentGateway: "flutterwave",
        }).session(session);

        if (!payment) {
          throw new Error("Payment record not found.");
        }

        if (transaction.tx_ref !== payment.txRef) {
          throw new Error("Transaction reference mismatch.");
        }

        if (Number(transaction.amount) !== Number(payment.amount)) {
          throw new Error("Payment amount mismatch.");
        }

        if (transaction.currency !== payment.currency) {
          throw new Error("Payment currency mismatch.");
        }

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

        // A previously completed payment must never credit points again.
        if (payment.status === "completed") {
          const existingUser = await User.findById(payment.user)
            .session(session);

          result = {
            alreadyProcessed: true,
            payment,
            user: existingUser,
            notification: null,
          };
          return;
        }

        if (payment.status !== "pending") {
          throw new Error(
            `Cannot process payment with status '${payment.status}'.`
          );
        }

        const pointPackage = await Package.findById(
          payment.pointPackage
        ).session(session);

        if (!pointPackage) {
          throw new Error("Point package not found.");
        }

        const user = await User.findById(payment.user).session(session);

        if (!user) {
          throw new Error("User not found.");
        }

        // Email differences are logged, but do not alone reject a
        // transaction that has passed server-side payment validation.
        const flutterwaveEmail = (
          transaction.customer?.email || ""
        ).toLowerCase().trim();

        const userEmail = (user.email || "").toLowerCase().trim();

        if (flutterwaveEmail && userEmail &&
            flutterwaveEmail !== userEmail) {
          console.warn(
            "[Payment] Customer email differs from Enamora account email."
          );
        }

        user.points = (Number(user.points) || 0) +
          Number(payment.pointsPurchased);

        await user.save({ session });

        payment.status = "completed";
        payment.transactionId = String(transaction.id);
        payment.flutterwaveTransactionId = String(transaction.id);

        if (transaction.authorization?.url) {
          payment.receiptUrl = transaction.authorization.url;
        }

        await payment.save({ session });

        const notifications = await Notification.create(
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

        result = {
          alreadyProcessed: false,
          payment,
          user,
          notification: notifications[0],
        };
      },
      {
        readPreference: "primary",
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }
    );

    // Emit only after the database transaction has committed.
    if (!result.alreadyProcessed && result.notification) {
      try {
        getIO()
          .to(result.user._id.toString())
          .emit("notification-created", {
            notification: result.notification,
          });
      } catch (socketError) {
        console.error(
          "Socket notification failed:",
          socketError.message
        );
      }
    }

    return result;
  } finally {
    await session.endSession();
  }
};
