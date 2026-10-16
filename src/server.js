const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const http = require("http");

const app = require("./app"); 
const connectDB = require("../db/mongooes");

const { initSocket } = require("../socket/socketManager");
const {
  startAssignmentExpiryChecker,
} = require("../services/assignmentExpiryService");


const server =
http.createServer(app);


initSocket(server);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  startAssignmentExpiryChecker();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exitCode = 1;
});