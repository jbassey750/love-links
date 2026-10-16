const express = require("express");

const router = express.Router();

const protect = require("../middleware/auth");

const {
  initializeCheckout,
  verifyCheckout,
  verifyCheckoutReturn,
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

/**
 * Verify the hosted-checkout browser return without relying on browser auth.
 * POST /api/payments/return/verify
 */
router.post(
  "/return/verify",
  verifyCheckoutReturn
);

module.exports = router;