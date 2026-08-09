/**
 * MongoDB-backed storage for review history, using Mongoose.
 * Requires MONGODB_URI to be set in .env.
 */

const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  filename: String,
  language: String,
  createdAt: String,
  code: String,
  static: mongoose.Schema.Types.Mixed,
  ai: mongoose.Schema.Types.Mixed,
});

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);

async function connectDb() {
  if (!process.env.MONGODB_URI) {
    console.log("MONGODB_URI not set — history will not be saved.");
    return;
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");
}

async function saveReview(review) {
  if (mongoose.connection.readyState !== 1) return review; // not connected, skip silently
  await Review.create(review);
  return review;
}

async function getHistory(limit = 50) {
  if (mongoose.connection.readyState !== 1) return [];
  const docs = await Review.find().sort({ createdAt: -1 }).limit(limit).lean();
  return docs;
}

async function getReviewById(id) {
  if (mongoose.connection.readyState !== 1) return null;
  return Review.findOne({ id }).lean();
}

module.exports = { connectDb, saveReview, getHistory, getReviewById };