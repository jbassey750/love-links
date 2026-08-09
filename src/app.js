const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("../routers/authRoutes");
const matchRoutes = require("../routers/matchRoutes");
const chatRoutes = require("../routers/chatRoutes");
const messageRoutes = require("../routers/messageRoutes");
const notificationRoutes = require("../routers/NotificationRoutes");
const pointPackageRoutes = require("../routers/pointPackageRoutes");
const paymentRoutes = require("../routers/paymentRoutes");
const webhookRoutes = require("../routers/webhookRoutes");
const profileRoutes = require("../routers/ProfileRoutes");
const discoverRoutes = require("../routers/discoverRoutes");
const updateLocationRoutes = require("../routers/updateLocationRoutes");
const adminRoutes = require("../routers/adminRoutes");
const moderatorRoutes = require("../routers/moderatorRoutes");

const app = express();

const corsOptions = {
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
};

app.use(cors(corsOptions));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.CLIENT_URL || "http://localhost:5173");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});
;

app.use(cors(corsOptions));

// express.raw({ type: "application/json" })
app.use(express.json());

app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LoveLink API is running",
  });
});

app.use("/api/auth", authRoutes); 
app.use("/api/discover", discoverRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/points", pointPackageRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/users/location", updateLocationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/moderator", moderatorRoutes);

module.exports = app;