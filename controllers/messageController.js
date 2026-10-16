const { getIO } = require("../socket/socketManager");

const Chat = require("../models/Chat");
const Message = require("../models/Message");
const User = require("../models/User");

const createNotification = require("../utils/createNotification");
const pointCost = require("../config/pointCost");
const {
  deleteImage,
  findImage,
  openImageStream,
  saveImage,
} = require("../services/chatImageStorage");
const mongoose = require("mongoose");

const FakeAccountAssignment = require("../models/FakeAccountAssignment");
const {
  assignModerator,
  transferAssignment,
  renewAssignmentIfPossible,
} = require("../services/fakeAccountAssignmentService");

//... Send Message ../
exports.sendMessage = async (req, res) => {
  try {
    const { chatId, message = "", messageType } = req.body;
    const hasImage = Boolean(req.file);
    const normalizedMessage = typeof message === "string" ? message.trim() : "";

    if (!chatId || (!normalizedMessage && !hasImage)) {
      return res.status(400).json({
        success: false,
        message: "chatId and a message or image are required.",
      });
    }

    if (
      (hasImage && messageType !== "image") ||
      (messageType === "image" && !hasImage)
    ) {
      return res.status(400).json({
        success: false,
        message: "An image file is required for image messages.",
      });
    }

    const senderId = req.user._id;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found.",
      });
    }

    console.log("========== SEND MESSAGE ==========");
    console.log("Sender ID:", senderId.toString());
    console.log("Chat ID:", chatId);
    console.log("Message Type:", messageType || "text");
    console.log("Chat Point Cost:", req.chatPointCost);
    console.log("User role:", req.user.role);
    console.log("Auth user points before send:", req.user.points);
    console.log("=================================");

    // Make sure sender belongs to this chat
    const isParticipant = chat.participants.some(
      (id) => id.toString() === senderId.toString(),
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    const receiverId = chat.participants.find(
      (id) => id.toString() !== senderId.toString(),
    );

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: "Receiver not found in chat.",
      });
    }

    const receiver = await User.findById(receiverId);

    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found.",
      });
    }

    let imageFileId = null;

    if (hasImage) {
      try {
        imageFileId = await saveImage(req.file);
      } catch (uploadError) {
        console.error("[GridFS Chat Image Upload] Failed:", {
          message: uploadError.message,
          name: uploadError.name,
          code: uploadError.code,
        });
        return res.status(503).json({
          success: false,
          message: "Unable to store chat image. Please try again.",
        });
      }
    }

    let newMessage;
    try {
      newMessage = await Message.create({
        chat: chatId,
        sender: senderId,
        receiver: receiverId,
        message: normalizedMessage,
        image: "",
        imageFileId,
        imageContentType: hasImage ? req.file.mimetype : "",
        imageSize: hasImage ? req.file.size : null,
        messageType: hasImage ? "image" : req.chatMessageType || "text",
      });
    } catch (messageError) {
      if (imageFileId) {
        try {
          await deleteImage(imageFileId);
        } catch (cleanupError) {
          console.error("[GridFS Chat Image Cleanup] Failed:", {
            message: cleanupError.message,
            name: cleanupError.name,
            code: cleanupError.code,
          });
        }
      }
      throw messageError;
    }

    // ===================================================
    // Fake account routing
    // ===================================================

    if (receiver.accountType === "fake") {
      try {
        let assignment = await FakeAccountAssignment.findOne({
          fakeUser: receiver._id,
          realUser: senderId,
          chat: chat._id,
          status: "active",
        }).populate("moderator");

        /**
         * No assignment exists.
         * Create one for an online moderator.
         */
        if (!assignment) {
          assignment = await assignModerator({
            fakeUserId: receiver._id,
            realUserId: senderId,
            chatId: chat._id,
          });
        } else {
          const now = new Date();

          const isExpired =
            assignment.expiresAt && now >= new Date(assignment.expiresAt);

          if (isExpired) {
            /**
             * Check whether the current moderator can keep the
             * conversation.
             *
             * If they are the only online moderator, this renews
             * their 5-minute session.
             */
            const renewedAssignment = await renewAssignmentIfPossible(
              assignment._id,
            );

            if (renewedAssignment) {
              assignment = renewedAssignment;
            } else {
              /**
               * Another moderator is available.
               * Transfer the assignment.
               */
              assignment = await transferAssignment(assignment._id);
            }
          }
        }

        if (assignment?.moderator?._id) {
          const io = getIO();

          io.to(assignment.moderator._id.toString()).emit(
            "fake-account-message",
            {
              assignmentId: assignment._id,
              chatId: chat._id,
              fakeUser: receiver,
              realUser: req.user,
              message: newMessage,

              // IMPORTANT:
              // Send the actual assignment timer to frontend.
              assignedAt: assignment.assignedAt,
              expiresAt: assignment.expiresAt,

              status: assignment.status,
            },
          );
        }
      } catch (assignmentError) {
        console.error("Fake account assignment error:", assignmentError);
      }
    }

    const user = await User.findById(senderId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // ==========================================
    // Deduct points only for regular users
    // ==========================================
    // ==========================================
    // Deduct points only from real regular users
    // ==========================================
    if (user.accountType === "real" && user.role === "user") {
      user.points -= req.chatPointCost;
      await user.save();

      console.log(
        "Points deducted for user:",
        user._id.toString(),
        "new points:",
        user.points,
      );
    } else {
      console.log("No points deducted.", {
        accountType: user.accountType,
        role: user.role,
      });
    }

    // Update chat data after message save and point deduction
    chat.lastMessage = newMessage._id;
    chat.lastMessageAt = new Date();
    await chat.save();
    console.log(
      "Chat updated:",
      chat._id.toString(),
      "lastMessage:",
      chat.lastMessage.toString(),
    );

    const io = getIO();
    io.to(chatId.toString()).emit("new-message", newMessage);

    // Notification should not block success response
    try {
      await createNotification({
        receiver: receiverId,
        sender: senderId,
        type: "message",
        title: "New Message",
        message: `${req.user.fullName || "Someone"} sent you a message.`,
        data: {
          chatId: chat._id,
          messageId: newMessage._id,
        },
      });
    } catch (notificationError) {
      console.error("Notification send failed:", notificationError);
    }

    res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      pointCost: req.chatPointCost || 0,
      remainingPoints: user.points,
      data: newMessage,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

exports.getMessageImage = async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!mongoose.isValidObjectId(messageId)) {
      return res.status(404).json({
        success: false,
        message: "Image not found.",
      });
    }

    const message = await Message.findById(messageId);

    if (!message || message.deletedForEveryone || !message.imageFileId) {
      return res.status(404).json({
        success: false,
        message: "Image not found.",
      });
    }

    const chat = await Chat.findById(message.chat);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found.",
      });
    }

    const userId = req.user._id.toString();
    const isParticipant = chat.participants.some(
      (participantId) => participantId.toString() === userId,
    );
    let isAssignedModerator = false;

    if (!isParticipant && req.user.role === "moderator") {
      isAssignedModerator = Boolean(
        await FakeAccountAssignment.findOne({
          chat: chat._id,
          moderator: req.user._id,
          status: "active",
        }),
      );
    }

    if (!isParticipant && !isAssignedModerator) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    const file = await findImage(message.imageFileId);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: "Image not found.",
      });
    }

    const contentType = message.imageContentType || file.metadata?.contentType;

    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(contentType)) {
      return res.status(415).json({
        success: false,
        message: "Unsupported image type.",
      });
    }

    res.set({
      "Content-Type": contentType,
      "Content-Length": String(file.length),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });

    const imageStream = openImageStream(message.imageFileId);
    imageStream.on("error", (error) => {
      console.error("[GridFS Chat Image Read] Failed:", {
        message: error.message,
        name: error.name,
        code: error.code,
      });
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.destroy(error);
      }
    });
    imageStream.pipe(res);
  } catch (error) {
    console.error("[GridFS Chat Image Read] Failed:", {
      message: error.message,
      name: error.name,
      code: error.code,
    });
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Unable to retrieve chat image.",
      });
    } else {
      res.destroy(error);
    }
  }
};

