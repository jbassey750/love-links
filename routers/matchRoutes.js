const express = require("express");
const router = express.Router();

const protect = require("../middleware/auth");

const {
    likeUser,
    getMatches,
    getMatch,
    removeMatch
} = require("../controllers/matchController");

router.post("/like", protect, likeUser);

router.get("/", protect, getMatches);

router.get("/:matchId", protect, getMatch);

router.delete("/:matchId", protect, removeMatch);

module.exports = router; 