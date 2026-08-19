const DatePlan = require("../models/DatePlan");
const User = require("../models/User");
const Match = require("../models/Match");
const Notification = require("../models/Notification");

// =====================================================
// HELPER: CHECK ACTIVE MATCH
// =====================================================
const checkActiveMatch = async (userId, partnerId) => {
  return await Match.findOne({
    users: {
      $all: [userId, partnerId],
    },
    status: "active",
  });
};

// =====================================================
// CREATE DATE
// POST /api/date-plans
// =====================================================
exports.createDate = async (req, res) => {
  try {
    const {
      partner,
      title,
      description,
      dateTime,
      location,
      reminderEnabled,
      reminderMinutesBefore,
    } = req.body;

    // -----------------------------
    // Validate required fields
    // -----------------------------
    if (!partner || !title || !dateTime) {
      return res.status(400).json({
        success: false,
        message: "Partner, title and date/time are required",
      });
    }

    // -----------------------------
    // Prevent dating yourself
    // -----------------------------
    if (partner.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot create a date with yourself",
      });
    }

    // -----------------------------
    // Check partner exists
    // -----------------------------
    const partnerUser = await User.findById(partner).select(
      "_id fullName username photo",
    );

    if (!partnerUser) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    // -----------------------------
    // Check active match
    // -----------------------------
    const match = await checkActiveMatch(req.user._id, partner);

    if (!match) {
      return res.status(403).json({
        success: false,
        message: "You can only create a date with your matched partner",
      });
    }

    // -----------------------------
    // Validate date/time
    // -----------------------------
    const plannedDate = new Date(dateTime);

    if (Number.isNaN(plannedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date/time",
      });
    }

    // Do not allow dates in the past
    if (plannedDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Date/time must be in the future",
      });
    }

    // -----------------------------
    // Create date
    // -----------------------------
    const datePlan = await DatePlan.create({
      creator: req.user._id,
      partner,
      title,
      description: description || "",
      dateTime: plannedDate,
      location: location || "",
      status: "pending",
      reminderEnabled: reminderEnabled !== undefined ? reminderEnabled : true,
      reminderMinutesBefore:
        reminderMinutesBefore !== undefined ? reminderMinutesBefore : 60,
      reminderSent: false,
    });

    // -----------------------------
    // Notification to partner
    // -----------------------------
    await Notification.create({
      receiver: partner,
      sender: req.user._id,
      type: "date",
      title: "New Date Plan",
      body: `You have received a new date plan: ${title}`,
      data: {
        datePlanId: datePlan._id,
      },
    });

    const populatedDate = await DatePlan.findById(datePlan._id)
      .populate("creator", "fullName username photo")
      .populate("partner", "fullName username photo");

    return res.status(201).json({
      success: true,
      message: "Date created successfully",
      datePlan: populatedDate,
    });
  } catch (error) {
    console.error("Create date error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create date",
      error: error.message,
    });
  }
};

// =====================================================
// GET SINGLE DATE
// GET /api/date-plans/:id
// =====================================================
exports.getDate = async (req, res) => {
  try {
    const { id } = req.params;

    const datePlan = await DatePlan.findById(id)
      .populate("creator", "fullName username photo")
      .populate("partner", "fullName username photo");

    if (!datePlan) {
      return res.status(404).json({
        success: false,
        message: "Date plan not found",
      });
    }

    const currentUserId = req.user._id.toString();

    const creatorId = datePlan.creator._id.toString();
    const partnerId = datePlan.partner._id.toString();

    // Only creator or partner can view
    if (currentUserId !== creatorId && currentUserId !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this date",
      });
    }

    return res.status(200).json({
      success: true,
      datePlan,
    });
  } catch (error) {
    console.error("Get date error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get date",
      error: error.message,
    });
  }
};

// =====================================================
// GET UPCOMING DATES
// GET /api/date-plans/upcoming
// =====================================================
exports.getUpcomingDates = async (req, res) => {
  try {
    const now = new Date();

    const dates = await DatePlan.find({
      $or: [{ creator: req.user._id }, { partner: req.user._id }],
      dateTime: {
        $gt: now,
      },
      status: {
        $nin: ["cancelled", "declined", "completed"],
      },
    })
      .populate("creator", "fullName username photo")
      .populate("partner", "fullName username photo")
      .sort({ dateTime: 1 });

    return res.status(200).json({
      success: true,
      count: dates.length,
      dates,
    });
  } catch (error) {
    console.error("Get upcoming dates error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get upcoming dates",
      error: error.message,
    });
  }
};

