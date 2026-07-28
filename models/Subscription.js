const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema({

    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    plan:{
        type:String,
        enum:["basic","premium","elite"]
    },

    amount:Number,

    currency:{
        type:String,
        default:"USD"
    },

    startDate:Date,

    endDate:Date,

    status:{
        type:String,
        enum:["active","expired","cancelled"],
        default:"active"
    }

},{
    timestamps:true
});

module.exports = mongoose.model("Subscription",SubscriptionSchema);