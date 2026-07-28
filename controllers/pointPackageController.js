const PointPackage = require("../models/PointPackage");


exports.createPackage = async (req,res)=>{
    try {

        const package = await PointPackage.create({
            name:"Starter Points",
            points:50,
            price:5,
            currency:"USD",
            stripePriceId:"price_test_id_here",
            description:"50 chat points",
            popular:false,
            active:true
        });


        res.status(201).json({
            success:true,
            data:package
        });


    } catch(error){

        res.status(500).json({
            success:false,
            message:error.message
        });

    }
};