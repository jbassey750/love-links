const mongoose = require("mongoose");
const dns = require("dns");

// Configure robust DNS servers (Google & Cloudflare) to ensure MongoDB SRV/replica-set hostnames
// resolve properly across all networks (e.g. mobile hotspots, restricted routers).
try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch (dnsErr) {
  console.warn("[MongoDB] Notice: Could not set custom DNS servers:", dnsErr.message);
}

// Custom lookup to bridge c-ares (which uses dns.setServers) to MongoDB socket creation,
// preventing OS getaddrinfo ENOTFOUND errors on hotspots/cellular networks.
const customLookup = (hostname, options, callback) => {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  dns.resolve4(hostname, (err, addresses) => {
    if (!err && addresses && addresses.length > 0) {
      if (options && options.all) {
        return callback(
          null,
          addresses.map((a) => ({ address: a, family: 4 })),
        );
      }
      return callback(null, addresses[0], 4);
    }
    // Fallback to standard OS lookup
    dns.lookup(hostname, options, callback);
  });
};

const connectDB = async (retries = 5, delayMs = 3000) => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("MongoDB connection URI is missing. Set MONGO_URI in your .env file.");
    process.exit(1);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, {
        lookup: customLookup,
        serverSelectionTimeoutMS: 30000,
      });
      console.log("MongoDB Connected");
      return;
    } catch (error) {
      console.error(
        `MongoDB connection attempt ${attempt}/${retries} failed:`,
        error.message,
      );
      if (attempt === retries) {
        console.error("Could not connect to MongoDB after maximum retries.");
        process.exit(1);
      }
      console.log(`Retrying MongoDB connection in ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

module.exports = connectDB;
