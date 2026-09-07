const express = require("express");
const router = express.Router();

const protect = require("../middleware/auth");

const { createPackage } = require("../controllers/packageController");
const authorize = require("../middleware/authorize");

router.post(
  "/create",
  protect,
  authorize("admin"),
  createPackage
);

module.exports = router;