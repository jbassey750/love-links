const Chat = require("../models/Chat");
const { publishToUser } = require("../services/realtimeEventService");
const Message = require("../models/Message");
const User = require("../models/User");
const FakeAccountAssignment = require("../models/FakeAccountAssignment");
const createNotification = require("../utils/createNotification");
const { checkExpiredAssignments } = require("../services/assignmentExpiryService");

const REPLY_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

exports.getAssignedChats = async (req, res) => {
  try {
    const moderatorId = req.user._id;
    await checkExpiredAssignments();
    const now = new Date();
    const assignments = await FakeAccountAssignment.find({
      moderator: moderatorId,
      status: "active",
      respondedAt: null,
      expiresAt: { $gt: now },
    })
      .populate("fakeUser", "-password -phone -email")
      .populate("realUser", "-password -phone -email")
      .sort({ assignedAt: -1 });

    const chats = await Promise.all(
      assignments.map(async (assignment) => {
        const chat = await Chat.findOne({
          participants: {
            $all: [assignment.fakeUser._id, assignment.realUser._id],
          },
          isActive: true,
        }).populate("lastMessage");

        return {
          assignmentId: assignment._id,
          fakeUser: assignment.fakeUser,
          realUser: assignment.realUser,
          status: assignment.status,
          assignedAt: assignment.assignedAt,
          expiresAt: assignment.expiresAt,
          respondedAt: assignment.respondedAt,
          chatId: chat?._id || null,
          lastMessage: chat?.lastMessage || null,
          lastMessageAt: chat?.lastMessageAt || null,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      total: chats.length,
      chats,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// Moderator replies as a fake account
// ====================================================== 
exports.replyAsFakeUser = async (req, res) => {
  try {
    const moderatorId = req.user._id;

    const { assignmentId, message, messageType = "text" } = req.body;

    if (!assignmentId || !message) {
      return res.status(400).json({
        success: false,
        message: "assignmentId and message are required.",
      });
    }

    // Find assignment
    const assignment = await FakeAccountAssignment.findById(assignmentId)
      .populate("chat")
      .populate("fakeUser")
      .populate("realUser");

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    // Verify moderator owns this assignment
    if (assignment.moderator.toString() !== moderatorId.toString()) {
      return res.status(403).json({
        success: false,
        message: "This conversation is not assigned to you.",
      });
    }

    // Verify assignment is active
    if (assignment.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Assignment is no longer active.",
      });
    }

    const claimTime = new Date();
    if (assignment.expiresAt && claimTime >= new Date(assignment.expiresAt)) {
      return res.status(410).json({
        success: false,
        code: "CHAT_EXPIRED",
        message:
          "Your chat session has expired. This conversation will be reassigned to another moderator.",
      });
    }

    const staleClaimBefore = new Date(
      claimTime.getTime() - REPLY_CLAIM_TIMEOUT_MS,
    );
    const claimedAssignment = await FakeAccountAssignment.findOneAndUpdate(
      {
        _id: assignment._id,
        moderator: moderatorId,
        status: "active",
        expiresAt: { $gt: claimTime },
        $or: [
          { replyClaimedAt: null },
          { replyClaimedAt: { $lte: staleClaimBefore } },
        ],
      },
      { $set: { replyClaimedAt: claimTime } },
      { new: true },
    );

    if (!claimedAssignment) {
      const currentAssignment = await FakeAccountAssignment.findById(
        assignment._id,
      ).select("moderator status expiresAt");
      if (!currentAssignment) {
        return res.status(404).json({
          success: false,
          message: "Assignment not found.",
        });
      }
      if (currentAssignment.moderator.toString() !== moderatorId.toString()) {
        return res.status(403).json({
          success: false,
          message: "This conversation is not assigned to you.",
        });
      }
      if (currentAssignment.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "Assignment is no longer active.",
        });
      }
      if (new Date() >= new Date(currentAssignment.expiresAt)) {
        return res.status(410).json({
          success: false,
          code: "CHAT_EXPIRED",
          message:
            "Your chat session has expired. This conversation will be reassigned to another moderator.",
        });
      }
      return res.status(409).json({
        success: false,
        message: "A reply is already being processed for this assignment.",
      });
    }

    // Save message
    let newMessage;
    let completionTime;
    try {
      newMessage = await Message.create({
        chat: assignment.chat._id,

        // The fake profile being represented
        sender: assignment.fakeUser._id,

        // The real user receiving the message
        receiver: assignment.realUser._id,

        // The actual moderator who typed the message
        moderator: moderatorId,

        message,
        messageType,
      });

      completionTime = new Date();
      const completedAssignment = await FakeAccountAssignment.findOneAndUpdate(
        {
          _id: assignment._id,
          moderator: moderatorId,
          status: "active",
          expiresAt: { $gt: completionTime },
          replyClaimedAt: claimTime,
        },
        {
          $set: {
            status: "closed",
            respondedAt: completionTime,
            releasedAt: completionTime,
            replyClaimedAt: null,
          },
        },
        { new: true },
      );

      if (!completedAssignment) {
        await Message.findByIdAndDelete(newMessage._id);
        await FakeAccountAssignment.updateOne(
          {
            _id: assignment._id,
            moderator: moderatorId,
            status: "active",
            replyClaimedAt: claimTime,
          },
          { $set: { replyClaimedAt: null } },
        );
        const latestAssignment = await FakeAccountAssignment.findById(
          assignment._id,
        ).select("status expiresAt");
        if (latestAssignment?.status === "active") {
          return res.status(410).json({
            success: false,
            code: "CHAT_EXPIRED",
            message:
              "Your chat session has expired. This conversation will be reassigned to another moderator.",
          });
        }
        return res.status(409).json({
          success: false,
          message: "Assignment is no longer available.",
        });
      }
    }
    catch (error) {
      await FakeAccountAssignment.updateOne(
        {
          _id: assignment._id,
          moderator: moderatorId,
          status: "active",
          replyClaimedAt: claimTime,
        },
        { $set: { replyClaimedAt: null } },
      );
      throw error;
    }

    await publishToUser(moderatorId, "assignment-completed", {
      assignmentId: assignment._id,
      chatId: assignment.chat._id,
      respondedAt: completionTime,
      releasedAt: completionTime,
    }).catch((eventError) => {
      console.warn(
        "[Moderator] Failed to publish assignment completion:",
        eventError.message,
      );
    });

    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "fullName username photo badge")
      .populate("receiver", "fullName username photo badge")
      .populate("moderator", "fullName username photo");

    // Update chat
    await Chat.updateOne(
      {
        _id: assignment.chat._id,
        $or: [
          { lastMessageAt: null },
          { lastMessageAt: { $lt: newMessage.createdAt } },
          {
            lastMessageAt: newMessage.createdAt,
            lastMessage: { $lt: newMessage._id },
          },
          {
            lastMessageAt: newMessage.createdAt,
            lastMessage: null,
          },
        ],
      },
      {
        $set: {
          lastMessage: newMessage._id,
          lastMessageAt: newMessage.createdAt,
        },
      },
    );

    // Socket
    await publishToUser(
      assignment.realUser._id,
      "new-message",
      populatedMessage,
    );

    // ==========================================
    // Create notification for real/premium user
    // ==========================================

    try {
      await createNotification({
        receiver: assignment.realUser._id,
        sender: assignment.fakeUser._id,
        type: "message",
        title: "New Message",
        message: `${assignment.fakeUser.fullName || "Someone"} sent you a message.`,
        data: {
          chatId: assignment.chat._id,
          messageId: newMessage._id,
          message: newMessage.message,
          messageType: newMessage.messageType,
          senderName: assignment.fakeUser.fullName,
        },
      });

      console.log(
        "✅ Notification created for:",
        assignment.realUser._id.toString(),
      );
    } catch (notificationError) {
      console.error(
        "❌ Failed to create message notification:",
        notificationError,
      );
    }

    return res.status(201).json({
      success: true,
      message: "Reply sent successfully.",
      data: populatedMessage,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
