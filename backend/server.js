require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const reviewRoutes = require("./routes/review");
const { connectDb } = require("./services/db");

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigin = process.env.FRONTEND_URL || "*";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", reviewRoutes);

// Serves the frontend too, useful for local dev / single-host deploys.
app.use(express.static(path.join(__dirname, "..", "frontend")));

function isAiConfigured() {
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  if (provider === "ollama") return true;
  if (provider === "groq") return Boolean(process.env.GROQ_API_KEY);
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    aiProvider: process.env.AI_PROVIDER || "anthropic",
    aiConfigured: isAiConfigured(),
    dbConfigured: Boolean(process.env.MONGODB_URI),
  });
});

async function start() {
  await connectDb();
  app.listen(PORT, () => {
    console.log(`AI Code Review Assistant backend running on http://localhost:${PORT}`);
    const provider = process.env.AI_PROVIDER || "anthropic";
    console.log(`AI provider: ${provider}`);
    if (!isAiConfigured()) {
      console.log(`Note: ${provider} is not fully configured yet — Stage 2 AI review will show a setup notice.`);
    }
  });
}

start();