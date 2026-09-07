const Chat = require("../models/Chat");
const { getIO } = require("../socket/socketManager");
const Message = require("../models/Message");
const User = require("../models/User");
const FakeAccountAssignment = require("../models/FakeAccountAssignment");
const createNotification = require("../utils/createNotification");

exports.getAssignedChats = async (req, res) => {
  try {
    const moderatorId = req.user._id;

    const assignments = await FakeAccountAssignment.find({
      moderator: moderatorId,
      status: "active",
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

    // Verify assignment has not expired
    if (assignment.expiresAt && new Date() >= new Date(assignment.expiresAt)) {
      return res.status(410).json({
        success: false,
        code: "CHAT_EXPIRED",
        message:
          "Your chat session has expired. This conversation will be reassigned to another moderator.",
      });
    }

    // Save message
    const newMessage = await Message.create({
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

    // Record the moderator's first response
    if (!assignment.respondedAt) {
      await FakeAccountAssignment.findByIdAndUpdate(assignment._id, {
        respondedAt: new Date(),
      });
    }

    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "fullName username photo badge")
      .populate("receiver", "fullName username photo badge")
      .populate("moderator", "fullName username photo");

    // Update chat
    await Chat.findByIdAndUpdate(assignment.chat._id, {
      lastMessage: newMessage._id,
      lastMessageAt: new Date(),
    });

    // Socket
    const io = getIO();

    io.to(assignment.chat._id.toString()).emit("new-message", populatedMessage);

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
