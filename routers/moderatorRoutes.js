const express = require("express");
const protect = require("../middleware/auth");
const requireModerator = require("../middleware/requireModerator");

const {
  getAssignedChats,
  replyAsFakeUser,
} = require("../controllers/moderatorController");

const router = express.Router();

// Get chats assigned to the logged-in moderator
router.get("/assignments", protect, requireModerator, getAssignedChats);

// Moderator replies as the fake account
router.post("/reply", protect, requireModerator, replyAsFakeUser); 

module.exports = router;