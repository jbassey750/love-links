const { getIO } = require("../socket/socketManager");
const Notification = require("../models/Notification");

/**
 * Get Logged-in User Notifications
 */
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      receiver: req.user._id,
    })

      .populate("sender", "fullName photo")

      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,

      total: notifications.length,

      notifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

/**
 * Mark Notification As Read
 */
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOne({
      _id: notificationId,

      receiver: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,

        message: "Notification not found.",
      });
    }

    notification.isRead = true;

    await notification.save();

    const io = getIO();

    io.to(req.user._id.toString()).emit("notification-read", {
      notificationId: notification._id,
    });

    res.status(200).json({
      success: true,

      message: "Notification marked as read.",

      notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

/**
 * Mark All Notifications As Read
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        receiver: req.user._id,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
        },
      },
    );

    const io = getIO();

    io.to(req.user._id.toString()).emit("all-notifications-read");

    res.status(200).json({
      success: true,
      updated: result.modifiedCount,
      message: "All notifications marked as read.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

/**
 * Delete Notification
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,

      receiver: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,

        message: "Notification not found.",
      });
    }

    const io = getIO();
    io.to(req.user._id.toString()).emit("notification-deleted", {
      notificationId,
    });

    res.status(200).json({
      success: true,

      message: "Notification deleted.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      receiver: req.user._id,

      isRead: false,
    });

    res.json({
      success: true,

      unread: count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
