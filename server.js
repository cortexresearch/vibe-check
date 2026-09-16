const express = require("express");
const path = require("path");

const app = express();
const PUBLIC_DIR = path.join(__dirname, "public");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const SITE_URL = process.env.SITE_URL || "https://vibe-check.up.railway.app";

// The tasks a prompt can target — kept server-side so the client can't
// smuggle an arbitrary function name into the model's instructions.
const LAB_TASKS = {
  palindrome: { functionName: "isPalindrome" },
  sumEvens: { functionName: "sumEvens" },
  flatten: { functionName: "flattenOnce" },
  uniqueChars: { functionName: "uniqueChars" },
};

// Simple in-memory per-IP rate limit — this runs as a single Railway
// instance, so a Map is enough; no shared store needed.
const RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 8 };
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

app.post("/api/agent", async (req, res) => {
  if (!OPENROUTER_API_KEY) {
    return res.status(503).json({ error: "LIVE LAB is offline — no agent key configured on the server yet." });
  }

  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: "Too many requests — the agent needs a breather. Try again in a few minutes." });
  }

  const { taskId, prompt } = req.body || {};
  const task = LAB_TASKS[taskId];
  if (!task) {
    return res.status(400).json({ error: "Unknown task." });
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 500) {
    return res.status(400).json({ error: "Prompt must be non-empty and under 500 characters." });
  }

  const systemPrompt =
    `You are an AI coding agent working inside a developer's editor. The next message is the ` +
    `developer's full instruction — follow only what it literally says, do not infer requirements ` +
    `it never mentioned, and do not add extra features, comments, error handling, or files it didn't ` +
    `ask for. You must define a single JavaScript function named exactly "${task.functionName}". ` +
    `Reply with ONLY one fenced javascript code block containing that function definition — no ` +
    `explanation before or after it.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "VIBE CHECK",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.5,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("OpenRouter error", response.status, detail.slice(0, 500));
      return res.status(502).json({ error: `The agent backend returned an error (${response.status}).` });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";
    res.json({ text, model: OPENROUTER_MODEL });
  } catch (err) {
    const timedOut = err.name === "AbortError";
    console.error("Agent request failed", err);
    res.status(timedOut ? 504 : 500).json({ error: timedOut ? "The agent timed out." : "The agent request failed." });
  } finally {
    clearTimeout(timeout);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`vibe-check listening on ${port}`));
