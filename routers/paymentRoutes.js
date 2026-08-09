const express = require("express");

const router = express.Router();

const protect = require("../middleware/auth");

const {
  initializeCheckout,
  verifyCheckout,
} = require("../controllers/paymentController"); 

/**
 * Initialize Flutterwave Checkout
 * POST /api/payments/checkout
 */
router.post(
  "/checkout",
  protect,
  initializeCheckout
);

/**
 * Verify Flutterwave Payment
 * GET /api/payments/verify
 */
router.get(
  "/verify",
  protect,
  verifyCheckout
);

module.exports = router;