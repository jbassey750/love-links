const mongoose = require("mongoose");

const PointSchema = new mongoose.Schema({

    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    action:String,

    points:Number,

    balance:Number

},{
    timestamps:true
});

module.exports = mongoose.model("PointHistory",PointSchema);