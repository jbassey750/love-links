const mongoose = require("mongoose");

const BUCKET_NAME = "chatImages";

const getBucket = () => {
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("MongoDB is not connected.");
  }

  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
};

const saveImage = async (file) => {
  if (!file?.buffer) {
    throw new Error("Chat image file buffer is missing.");
  }

  const bucket = getBucket();
  const extension = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[file.mimetype] || "image";
  const uploadStream = bucket.openUploadStream(
    `chat-${new mongoose.Types.ObjectId()}.${extension}`,
    {
      metadata: {
        contentType: file.mimetype,
      },
    },
  );

  try {
    await new Promise((resolve, reject) => {
      uploadStream.once("finish", resolve);
      uploadStream.once("error", reject);
      uploadStream.end(file.buffer);
    });
    return uploadStream.id;
  } catch (error) {
    try {
      await bucket.delete(uploadStream.id);
    } catch (cleanupError) {
      console.error("[GridFS Partial Upload Cleanup] Failed:", {
        name: cleanupError.name,
        code: cleanupError.code,
      });
    }
    throw error;
  }
};

const deleteImage = async (fileId) => getBucket().delete(fileId);

const findImage = async (fileId) => {
  const bucket = getBucket();
  const files = await bucket.find({ _id: fileId }).toArray();

  return files[0] || null;
};

const openImageStream = (fileId) => getBucket().openDownloadStream(fileId);

module.exports = {
  deleteImage,
  findImage,
  openImageStream,
  saveImage,
};
