const express = require("express");
const router = express.Router();

const {
  createDate,
  getDate,
  getUpcomingDates,
  getPastDates,
  updateDate,
  acceptDate,
  declineDate,
  cancelDate,
  deleteDate,
  completeDate,
} = require("../controllers/datePlanController"); 

const protect = require("../middleware/auth");

// =====================================================
// DATE PLANNER ROUTES
// =====================================================

// Create a new date
// POST /api/date-plans
router.post("/", protect, createDate);

// Get upcoming dates
// GET /api/date-plans/upcoming
router.get("/upcoming", protect, getUpcomingDates);

// Get past dates
// GET /api/date-plans/past
router.get("/past", protect, getPastDates);

// Get a single date
// GET /api/date-plans/:id
router.get("/:id", protect, getDate);

// Update a date
// PUT /api/date-plans/:id
router.put("/:id", protect, updateDate);

// Accept a date invitation
// PATCH /api/date-plans/:id/accept
router.patch("/:id/accept", protect, acceptDate);

// Decline a date invitation
// PATCH /api/date-plans/:id/decline
router.patch("/:id/decline", protect, declineDate);

// Cancel a date
// PATCH /api/date-plans/:id/cancel
router.patch("/:id/cancel", protect, cancelDate);

// Mark date as completed
// PATCH /api/date-plans/:id/complete
router.patch("/:id/complete", protect, completeDate);

// Permanently delete a date
// DELETE /api/date-plans/:id
router.delete("/:id", protect, deleteDate);

module.exports = router;