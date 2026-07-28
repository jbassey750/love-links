const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
{

    receiver:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },

    sender:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    type:{
        type:String,
        enum:[
            "like",
            "match",
            "message",
            "subscription",
            "system"
        ],
        required:true
    },

    title:{
        type:String,
        required:true
    },

    body:{
        type:String,
        required:true
    }, 

    isRead:{
        type:Boolean,
        default:false
    }

},
{
    timestamps:true
});

module.exports = mongoose.model("Notification",NotificationSchema);