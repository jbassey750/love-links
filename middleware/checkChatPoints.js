const User = require("../models/User");
const pointCost = require("../config/pointCost");

const hasActivePremiumSubscription = (user) => {
  const subscription = user.subscription;

  if (
    !["premium", "elite"].includes(subscription?.plan) ||
    subscription?.status !== "active"
  ) {
    return false;
  }

  return !subscription.endDate || new Date(subscription.endDate) > new Date();
};

module.exports = async (req, res, next) => {
  try {
    const messageType =
      typeof req.body?.messageType === "string" ? req.body.messageType : "";

    const type = messageType || (req.file ? "image" : "text");
    const cost = pointCost[type];

    if (typeof cost !== "number" || cost < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid message type.",
      });
    }

    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required to send messages.",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const isFreeToChat =
      user.role === "admin" ||
      user.role === "premium" ||
      hasActivePremiumSubscription(user);

    const points = Number(user.points);

    if (!isFreeToChat && (!Number.isFinite(points) || points < cost)) {
      return res.status(403).json({
        success: false,
        message:
          "You don't have enough chat points. Please purchase more points.",
      });
    }

    req.chatPointCost = isFreeToChat ? 0 : cost;
    req.chatMessageType = type;

    return next();
  } catch (error) {
    console.error("[Chat points] Verification failed", {
      stage,
      messageType: type,
      userId: req.user?._id?.toString?.(),
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to verify chat points.",
    });
  }
};
