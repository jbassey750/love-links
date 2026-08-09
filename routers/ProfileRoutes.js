const express = require("express");
const protect = require("../middleware/auth");
const upload = require("../middleware/upload");
const {
  getMyProfile,
  getPublicProfile,
  updateProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
} = require("../controllers/profileController");

const router = express.Router();

router.get("/me", protect, getMyProfile);
router.get("/:userId", protect, getPublicProfile);
router.put("/me", protect, upload.single("photo"), updateProfile);
router.post("/me/upload-photo", protect, upload.single("photo"), uploadProfilePhoto);
router.delete("/me/photo", protect, deleteProfilePhoto);

module.exports = router;