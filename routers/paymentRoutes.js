const express = require("express");
const router = express.Router();

const protect = require("../middleware/auth");
const paymentController = require("../controllers/paymentController");

router.post(
  "/create-checkout-session",
  protect,
  paymentController.createCheckoutSession
);

module.exports = router;