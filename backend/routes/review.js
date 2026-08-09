const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const { runStaticAnalysis } = require("../services/staticAnalysis");
const { runAiReview } = require("../services/aiReview");
const { saveReview, getHistory, getReviewById } = require("../services/db");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1MB is plenty for a code review demo
});

// POST /api/review  — accepts either { code, filename } as JSON,
// or a multipart file upload under the field name "file".
router.post("/review", upload.single("file"), async (req, res) => {
  try {
    let code;
    let filename;

    if (req.file) {
      code = req.file.buffer.toString("utf-8");
      filename = req.file.originalname;
    } else {
      code = (req.body.code || "").toString();
      filename = req.body.filename || null;
    }

    if (!code || !code.trim()) {
      return res.status(400).json({ error: "No code provided. Paste code or upload a file." });
    }

    const staticResult = runStaticAnalysis(code, filename);

    let aiResult;
    try {
      aiResult = await runAiReview(code, staticResult.issues, staticResult.language);
    } catch (err) {
      console.error("AI review failed:", err.message);
      aiResult = {
        unavailable: true,
        message: "The AI review service failed. Static analysis results are still available.",
        explanation: null,
        complexity: null,
        bugs: [],
        codeSmells: [],
        namingSuggestions: [],
        performanceSuggestions: [],
        refactoringSuggestions: [],
        documentation: null,
      };
    }

    const review = {
      id: uuidv4(),
      filename: filename || "pasted-snippet",
      language: staticResult.language,
      createdAt: new Date().toISOString(),
      code,
      static: staticResult,
      ai: aiResult,
    };

    await saveReview(review);
    res.json(review);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong while reviewing the code." });
  }
});

// GET /api/history — most recent reviews, newest first
router.get("/history", async (req, res) => {
  try {
    res.json(await getHistory(50));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load history." });
  }
});

// GET /api/review/:id — a single past review
router.get("/review/:id", async (req, res) => {
  try {
    const review = await getReviewById(req.params.id);
    if (!review) return res.status(404).json({ error: "Review not found." });
    res.json(review);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load that review." });
  }
});

module.exports = router;