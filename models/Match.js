const mongoose = require("mongoose");

const MatchSchema = new mongoose.Schema({

    users: {
        type: [
            { 
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true
            }
        ],
        validate: {
            validator: function (v) {
                return Array.isArray(v) && v.length === 2;
            },
            message: "Match must contain exactly two users."
        }
    },

    status: {
        type: String,
        enum: [
            "active",
            "unmatched",
            "blocked"
        ],
        default: "active"
    },

    matchedAt: {
        type: Date,
        default: Date.now
    },

    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Chat",
        default: null
    },

    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
        default: null
    },

    lastMessageAt: {
        type: Date,
        default: null
    },

    unreadCount: {
        type: Number,
        default: 0
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Match", MatchSchema);