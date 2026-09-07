const express = require("express");
const router = express.Router();

const protect = require("../middleware/auth");

const {
	getAllPackages,
	getPackageById,
} = require("../controllers/packageController");

// Public route - users can view active packages
router.get("/", protect, getAllPackages);
router.get("/:id", protect, getPackageById);

module.exports = router;