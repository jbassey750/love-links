const { getIO } = require("../socket/socketManager");
const Chat = require("../models/Chat");

// exports.createChat = async (req, res) => {
//   try {
// const { matchId } = req.body;
//
// const match = await Match.findById(matchId);
//
// if (!match) {
//   return res.status(404).json({
// success: false,
// message: "Match not found.",
//   });
// }
//
// const existingChat = await Chat.findOne({
//   match: matchId,
// });
//
// if (existingChat) {
//   return res.status(400).json({
// success: false,
// message: "Chat already exists.",
// chat: existingChat,
//   });
// }
//
// const chat = await Chat.create({
//   participants: match.users,
//   match: matchId,
// });
//
// res.status(201).json({
//   success: true,
//   message: "Chat created successfully.",
//   chat,
// });
//   } catch (error) {
// res.status(500).json({
//   success: false,
//   message: error.message,
// });
//   }
// };

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

    const isParticipant = chat.participants.some(
      (id) => id._id.toString() === req.user._id.toString(),
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    res.status(200).json({
      success: true,

      chat,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

//...Archive Chat ../

// exports.archiveChat = async (req, res) => {
//   try {
    // const { chatId } = req.params;
// 
    // const chat = await Chat.findById(chatId);
// 
    // if (!chat) {
    //   return res.status(404).json({
        // success: false,
// 
        // message: "Chat not found.",
    //   });
    // }
// 
    // const isParticipant = chat.participants.some(
    //   (id) => id.toString() === req.user._id.toString(),
    // );
// 
    // if (!isParticipant) {
    //   return res.status(403).json({
        // success: false,
        // message: "Access denied.",
    //   });
    // }
// 
    // chat.isActive = false;
// 
    // await chat.save();
// 
    // const io = getIO();
// 
    // chat.participants.forEach((userId) => {
    //   io.to(userId.toString()).emit("chat-archived", {
        // chatId: chat._id,
    //   });
    // });
// 
    // res.status(200).json({
    //   success: true,
// 
    //   message: "Chat archived.",
    // });
//   } catch (error) {
    // res.status(500).json({
    //   success: false,
// 
    //   message: error.message,
    // });
//   }
// };

//...Deactivate Chat ../
exports.deactivateChat  = async (req, res) => {
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
