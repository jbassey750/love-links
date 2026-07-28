const express = require("express");
const router = express.Router();

const protect = require("../middleware/auth");

const { createPackage } = require("../controllers/pointPackageController");

router.post(
  "/create",
  protect,
  createPackage
);

module.exports = router;