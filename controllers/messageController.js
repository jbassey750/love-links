const { getIO } = require("../socket/socketManager");

const Chat = require("../models/Chat");
const Message = require("../models/Message");

const createNotification = require("../utils/createNotification");
const pointCost = require("../config/pointCost");

//... Send Message ../
exports.sendMessage = async (req, res) => {
  try {
    const { chatId, message, messageType } = req.body;

    if (!chatId || !message) {
      return res.status(400).json({
        success: false,
        message: "chatId and message are required.",
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

    const newMessage = await Message.create({
      chat: chatId,
      sender: senderId,
      receiver: receiverId,
      message,
      messageType: messageType || "text",
    });

    const io = getIO();

    io.to(chatId.toString()).emit("new-message", newMessage);

    // Update chat
    chat.lastMessage = newMessage._id;
    chat.lastMessageAt = new Date();

    await chat.save();

    const cost = pointCost[messageType || "text"];

    const user = await User.findById(senderId);

    if (!user) {
  return res.status(404).json({
    success: false,
    message: "User not found.",
  });
}

    user.points -= cost;

    await user.save();

    // Notification
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

    res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: newMessage,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
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

    const isParticipant = chat.participants.some(
      (id) => id.toString() === req.user._id.toString(),
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    const messages = await Message.find({
      chat: chatId,
      deletedForEveryone: false,
    })
      .populate("sender", "fullName photo")
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      total: messages.length,
      messages,
    });
  } catch (error) {
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
