const { getIO } = require("../socket/socketManager");
const Chat = require("../models/Chat");
const Message = require("../models/Message");

//... Get All Chats For One User ../

exports.getUserChats = async (req, res) => {
  try {
    const userId = req.user._id;

    const chats = await Chat.find({
      participants: userId,

      isActive: true,
    })
      .populate("participants", "fullName photo status badge")
      .populate("lastMessage");

    res.status(200).json({
      success: true,

      total: chats.length,

      chats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

//...Get One Chat ../

exports.getSingleChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId)
      .populate("participants", "fullName photo status badge")
      .populate("lastMessage");

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found.",
      });
    }

    const currentUserId = req.user._id.toString();
    const isParticipant = chat.participants.some(
      (participant) => participant._id.toString() === currentUserId,
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    const otherUser = chat.participants.find(
      (participant) => participant._id.toString() !== currentUserId,
    );

    // Then return everything
    res.status(200).json({
      success: true,
      chat,
      currentUserId,
      otherUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};




exports.getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;

    const page = Number(req.query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    // Verify the chat exists
    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found.",
      });
    }

    // Verify the current user belongs to the chat
    const isParticipant = chat.participants.some(
      (participant) =>
        participant.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // Fetch messages
    const messages = await Message.find({
      chat: chatId,
      deletedForEveryone: false,
    })
      .populate("sender", "fullName photo badge")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Count total messages
    const totalMessages = await Message.countDocuments({
      chat: chatId,
      deletedForEveryone: false,
    });

    res.status(200).json({
      success: true,
      messages: messages.reverse(),
      page,
      totalMessages,
      hasMore: totalMessages > page * limit,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


//...Deactivate Chat ../
exports.deactivateChat = async (req, res) => {
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

    chat.isActive = false;
    await chat.save();

    const io = getIO();

    chat.participants.forEach((userId) => {
      io.to(userId.toString()).emit("chat-deactivated", {
        chatId: chat._id,
        isActive: false,
      });
    });

    res.status(200).json({
      success: true,

      message: "Chat deactivated successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
