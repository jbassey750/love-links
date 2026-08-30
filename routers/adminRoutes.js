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

const {
  createPackage,
  getAllPackages,
  getPackageById,
  updatePackage,
  deletePackage,
  togglePackageStatus,
} = require("../controllers/packageController");

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

/*
|--------------------------------------------------------------------------
| PUBLIC ROUTES
|--------------------------------------------------------------------------
*/

// Get all packages
router.get("/veiw-all-packages",  getAllPackages);

// Get a single package
router.get("view-package/:id", getPackageById);

/*
|--------------------------------------------------------------------------
| ADMIN PACKAGS MANAGEMENT ROUTES
|--------------------------------------------------------------------------
*/

// Create package
router.post("/packages", protect, authorize("admin"), createPackage);

// Update package
router.put("/packages/:id", protect, authorize("admin"), updatePackage);

// Delete package
router.delete("/packages/:id", protect, authorize("admin"), deletePackage);

// Activate / deactivate package
router.patch("/packages/:id/status", protect, authorize("admin"), togglePackageStatus);

module.exports = router;
