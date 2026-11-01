const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const http = require("http");

const app = require("./app"); 
const connectDB = require("../db/mongooes");

const {
  initializeRealtimeEvents,
} = require("../services/realtimeEventService");
const {
  clearExpiredPresence,
} = require("../services/realtimePresenceService");
const {
  startAssignmentExpiryChecker,
} = require("../services/assignmentExpiryService");

// Protect against unexpected process termination from async rejections or uncaught errors
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Process] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Process] Uncaught Exception:", error);
});

const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  await initializeRealtimeEvents();
  startAssignmentExpiryChecker();
  const presenceCleanupInterval = setInterval(() => {
    void clearExpiredPresence().catch((error) => {
      console.error("[SSE] Expired presence cleanup failed:", error.message);
    });
  }, 30 * 1000);
  presenceCleanupInterval.unref?.();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exitCode = 1;
});
