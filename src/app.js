const express = require("express");
const cors = require("cors");

const authRoutes = require("../routers/authRoutes");
const matchRoutes = require("../routers/matchRoutes");
const chatRoutes = require("../routers/chatRoutes");
const messageRoutes = require("../routers/messageRoutes");
const notificationRoutes = require("../routers/NotificationRoutes");
const pointPackageRoutes = require("../routers/pointPackageRoutes")
const paymentRoutes = require("../routers/paymentRoutes");
const webhookRoutes = require("../routers/webhookRoutes");


const app = express();

app.use(cors());

// express.raw({ type: "application/json" })
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LoveLink API is running 🚀",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/points", pointPackageRoutes)
app.use("/api/payments", paymentRoutes);
app.use("/api/webhooks", webhookRoutes);


module.exports = app;