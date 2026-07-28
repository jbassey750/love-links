const express = require("express");
const protect  = require("../middleware/auth");
const checkChatPoints = require("../middleware/checkChatPoints");

const router = express.Router();

const {

sendMessage,

getMessages,

markAsSeen,

deleteMessage,

editMessage

} = require("../controllers/messageController");

router.post("/", protect, checkChatPoints, sendMessage);

router.get("/:chatId", protect, getMessages);

router.patch("/:messageId/seen", protect, markAsSeen);

router.patch("/:messageId", protect, editMessage);

router.delete("/:messageId", protect, deleteMessage);

module.exports = router;