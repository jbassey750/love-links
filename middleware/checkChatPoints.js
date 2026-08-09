const User = require("../models/User");
const pointCost = require("../config/pointCost");

module.exports = async (req, res, next) => {
  try {
    const { messageType } = req.body;

    // Default to text if no messageType is provided
    const type = messageType || "text";

    // Determine the cost of this message
    const cost = pointCost[type];

    if (cost === undefined) {
      return res.status(400).json({
        success: false,
        message: "Invalid message type.",
      });
    }

    // Get the latest user data
    const user = await User.findById(req.user._id);

    if (!user) {
      console.log("========== CHECK CHAT POINTS FAILED ==========");
      console.log("User not found for ID:", req.user._id);
      console.log("=============================================");
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    console.log("========== CHECK CHAT POINTS ==========");
    console.log("User:", user.fullName || user.email || user._id.toString());
    console.log("Role:", user.role);
    console.log("Points:", user.points);
    console.log("Message Type:", type);
    console.log("Message Cost:", cost);
    console.log("=======================================");

    // ==========================================
    // Admin and Premium users chat for free
    // ==========================================
    if (user.role === "admin" || user.role === "premium") {
      req.chatPointCost = 0;
      return next();
    }

    // ==========================================
    // Regular users must have enough points
    // ==========================================
    if (user.points < cost) {
      return res.status(403).json({
        success: false,
        message:
          "You don't have enough chat points. Please purchase more points.",
      });
    }

    // Make the cost available to the controller
    req.chatPointCost = cost;

    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to verify chat points.",
    });
  }
};
