const express = require("express");

const router = express.Router();

const protect = require("../middleware/auth");

const {
  getNotifications,

  markAsRead,

  getUnreadCount,
  
  markAllAsRead,

  deleteNotification,
} = require("../controllers/notificationController");

router.get("/", protect, getNotifications);

router.get("/unread-count", protect, getUnreadCount);

router.patch("/:notificationId/read", protect, markAsRead);

router.patch("/read-all", protect, markAllAsRead);

router.delete("/:notificationId", protect, deleteNotification);

module.exports = router;