//... Get Messages ../
exports.getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found.",
      });
    }

    const userId = req.user._id.toString();

    // =====================================================
    // Check if normal user is a chat participant
    // =====================================================

    const isParticipant = chat.participants.some(
      (id) => id.toString() === userId,
    );

    // =====================================================
    // Check if moderator owns an active assignment
    // for this fake-account conversation
    // =====================================================

    let isAssignedModerator = false;

    if (req.user.role === "moderator") {
      const assignment = await FakeAccountAssignment.findOne({
        chat: chatId,
        moderator: req.user._id,
        status: "active",
      });

      if (assignment) {
        isAssignedModerator = true;
      }
    }

    // =====================================================
    // Authorization
    // =====================================================

    if (!isParticipant && !isAssignedModerator) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // =====================================================
    // Get complete conversation
    // =====================================================

    const messages = await Message.find({
      chat: chatId,
      deletedForEveryone: false,
    })
      .populate("sender", "fullName username photo badge role accountType")
      .populate("receiver", "fullName username photo badge role accountType")
      .sort({ createdAt: 1 });

    // =====================================================
    // Response
    // =====================================================

    res.status(200).json({
      success: true,
      total: messages.length,
      messages,
    });
  } catch (error) {
    console.error("Get messages error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//... Mark Message as Seen ../
exports.markAsSeen = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,

        message: "Message not found.",
      });
    }

    const chat = await Chat.findById(message.chat);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found.",
      });
    }

    const isParticipant = chat.participants.some(
      (id) => id.toString() === req.user._id.toString(),
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    if (message.seen) {
      return res.status(200).json({
        success: true,
        message: "Message already marked as seen.",
      });
    }

    message.seen = true;

    await message.save();

    const io = getIO();

    io.to(message.chat.toString()).emit("message-seen", {
      messageId: message._id,
      seenBy: req.user._id,
    });

    res.status(200).json({
      success: true,

      message: "Message marked as seen.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

//... edit Chat by ID ../
exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const { message } = req.body;

    const msg = await Message.findById(messageId);

    if (!msg) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    if (msg.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own messages.",
      });
    }

    msg.message = message;

    await msg.save();

    const io = getIO();

    io.to(msg.chat.toString()).emit("message-edited", msg);

    res.status(200).json({
      success: true,

      message: "Message updated.",

      data: msg,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

//... Delete Message ../
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own messages.",
      });
    }

    message.deletedForEveryone = true;

    await message.save();

    const io = getIO();

    io.to(message.chat.toString()).emit("message-deleted", {
      messageId: message._id,
    });

    res.status(200).json({
      success: true,

      message: "Message deleted.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
