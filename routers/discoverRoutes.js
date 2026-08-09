const express = require("express");
const router = express.Router();

const protect  = require("../middleware/auth");
const {
  getDiscoverUsers,
  getDiscoverProfile,
} = require("../controllers/discoverController");

// Get users for Discover page
router.get("/", protect, getDiscoverUsers);

// Get a single user's profile
router.get("/:userId", protect, getDiscoverProfile);

module.exports = router;