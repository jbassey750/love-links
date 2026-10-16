
require("dotenv").config();

const supabase = require("./config/supabase");

async function testUpload() {
  const filePath = `diagnostics/test-${Date.now()}.txt`;
  const buffer = Buffer.from("Supabase connectivity test");

  console.log("Testing Supabase Storage upload...");

  try {
    const { data, error } = await supabase.storage
      .from("profile-images")
      .upload(filePath, buffer, {
        contentType: "text/plain",
        upsert: false,
      });

    if (error) {
      console.error("Upload returned an error:", error);
      return;
    }

    console.log("Upload succeeded:", data);
  } catch (error) {
    console.error("Upload threw an exception:", error);
  }
}

testUpload();
