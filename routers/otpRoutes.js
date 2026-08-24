const express = require("express");

const router = express.Router();
const protect = require("../middleware/auth");

const {
  verifyOTP,
  sendOTP,
} = require("../controllers/otpController");

router.post("/send", sendOTP);
router.post("/verify", verifyOTP);
// router.post("/resend", resendOTP);

module.exports = router; 