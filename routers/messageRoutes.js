const express = require("express");
const protect  = require("../middleware/auth");
const checkChatPoints = require("../middleware/checkChatPoints");
const upload = require("../middleware/upload"); 

const router = express.Router();

const {

sendMessage,

getMessages,

getMessageImage,

markAsSeen,

deleteMessage,

editMessage

} = require("../controllers/messageController");

const parseChatImage = (req, res, next) => {
  upload.chatImage(req, res, (error) => {
    if (error) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(status).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Image must be within the configured upload size limit."
            : error.message || "Invalid image upload.",
      });
      return;
    }

    if (req.file) {
      const buffer = req.file.buffer;
      const isJpeg =
        req.file.mimetype === "image/jpeg" || req.file.mimetype === "image/jpg";
      const isPng = req.file.mimetype === "image/png";
      const isWebp = req.file.mimetype === "image/webp";
      const validSignature =
        (isJpeg &&
          buffer.length >= 3 &&
          buffer[0] === 0xff &&
          buffer[1] === 0xd8 &&
          buffer[2] === 0xff) ||
        (isPng &&
          buffer.length >= 8 &&
          buffer.subarray(0, 8).equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          )) ||
        (isWebp &&
          buffer.length >= 12 &&
          buffer.toString("ascii", 0, 4) === "RIFF" &&
          buffer.toString("ascii", 8, 12) === "WEBP");

      if (!validSignature) {
        res.status(400).json({
          success: false,
          message: "The uploaded file is not a supported image.",
        });
        return;
      }
    }

    next();
  });
};

router.post("/", protect, parseChatImage, checkChatPoints, sendMessage);

router.get("/:chatId", protect, getMessages);

router.get("/:messageId/image", protect, getMessageImage);

router.patch("/:messageId/seen", protect, markAsSeen);

router.patch("/:messageId", protect, editMessage);

router.delete("/:messageId", protect, deleteMessage);

module.exports = router;