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
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check if user has enough points
    if (user.points < cost) {
      return res.status(403).json({
        success: false,
        message: "You don't have enough chat points. Please purchase more points.",
      });
    }

    // Make the cost available to the controller if needed later
    req.chatPointCost = cost;

    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to verify chat points.",
    });
  }
};