const express = require("express");
const router = express.Router();

const {
  createDiaryEntry,
  getDiaryEntries,
  getDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  shareDiaryEntry,
} = require("../controllers/diaryController"); 

const protect = require("../middleware/auth");

// =====================================================
// DIARY ROUTES
// =====================================================

// Create diary entry
// POST /api/diary
router.post("/", protect, createDiaryEntry);

// Get logged-in user's diary entries
// GET /api/diary
router.get("/", protect, getDiaryEntries);

// Get single diary entry
// GET /api/diary/:id
router.get("/:id", protect, getDiaryEntry);

// Update diary entry
// PUT /api/diary/:id
router.put("/:id", protect, updateDiaryEntry);

// Delete diary entry
// DELETE /api/diary/:id
router.delete("/:id", protect, deleteDiaryEntry);

// Share / unshare diary entry with matched partner
// PATCH /api/diary/:id/share
router.patch("/:id/share", protect, shareDiaryEntry);

module.exports = router;