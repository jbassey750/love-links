const { getIO } = require("../socket/socketManager");

const User = require("../models/User");
const Like = require("../models/Like");
const Match = require("../models/Match");
const Chat = require("../models/Chat");
const createNotification = require("../utils/createNotification");

/**
 * Like a user or create a match
 */
exports.likeUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const { targetUserId } = req.body;

    // Validation
    if (!userId || !targetUserId) {
      return res.status(400).json({
        success: false,
        message: "Both user IDs are required.",
      });
    }

    // Cannot like yourself
    if (userId.toString() === targetUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot like yourself.",
      });
    }

    // Check users concurrently to save time
    const [user, targetUser] = await Promise.all([
      User.findById(userId),
      User.findById(targetUserId),
    ]);

    if (!user || !targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Already liked?
    const existingLike = await Like.findOne({
      fromUser: userId,
      toUser: targetUserId,
    });

    if (existingLike) {
      return res.status(400).json({
        success: false,
        status: existingLike.status,
        message: "You already liked this user.",
      });
    }

    // Has the other user liked me?
    const reverseLike = await Like.findOne({
      fromUser: targetUserId,
      toUser: userId,
    });

    

    // -------------------------------------------------
    // NO MATCH YET
    // -------------------------------------------------
    if (!reverseLike) {
      await Like.create({
        fromUser: userId,
        toUser: targetUserId,
        status: "pending",
      });

      // Notify the other user
      await createNotification({
        receiver: targetUserId,
        sender: userId,
        type: "like",
        title: "Someone liked you ❤️",
        message: `${user.fullName} liked your profile.`,
        data: {
          userId: userId,
        },
      });

      return res.status(200).json({
        success: true,
        status: "pending",
        message: "Like sent successfully.",
      });
    }

    // -------------------------------------------------
    // MUTUAL LIKE
    // -------------------------------------------------
    const existingMatch = await Match.findOne({
      users: { $all: [userId, targetUserId], $size: 2 },
    });

    if (existingMatch) {
      return res.status(400).json({
        success: false,
        status: "already-matched",
        message: "Users are already matched.",
        matchId: existingMatch._id,
        chatId: existingMatch.chatId,
      });
    }

    // Save current like
    await Like.create({
      fromUser: userId,
      toUser: targetUserId,
      status: "matched",
    });

    // Update reverse like atomically
    reverseLike.status = "matched";
    await reverseLike.save();

    // Create Match
    const match = await Match.create({
      users: [userId, targetUserId],
      status: "active",
    });

    // Create Chat
    const chat = await Chat.create({
      participants: [userId, targetUserId],
      match: match._id,
    });

    // Save chat inside match
    match.chatId = chat._id;
    await match.save();

    //socket.io emmited
    const io = getIO();

    io.to(userId.toString()).emit("new-match", {
      matchId: match._id,
      chatId: chat._id,
      user: targetUser,
    });

    io.to(targetUserId.toString()).emit("new-match", {
      matchId: match._id,
      chatId: chat._id,
      user,
    });

    // Send notifications to both users concurrently
    await Promise.all([
      createNotification({
        receiver: targetUserId,
        sender: userId,
        type: "match",
        title: "It's a Match! ❤️",
        message: `${user.fullName} matched with you.`,
        data: {
          matchId: match._id,
          chatId: chat._id,
        },
      }),
      createNotification({
        receiver: userId,
        sender: targetUserId,
        type: "match",
        title: "It's a Match! ❤️",
        message: `${targetUser.fullName} matched with you.`,
        data: {
          matchId: match._id,
          chatId: chat._id,
        },
      }),
    ]);

    return res.status(201).json({
      success: true,
      status: "matched",
      message: "Congratulations! It's a match.",
      matchId: match._id,
      chatId: chat._id,
      match,
      chat,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get all matches for a user
 */
exports.getMatches = async (req, res) => {
  try {
    const userId = req.user._id;

    const matches = await Match.find({
      users: userId,
      status: "active",
    })
      .populate({
        path: "users",
        select: "fullName age location photo badge bio status",
      })
      .populate("chatId")
      .populate("lastMessage");

    res.status(200).json({
      success: true,
      totalMatches: matches.length,
      matches,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Remove Match
 */
exports.removeMatch = async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findById(matchId);

    // Check match existence before reading properties
    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found.",
      });
    }

    // Verify user authorization
    const isParticipant = match.users.some(
      (id) => id.toString() === req.user._id.toString(),
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    match.status = "unmatched";
    match.unmatchedAt = new Date();
    await match.save();

    // Update both Like records
    await Like.updateMany(
      {
        $or: [
          { fromUser: match.users[0], toUser: match.users[1] },
          { fromUser: match.users[1], toUser: match.users[0] },
        ],
      },
      {
        status: "unmatched",
      },
    );

    // Deactivate associated chat room safely
    if (match.chatId) {
      await Chat.findByIdAndUpdate(match.chatId, {
        isActive: false,
      });
    }

    const io = getIO();

    match.users.forEach((userId) => {
      io.to(userId.toString()).emit("match-removed", {
        matchId: match._id,
        chatId: match.chatId,
      });
    });

    res.status(200).json({
      success: true,
      message: "Users unmatched successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get a single match by id
 */
exports.getMatch = async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findById(matchId)
      .populate({
        path: "users",
        select: "fullName age location photo badge bio status",
      })
      .populate("chatId")
      .populate("lastMessage");

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found.",
      });
    }

    const isParticipant = match.users.some(
      (u) => u._id.toString() === req.user._id.toString(),
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    res.status(200).json({
      success: true,
      match,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
