const express = require("express");

const router = express.Router();

const {
  flutterwaveWebhook,
} = require("../controllers/webhookController");

// Flutterwave webhook
router.post("/flutterwave", flutterwaveWebhook);

module.exports = router;