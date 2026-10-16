const multer = require("multer");

const storage = multer.memoryStorage();

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const chatImageLimitMb = Number(process.env.CHAT_IMAGE_MAX_SIZE_MB);
const chatImageMaxFileSize =
  Number.isFinite(chatImageLimitMb) && chatImageLimitMb > 0
    ? Math.floor(chatImageLimitMb * 1024 * 1024)
    : 5 * 1024 * 1024;

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, and WEBP image files are allowed."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

upload.chatImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: chatImageMaxFileSize,
  },
}).single("image");

module.exports = upload;