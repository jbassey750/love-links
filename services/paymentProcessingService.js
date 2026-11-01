const mongoose = require("mongoose");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Package = require("../models/Package");
const Notification = require("../models/Notification");
const { publishToUser } = require("./realtimeEventService");

/**
 * Map subscription package names to the subscription plans
 * supported by the User model.
 *
 * Package names must contain "Premium" or "Elite".
 */
const getSubscriptionPlan = (packageData) => {
  const packageName = String(packageData.name || "").toLowerCase();

  if (packageName.includes("elite")) {
    return "elite";
  }

  if (packageName.includes("premium")) {
    return "premium";
  }

  throw new Error(
    `Cannot determine the subscription plan from package name "${packageData.name}".`
  );
};

/**
 * Add a duration to a date.
 * Month-based subscriptions use calendar months, not fixed 30-day periods.
 * This also handles month-end dates correctly.
 */
const addDuration = (startDate, duration, durationUnit) => {
  const result = new Date(startDate);

  if (!Number.isFinite(Number(duration)) || Number(duration) <= 0) {
    throw new Error("The subscription duration is invalid.");
  }

  if (durationUnit === "days") {
    result.setDate(result.getDate() + Number(duration));
    return result;
  }

  if (durationUnit === "months") {
    const originalDay = result.getDate();

    // Move to the first day to avoid JavaScript month overflow.
    result.setDate(1);
    result.setMonth(result.getMonth() + Number(duration));

    // Keep the original day when possible, otherwise use the month's last day.
    const lastDayOfMonth = new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0
    ).getDate();

    result.setDate(Math.min(originalDay, lastDayOfMonth));

    return result;
  }

  throw new Error("The subscription duration unit is invalid.");
};

/**
 * Process a successfully verified Flutterwave payment.
 *
 * Points packages add points.
 * Subscription packages activate or renew a subscription.
 *
 * Both actions and the payment status update occur in one transaction.
 */
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

        if (
          String(transaction.currency || "").toUpperCase() !==
          String(payment.currency || "").toUpperCase()
        ) {
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

        // Do not apply the same successful payment twice.
        if (payment.status === "completed") {
          const existingUser = await User.findById(payment.user).session(
            session
          );

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

        const packageData = await Package.findById(
          payment.pointPackage
        ).session(session);

        if (!packageData) {
          throw new Error("Package not found.");
        }

        if (!packageData.isActive) {
          throw new Error("This package is no longer active.");
        }

        const user = await User.findById(payment.user).session(session);

        if (!user) {
          throw new Error("User not found.");
        }

        const flutterwaveEmail = (
          transaction.customer?.email || ""
        )
          .toLowerCase()
          .trim();

        const userEmail = (user.email || "").toLowerCase().trim();

        if (
          flutterwaveEmail &&
          userEmail &&
          flutterwaveEmail !== userEmail
        ) {
          console.warn(
            "[Payment] Flutterwave customer email differs from account email."
          );
        }

        let notificationTitle;
        let notificationBody;

        if (packageData.type === "points") {
          // Existing Buy Points behavior.
          const pointsToAdd = Number(payment.pointsPurchased);

          if (!Number.isFinite(pointsToAdd) || pointsToAdd <= 0) {
            throw new Error("The points package is not configured correctly.");
          }

          user.points = (Number(user.points) || 0) + pointsToAdd;
          await user.save({ session });

          notificationTitle = "Points Added";
          notificationBody =
            `Your payment was successful. ${pointsToAdd} chat point(s) ` +
            "have been added to your account. You can now use them to chat " +
            "with people on Enamora.";
        } else if (packageData.type === "subscription") {
          // Subscription package behavior.
          const subscriptionPlan = getSubscriptionPlan(packageData);
          const duration = Number(packageData.duration);
          const durationUnit = packageData.durationUnit;

          if (
            !Number.isFinite(duration) ||
            duration <= 0 ||
            !["days", "months"].includes(durationUnit)
          ) {
            throw new Error(
              "The subscription package is not configured correctly."
            );
          }

          const now = new Date();
          const currentSubscription = user.subscription || {};

          const currentEndDate = currentSubscription.endDate
            ? new Date(currentSubscription.endDate)
            : null;

          const isCurrentSubscriptionActive =
            currentSubscription.status === "active" &&
            currentEndDate &&
            !Number.isNaN(currentEndDate.getTime()) &&
            currentEndDate > now;

          const isRenewingSamePlan =
            isCurrentSubscriptionActive &&
            currentSubscription.plan === subscriptionPlan;

          if (isRenewingSamePlan) {
            // Extend the existing expiry date without losing remaining time.
            user.subscription.endDate = addDuration(
              currentEndDate,
              duration,
              durationUnit
            );
          } else {
            // New subscription, expired subscription, or plan change.
            user.subscription.startDate = now;
            user.subscription.endDate = addDuration(
              now,
              duration,
              durationUnit
            );
          }

          user.subscription.plan = subscriptionPlan;
          user.subscription.status = "active";
          user.subscription.autoRenew = false;

          await user.save({ session });

          const formattedExpiry = new Date(
            user.subscription.endDate
          ).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          notificationTitle = "Subscription Activated";
          notificationBody =
            `Your ${subscriptionPlan} subscription is now active. ` +
            `Your subscription expires on ${formattedExpiry}. ` +
            "You can chat without spending points while your subscription " +
            "is active.";
        } else {
          throw new Error("Unsupported package type.");
        }

        // Mark payment completed only after the relevant account update succeeds.
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
              title: notificationTitle,
              body: notificationBody,
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

    // Send the socket notification only after the transaction succeeds.
    if (!result.alreadyProcessed && result.notification) {
      try {
        await publishToUser(result.user._id, "notification-created", {
          notification: result.notification,
        });
      } catch (realtimeError) {
        console.error(
          "[Payment] Failed to publish notification:",
          realtimeError.message
        );
      }
    }

    return result;
  } finally {
    await session.endSession();
  }
};
