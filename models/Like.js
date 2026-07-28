const mongoose = require("mongoose");

const LikeSchema = new mongoose.Schema(
{
    fromUser:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },

    toUser:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },

    status:{
        type:String,
        enum:["pending","matched"],
        default:"pending"
    }
},
{
    timestamps:true
});

module.exports = mongoose.model("Like",LikeSchema);