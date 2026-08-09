/**
 * Stage 2: AI-Based Review
 *
 * Sends the code (plus a short summary of the Stage 1 static findings)
 * to an LLM and asks for a structured review: bugs, code smells,
 * improvement suggestions, complexity notes, naming feedback,
 * performance ideas, a plain-language explanation, documentation,
 * and refactoring recommendations.
 *
 * Supports multiple providers via AI_PROVIDER in .env, so you're not
 * locked into a paid API:
 *   - "anthropic" (default) — needs ANTHROPIC_API_KEY
 *   - "ollama"    — 100% free, runs locally, no API key at all
 *   - "groq"      — free tier, hosted, very fast
 *   - "gemini"    — free tier from Google
 */

const Anthropic = require("@anthropic-ai/sdk");

const PROVIDER = (process.env.AI_PROVIDER || "anthropic").toLowerCase();

let anthropicClient = null;
function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

const SYSTEM_PROMPT = `You are an expert, friendly senior software engineer performing a code review.
You will be given a source file (or snippet) and a short list of static-analysis findings.
Respond with ONLY a single JSON object (no markdown fences, no preamble) matching this shape:

{
  "explanation": "1-3 sentence plain-language summary of what the code does",
  "complexity": "short note on the code's overall complexity / readability",
  "bugs": [{ "line": number|null, "issue": string, "suggestion": string }],
  "codeSmells": [{ "line": number|null, "issue": string, "suggestion": string }],
  "namingSuggestions": [{ "line": number|null, "issue": string, "suggestion": string }],
  "performanceSuggestions": [{ "line": number|null, "issue": string, "suggestion": string }],
  "refactoringSuggestions": [{ "line": number|null, "issue": string, "suggestion": string }],
  "documentation": "a short auto-generated docstring/comment block describing the code's purpose, params, and return value"
}

If a category has no findings, return an empty array for it. Be specific and reference line numbers
from the provided source whenever you can. Keep each "issue"/"suggestion" to one or two sentences.`;

function unavailable(message, extra = {}) {
  return {
    unavailable: true,
    message,
    explanation: null,
    complexity: null,
    bugs: [],
    codeSmells: [],
    namingSuggestions: [],
    performanceSuggestions: [],
    refactoringSuggestions: [],
    documentation: null,
    ...extra,
  };
}

function parseJsonResponse(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return unavailable("The AI response could not be parsed as JSON.", { raw: cleaned });
  }
}

function buildUserPrompt(code, staticFindings, language) {
  const findingsSummary =
    staticFindings
      .slice(0, 25)
      .map((f) => `- line ${f.line} [${f.severity}] ${f.category}: ${f.message}`)
      .join("\n") || "(no static findings)";

  return `Language: ${language}

Static analysis findings:
${findingsSummary}

Source code:
\`\`\`${language}
${code}
\`\`\``;
}

/* ---------------- Provider: Anthropic (Claude) ---------------- */

async function reviewWithAnthropic(userPrompt) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return unavailable("AI review is not configured. Set ANTHROPIC_API_KEY in backend/.env, or switch AI_PROVIDER to a free option (ollama/groq/gemini).");
  }
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-5";
  const response = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return parseJsonResponse(textBlock ? textBlock.text : "{}");
}

/* ---------------- Provider: Ollama (free, local, no API key) ---------------- */

async function reviewWithOllama(userPrompt) {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "codellama";

  let res;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    return unavailable(`Couldn't reach Ollama at ${baseUrl}. Is "ollama serve" running, and have you pulled the model with "ollama pull ${model}"?`);
  }

  if (!res.ok) {
    return unavailable(`Ollama returned an error (${res.status}). Check that "${model}" is pulled.`);
  }
  const data = await res.json();
  return parseJsonResponse(data.message?.content || "{}");
}

/* ---------------- Provider: Groq (free tier, hosted) ---------------- */

async function reviewWithGroq(userPrompt) {
  if (!process.env.GROQ_API_KEY) {
    return unavailable("Set GROQ_API_KEY in backend/.env — free keys are available at https://console.groq.com");
  }
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return unavailable(`Groq API error (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return parseJsonResponse(data.choices?.[0]?.message?.content || "{}");
}

/* ---------------- Provider: Gemini (free tier) ---------------- */

async function reviewWithGemini(userPrompt) {
  if (!process.env.GEMINI_API_KEY) {
    return unavailable("Set GEMINI_API_KEY in backend/.env — free keys are available at https://aistudio.google.com/apikey");
  }
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    return unavailable(`Gemini API error (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return parseJsonResponse(text);
}

/* ---------------- Dispatcher ---------------- */

async function runAiReview(code, staticFindings, language) {
  const userPrompt = buildUserPrompt(code, staticFindings, language);

  switch (PROVIDER) {
    case "ollama":
      return reviewWithOllama(userPrompt);
    case "groq":
      return reviewWithGroq(userPrompt);
    case "gemini":
      return reviewWithGemini(userPrompt);
    case "anthropic":
    default:
      return reviewWithAnthropic(userPrompt);
  }
}

module.exports = { runAiReview };