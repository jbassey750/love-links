const express = require("express");

const router = express.Router();

const upload = require("../middleware/upload");

// const { signup } = require("../controllers/authController");
const { signup, login } = require("../controllers/authController");

router.post(
  "/signup", 

  upload.single("photo"),

  signup,
);

router.post("/login", login);

module.exports = router;
