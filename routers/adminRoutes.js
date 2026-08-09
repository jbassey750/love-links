const express = require("express");
const router = express.Router();

const protect = require("../middleware/auth");
const authorize = require("../middleware/authorize");

const {
  createPremiumUser,
  approveFakeLike,
  createModerator,
  createFakeAccount,
  likeUserWithFakeAccount,
  pokeMatchedUser,
  getAllActiveMatches,
  getAdminChat,
  startAdminConversation,
} = require("../controllers/adminController");

/**
 * ===============================
 * Admin Routes
 * ===============================
 */

// Create Premium User (Admin Only)
router.post(
  "/create-premium-user",
  protect,
  authorize("admin"),
  createPremiumUser,
);

// Create Fake Account
router.post("/fake-accounts", protect, authorize("admin"), createFakeAccount);

router.post(
  "/fake-likes/:likeId/approve",
  protect,
  authorize("admin"),
  approveFakeLike,
);

router.post(
  "/fake-accounts/:fakeUserId/like",
  protect,
  authorize("admin"),
  likeUserWithFakeAccount,
);

// Create Moderator
router.post("/moderators", protect, authorize("admin"), createModerator);

router.post(
  "/matches/:matchId/poke",
  protect,
  authorize("admin"),
  pokeMatchedUser,
);

router.get("/matches", protect, authorize("admin"), getAllActiveMatches);

router.get("/chats/:chatId", protect, authorize("admin"), getAdminChat);

router.post(
  "/matches/:matchId/start-conversation",
  protect,
  authorize("admin"),
  startAdminConversation,
);

module.exports = router;
