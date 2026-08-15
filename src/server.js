const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const http = require("http");

const app = require("./app");
const connectDB = require("../db/mongooes");

const { initSocket } = require("../socket/socketManager");


const server =
http.createServer(app);


initSocket(server);

connectDB(); 

const PORT = process.env.PORT || 5000;

// Start Server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});