// =====================================================
// GET PAST DATES
// GET /api/date-plans/past
// =====================================================
exports.getPastDates = async (req, res) => {
  try {
    const now = new Date();

    const dates = await DatePlan.find({
      $and: [
        {
          $or: [{ creator: req.user._id }, { partner: req.user._id }],
        },
        {
          $or: [
            {
              dateTime: {
                $lt: now,
              },
            },
            {
              status: {
                $in: ["completed", "cancelled", "declined"],
              },
            },
          ],
        },
      ],
    })
      .populate("creator", "fullName username photo")
      .populate("partner", "fullName username photo")
      .sort({ dateTime: -1 });

    return res.status(200).json({
      success: true,
      count: dates.length,
      dates,
    });
  } catch (error) {
    console.error("Get past dates error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get past dates",
      error: error.message,
    });
  }
};

// =====================================================
// UPDATE DATE
// PUT /api/date-plans/:id
// =====================================================
exports.updateDate = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      title,
      description,
      dateTime,
      location,
      reminderEnabled,
      reminderMinutesBefore,
    } = req.body;

    const datePlan = await DatePlan.findById(id);

    if (!datePlan) {
      return res.status(404).json({
        success: false,
        message: "Date plan not found",
      });
    }

    // Only creator can update
    if (datePlan.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the creator can update this date",
      });
    }

    // Cannot update cancelled/completed dates
    if (["cancelled", "completed"].includes(datePlan.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update a ${datePlan.status} date`,
      });
    }

    // -----------------------------
    // Update title
    // -----------------------------
    if (title !== undefined) {
      datePlan.title = title;
    }

    // -----------------------------
    // Update description
    // -----------------------------
    if (description !== undefined) {
      datePlan.description = description;
    }

    // -----------------------------
    // Update date/time
    // -----------------------------
    if (dateTime !== undefined) {
      const newDate = new Date(dateTime);

      if (Number.isNaN(newDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date/time",
        });
      }

      if (newDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "Date/time must be in the future",
        });
      }

      datePlan.dateTime = newDate;

      // New date requires a new reminder
      datePlan.reminderSent = false;
    }

    // -----------------------------
    // Update location
    // -----------------------------
    if (location !== undefined) {
      datePlan.location = location;
    }

    // -----------------------------
    // Update reminder
    // -----------------------------
    if (reminderEnabled !== undefined) {
      datePlan.reminderEnabled = reminderEnabled;

      if (reminderEnabled === true) {
        datePlan.reminderSent = false;
      }
    }

    if (reminderMinutesBefore !== undefined) {
      datePlan.reminderMinutesBefore = reminderMinutesBefore;

      datePlan.reminderSent = false;
    }

    await datePlan.save();

    // Notify partner about update
    await Notification.create({
      receiver: datePlan.partner,
      sender: req.user._id,
      type: "date",
      title: "Date Plan Updated",
      body: `Your date plan "${datePlan.title}" has been updated.`,
      data: {
        datePlanId: datePlan._id,
      },
    });

    const updatedDate = await DatePlan.findById(id)
      .populate("creator", "fullName username photo")
      .populate("partner", "fullName username photo");

    return res.status(200).json({
      success: true,
      message: "Date updated successfully",
      datePlan: updatedDate,
    });
  } catch (error) {
    console.error("Update date error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update date",
      error: error.message,
    });
  }
};

// =====================================================
// ACCEPT DATE
// PATCH /api/date-plans/:id/accept
// =====================================================
exports.acceptDate = async (req, res) => {
  try {
    const { id } = req.params;

    const datePlan = await DatePlan.findById(id);

    if (!datePlan) {
      return res.status(404).json({
        success: false,
        message: "Date plan not found",
      });
    }

    // Only partner can accept
    if (datePlan.partner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the invited partner can accept this date",
      });
    }

    if (datePlan.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "This date is no longer pending",
      });
    }

    datePlan.status = "accepted";

    await datePlan.save();

    await Notification.create({
      receiver: datePlan.creator,
      sender: req.user._id,
      type: "date",
      title: "Date Accepted",
      body: `Your date plan "${datePlan.title}" was accepted.`,
      data: {
        datePlanId: datePlan._id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Date accepted successfully",
      datePlan,
    });
  } catch (error) {
    console.error("Accept date error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to accept date",
      error: error.message,
    });
  }
};

// =====================================================
// DECLINE DATE
// PATCH /api/date-plans/:id/decline
// =====================================================
exports.declineDate = async (req, res) => {
  try {
    const { id } = req.params;

    const datePlan = await DatePlan.findById(id);

    if (!datePlan) {
      return res.status(404).json({
        success: false,
        message: "Date plan not found",
      });
    }

    // Only partner can decline
    if (datePlan.partner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the invited partner can decline this date",
      });
    }

    if (datePlan.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "This date is no longer pending",
      });
    }

    datePlan.status = "declined";

    await datePlan.save();

    await Notification.create({
      receiver: datePlan.creator,
      sender: req.user._id,
      type: "date",
      title: "Date Declined",
      body: `Your date plan "${datePlan.title}" was declined.`,
      data: {
        datePlanId: datePlan._id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Date declined successfully",
      datePlan,
    });
  } catch (error) {
    console.error("Decline date error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to decline date",
      error: error.message,
    });
  }
};

// =====================================================
// CANCEL DATE
// PATCH /api/date-plans/:id/cancel
// =====================================================
exports.cancelDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;

    const datePlan = await DatePlan.findById(id);

    if (!datePlan) {
      return res.status(404).json({
        success: false,
        message: "Date plan not found",
      });
    }

    // Creator or partner can cancel
    const isCreator = datePlan.creator.toString() === req.user._id.toString();

    const isPartner = datePlan.partner.toString() === req.user._id.toString();

    if (!isCreator && !isPartner) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to cancel this date",
      });
    }

    if (["cancelled", "completed", "declined"].includes(datePlan.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a ${datePlan.status} date`,
      });
    }

    datePlan.status = "cancelled";
    datePlan.cancelledAt = new Date();
    datePlan.cancellationReason = cancellationReason || "";

    await datePlan.save();

    // Notify the other person
    const receiver = isCreator ? datePlan.partner : datePlan.creator;

    await Notification.create({
      receiver,
      sender: req.user._id,
      type: "date",
      title: "Date Cancelled",
      body: `The date "${datePlan.title}" has been cancelled.`,
      data: {
        datePlanId: datePlan._id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Date cancelled successfully",
      datePlan,
    });
  } catch (error) {
    console.error("Cancel date error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel date",
      error: error.message,
    });
  }
};

