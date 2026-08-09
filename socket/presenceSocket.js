const User = require("../models/User");

module.exports = (io, socket, onlineUsers) => {
  socket.on("join-user", async (userId) => {
    try {
      if (!userId) return;

      socket.join(userId.toString());
      onlineUsers.set(userId.toString(), socket.id);

      await User.findByIdAndUpdate(userId, {
        status: "online",
      });

      io.emit("user-status-changed", {
        userId,
        status: "online",
      });
    } catch (error) {
      console.error("Failed to set user online:", error);
    }
  });

  socket.on("check-online", (userId) => {
    const online = onlineUsers.has(userId?.toString?.() || "");

    socket.emit("user-status", {
      userId,
      online,
    });
  });

  socket.on("disconnect", async () => {
    try {
      for (const [userId, socketId] of onlineUsers) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);

          await User.findByIdAndUpdate(userId, {
            status: "offline",
          });

          io.emit("user-status-changed", {
            userId,
            status: "offline",
          });

          break;
        }
      }
    } catch (error) {
      console.error("Failed to set user offline:", error);
    }
  });
};
