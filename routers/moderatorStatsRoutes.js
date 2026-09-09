const express = require("express");
const router = express.Router();

const protect = require("../middleware/auth");
const requireModerator = require("../middleware/requireModerator");

const {
  getModeratorStats,
} = require("../controllers/moderatorStatsController");

// Moderator statistics
router.get(
  "/stats",
  protect,
  requireModerator,
  getModeratorStats
);

module.exports = router;