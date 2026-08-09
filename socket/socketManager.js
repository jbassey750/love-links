const { Server } = require("socket.io");
const User = require("../models/User");

const messageSocket = require("./messageSocket");
const notificationSocket = require("./notificationSocket");
const matchSocket = require("./matchSocket");
const typingSocket = require("./typingSocket");
const presenceSocket = require("./presenceSocket");
const readReceiptSocket = require("./readReceiptSocket");

let io;

const onlineUsers = new Map();

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("join-user", async (userId) => {
      console.log("join-user received:", userId);

      try {
        await User.findByIdAndUpdate(userId, {
          status: "online",
          lastSeen: new Date(),
        });

        console.log("User marked online:", userId);

        socket.join(userId.toString());

        onlineUsers.set(userId.toString(), socket.id);

        io.emit("user-online", userId);
      } catch (error) {
        console.error("Error setting user online:", error);
      }
    });

    presenceSocket(io, socket, onlineUsers);

    messageSocket(io, socket);

    notificationSocket(io, socket);

    matchSocket(io, socket);

    typingSocket(io, socket);

    readReceiptSocket(io, socket);

    socket.on("disconnect", async () => {
      try {
        for (const [userId, socketId] of onlineUsers) {
          if (socketId === socket.id) {
            onlineUsers.delete(userId);

            await User.findByIdAndUpdate(userId, {
              status: "offline",
              lastSeen: new Date(),
            });

            io.emit("user-offline", userId);

            break;
          }
        }

        console.log("Socket disconnected:", socket.id);
      } catch (error) {
        console.error("Error setting user offline:", error);
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }

  return io;
};

const getUserSocket = (userId) => {
  return onlineUsers.get(userId.toString()) || null;
};

const isUserOnline = (userId) => {
  return onlineUsers.has(userId.toString());
};

const getOnlineUsers = () => {
  return [...onlineUsers.keys()];
};

const getOnlineModerators = async () => {
  const moderators = await User.find({
    role: "moderator",
    status: "online",
  }).select("_id fullName username photo status role accountType");

  console.log("========== ONLINE MODERATORS ==========");
  console.log("Found moderators:", moderators.length);
  console.log(moderators);
  console.log("========================================");

  return moderators;
};

module.exports = {
  initSocket,
  getIO,
  onlineUsers,
  getUserSocket,
  isUserOnline,
  getOnlineUsers,
  getOnlineModerators,
};
