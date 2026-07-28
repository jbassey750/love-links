const express = require("express");
const protect = require("../middleware/auth");

const router = express.Router();

const {

    createChat,

    getUserChats,

    getSingleChat,

    archiveChat,

    deactivateChat

} = require("../controllers/chatController");

// router.post("/chat", protect, createChat);
    
router.get("/user/:userId",protect, getUserChats);

router.get("/:chatId", protect, getSingleChat);

// router.patch("/:chatId/archive", protect, archiveChat);

router.patch("/:chatId", protect, deactivateChat);

module.exports = router;