// =====================================================
// DELETE DATE
// DELETE /api/date-plans/:id
// =====================================================
exports.deleteDate = async (req, res) => {
  try {
    const { id } = req.params;

    const datePlan = await DatePlan.findById(id);

    if (!datePlan) {
      return res.status(404).json({
        success: false,
        message: "Date plan not found",
      });
    }

    // Only creator can permanently delete
    if (datePlan.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the creator can delete this date",
      });
    }

    await DatePlan.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Date deleted successfully",
    });
  } catch (error) {
    console.error("Delete date error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete date",
      error: error.message,
    });
  }
};

// =====================================================
// MARK DATE AS COMPLETED
// PATCH /api/date-plans/:id/complete
// =====================================================
exports.completeDate = async (req, res) => {
  try {
    const { id } = req.params;

    const datePlan = await DatePlan.findById(id);

    if (!datePlan) {
      return res.status(404).json({
        success: false,
        message: "Date plan not found",
      });
    }

    const isCreator = datePlan.creator.toString() === req.user._id.toString();

    const isPartner = datePlan.partner.toString() === req.user._id.toString();

    if (!isCreator && !isPartner) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to complete this date",
      });
    }

    if (datePlan.status !== "accepted") {
      return res.status(400).json({
        success: false,
        message: "Only accepted dates can be marked as completed",
      });
    }

    datePlan.status = "completed";

    await datePlan.save();

    const receiver = isCreator ? datePlan.partner : datePlan.creator;

    await Notification.create({
      receiver,
      sender: req.user._id,
      type: "date",
      title: "Date Completed",
      body: `Your date "${datePlan.title}" has been marked as completed.`,
      data: {
        datePlanId: datePlan._id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Date marked as completed",
      datePlan,
    });
  } catch (error) {
    console.error("Complete date error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to complete date",
      error: error.message,
    });
  }
};
