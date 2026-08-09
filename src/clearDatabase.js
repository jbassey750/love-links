const mongoose = require("mongoose");
require("dotenv").config();

async function clearDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    await mongoose.connection.db.dropDatabase();

    console.log("✅ Database cleared successfully.");

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

clearDatabase();