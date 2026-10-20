const express = require("express");

const router = express.Router();

const upload = require("../middleware/upload");

const protect  = require("../middleware/auth");

const {
  signup,
  login,
  logout,
  moderatorLogin,
   forgotPassword,
  resetPassword,
} = require("../controllers/authController"); 

router.post(
  "/signup",
  upload.single("photo"), 
  signup,
);

router.post("/login", login);

router.post("/moderator-login", moderatorLogin);

// Logout
// POST /api/auth/logout
router.post("/logout", protect, logout);


// Password reset
router.post("/forgot-password", forgotPassword);

router.post("/reset-password/:token", resetPassword);

module.exports = router;