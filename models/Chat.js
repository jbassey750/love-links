const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema(
{
    participants:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"User",
            required:true
        }
    ], 

    match:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Match",
        required:true
    },

    lastMessage:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Message",
        default:null
    },

    lastMessageAt:{
        type:Date,
        default:null
    },

    isActive:{
        type:Boolean,
        default:true
    }

},
{
    timestamps:true
});

module.exports = mongoose.model("Chat",ChatSchema);