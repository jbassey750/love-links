const express = require("express");
const router = express.Router();

const { getAllPackages } = require("../controllers/packageController");

// Public route - users can view active packages
router.get("/", getAllPackages);

module.exports = router;