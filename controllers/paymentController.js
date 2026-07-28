const Stripe = require("stripe");
const PointPackage = require("../models/PointPackage");
const User = require("../models/User");
const Payment = require("../models/Payment")

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.createCheckoutSession = async (req, res) => {
  try {
    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        message: "Point package is required.",
      });
    }

    if (!process.env.STRIPE_SECRET_KEY || !process.env.CLIENT_URL) {
      return res.status(500).json({
        success: false,
        message: "Payment configuration is incomplete.",
      });
    }

    const pointPackage = await PointPackage.findById(packageId);

    if (!pointPackage) {
      return res.status(404).json({
        success: false,
        message: "Point package not found.",
      });
    }

    if (!pointPackage.active) {
      return res.status(400).json({
        success: false,
        message: "This point package is currently unavailable.",
      });
    }
    if (!pointPackage.stripePriceId) {
      return res.status(400).json({
        success: false,
        message: "Stripe Price ID is missing for this package.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      payment_method_types: ["card"],

      customer_creation: "always",

      customer_email: req.user.email,

      client_reference_id: req.user._id.toString(),

      line_items: [
        {
          price: pointPackage.stripePriceId,
          quantity: 1,
        },
      ],

      metadata: {
        userId: req.user._id.toString(),
        packageId: pointPackage._id.toString(),
      },

      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
    });

    return res.status(200).json({
      success: true,
      message: "Checkout session created successfully.",
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid point package ID.",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


exports.stripeWebhook = async (req, res) => {
  try {

  } catch (error) {

  }
};