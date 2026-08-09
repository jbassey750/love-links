const express = require("express");
const router = express.Router();

const protect = require("../middleware/auth");
const { updateLocation } = require("../controllers/updateLocationController");

router.patch("/", protect, updateLocation);

module.exports = router;