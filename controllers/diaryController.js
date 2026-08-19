const Diary = require("../models/Diary");
const User = require("../models/User");
const Match = require("../models/Match");

// =====================================================
// CREATE DIARY ENTRY
// POST /api/diary
// =====================================================
exports.createDiaryEntry = async (req, res) => {
  try {
    const { title, content, mood, isPrivate } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required",
      });
    }

    const diary = await Diary.create({
      user: req.user._id,
      title,
      content,
      mood: mood || "other",
      isPrivate: isPrivate !== undefined ? isPrivate : true,
      isShared: false,
      sharedWith: null,
    });

    return res.status(201).json({
      success: true,
      message: "Diary entry created successfully",
      diary,
    });
  } catch (error) {
    console.error("Create diary error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create diary entry",
      error: error.message,
    });
  }
};

// =====================================================
// GET USER'S DIARY ENTRIES
// GET /api/diary
// =====================================================
exports.getDiaryEntries = async (req, res) => {
  try {
    const diaries = await Diary.find({
      $or: [
        { user: req.user._id },
        {
          sharedWith: req.user._id,
          isShared: true,
          isPrivate: false,
        },
      ],
    })
      .populate("user", "fullName username photo")
      .populate("sharedWith", "fullName username photo")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: diaries.length,
      diaries,
    });
  } catch (error) {
    console.error("Get diary entries error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get diary entries",
      error: error.message,
    });
  }
};

// =====================================================
// GET SINGLE DIARY ENTRY
// GET /api/diary/:id
// =====================================================
exports.getDiaryEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const diary = await Diary.findById(id)
      .populate("user", "fullName username photo")
      .populate("sharedWith", "fullName username photo");

    if (!diary) {
      return res.status(404).json({
        success: false,
        message: "Diary entry not found",
      });
    }

    const currentUserId = req.user._id.toString();
    const ownerId = diary.user._id.toString();

    const isOwner = currentUserId === ownerId;

    const isSharedPartner =
      diary.isShared &&
      !diary.isPrivate &&
      diary.sharedWith &&
      diary.sharedWith._id.toString() === currentUserId;

    if (!isOwner && !isSharedPartner) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this diary entry",
      });
    }

    return res.status(200).json({
      success: true,
      diary,
    });
  } catch (error) {
    console.error("Get single diary error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get diary entry",
      error: error.message,
    });
  }
};

// =====================================================
// UPDATE DIARY ENTRY
// PUT /api/diary/:id
// =====================================================
exports.updateDiaryEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, mood, isPrivate } = req.body;

    const diary = await Diary.findById(id);

    if (!diary) {
      return res.status(404).json({
        success: false,
        message: "Diary entry not found",
      });
    }

    // Only the owner can edit the diary
    if (diary.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the diary owner can update this entry",
      });
    }

    if (title !== undefined) {
      diary.title = title;
    }

    if (content !== undefined) {
      diary.content = content;
    }

    if (mood !== undefined) {
      diary.mood = mood;
    }

    if (isPrivate !== undefined) {
      diary.isPrivate = isPrivate;

      // If diary becomes private, automatically remove sharing
      if (isPrivate === true) {
        diary.isShared = false;
        diary.sharedWith = null;
      }
    }

    await diary.save();

    return res.status(200).json({
      success: true,
      message: "Diary entry updated successfully",
      diary,
    });
  } catch (error) {
    console.error("Update diary error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update diary entry",
      error: error.message,
    });
  }
};

// =====================================================
// DELETE DIARY ENTRY
// DELETE /api/diary/:id
// =====================================================
exports.deleteDiaryEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const diary = await Diary.findById(id);

    if (!diary) {
      return res.status(404).json({
        success: false,
        message: "Diary entry not found",
      });
    }

    // Only owner can delete
    if (diary.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the diary owner can delete this entry",
      });
    }

    await Diary.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Diary entry deleted successfully",
    });
  } catch (error) {
    console.error("Delete diary error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete diary entry",
      error: error.message,
    });
  }
};

// =====================================================
// SHARE / UNSHARE DIARY ENTRY
// PATCH /api/diary/:id/share
// =====================================================
// =====================================================
// SHARE / UNSHARE DIARY ENTRY
// PATCH /api/diary/:id/share
// =====================================================
exports.shareDiaryEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { partnerId, isShared } = req.body;

    // Find diary
    const diary = await Diary.findById(id);

    if (!diary) {
      return res.status(404).json({
        success: false,
        message: "Diary entry not found",
      });
    }

    // Only the owner can share/unshare the diary
    if (diary.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the diary owner can share this entry",
      });
    }

    // =================================================
    // UNSHARE DIARY
    // =================================================
    if (isShared === false) {
      diary.isShared = false;
      diary.sharedWith = null;

      // Make the diary private again
      diary.isPrivate = true;

      await diary.save();

      return res.status(200).json({
        success: true,
        message: "Diary entry is no longer shared",
        diary,
      });
    }

    // =================================================
    // SHARE DIARY
    // =================================================
    if (!partnerId) {
      return res.status(400).json({
        success: false,
        message: "partnerId is required when sharing a diary entry",
      });
    }

    // Prevent sharing with yourself
    if (partnerId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot share a diary entry with yourself",
      });
    }

    // Check that partner exists
    const partner = await User.findById(partnerId).select(
      "_id fullName username photo"
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    // =================================================
    // CHECK ACTIVE MATCH
    // =================================================

    const match = await Match.findOne({
      users: {
        $all: [req.user._id, partnerId],
      },
      status: "active",
    });

    if (!match) {
      return res.status(403).json({
        success: false,
        message: "You can only share diary entries with your matched partner",
      });
    }

    // =================================================
    // SHARE DIARY
    // =================================================

    diary.isPrivate = false;
    diary.isShared = true;
    diary.sharedWith = partnerId;

    await diary.save();

    return res.status(200).json({
      success: true,
      message: "Diary entry shared successfully with your partner",
      diary,
    });
  } catch (error) {
    console.error("Share diary error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to share diary entry",
      error: error.message,
    });
  }
};