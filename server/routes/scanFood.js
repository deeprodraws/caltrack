const express = require('express');
const router = express.Router();

// Override via GEMINI_MODEL env var in Railway if this default 404s
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

const PROMPT = `You are a nutrition expert. Analyze this food image and identify all food items visible.

For each item, estimate the nutritional content for the visible portion size.

Respond ONLY with valid JSON — no markdown, no extra text, nothing before or after:
{
  "items": [
    {
      "name": "Grilled chicken breast",
      "calories": 250,
      "protein": 30.0,
      "carbs": 0.0,
      "fat": 8.0,
      "serving_description": "~150g / 1 breast",
      "confidence": "high"
    }
  ]
}

Rules:
- confidence must be "high", "medium", or "low"
  - high: food is clearly visible and portion is estimable
  - medium: food is identifiable but portion is uncertain
  - low: food is unclear, obscured, or heavily mixed
- Round all numbers to 1 decimal place. Use 0 if a macro is negligible.
- If the image contains no food, return { "items": [] }`;

async function callGemini(apiKey, imageBase64, mimeType, version = 'v1beta') {
  const url = `${GEMINI_BASE}/${version}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
          { text: PROMPT },
        ],
      }],
      generationConfig: { temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

function parseJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}

// List available models — useful for debugging which models your API key can access
router.get('/models', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY not set' });

  try {
    const r = await fetch(`${GEMINI_BASE}/v1beta/models?key=${apiKey}`);
    const data = await r.json();
    const names = (data.models || []).map(m => m.name);
    res.json({ current_model: GEMINI_MODEL, available: names });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { image, mediaType } = req.body;
  if (!image) return res.status(400).json({ error: 'image (base64) required' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'paste-your-key-here') {
    return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  try {
    let text;
    try {
      text = await callGemini(apiKey, image, mediaType, 'v1beta');
    } catch (firstErr) {
      if (firstErr.status === 429) {
        return res.status(429).json({
          error: 'Scan limit reached — Gemini free tier is rate-limited. Wait a minute and try again.',
        });
      }
      if (firstErr.status === 404) {
        // Model not found — don't retry, report clearly
        console.error(`Model "${GEMINI_MODEL}" not found. Check /api/scan-food/models for available models, then set GEMINI_MODEL env var in Railway.`);
        return res.status(503).json({
          error: `AI model "${GEMINI_MODEL}" not found. The server admin needs to update the GEMINI_MODEL setting.`,
        });
      }
      // Retry once on transient network / parse error only
      text = await callGemini(apiKey, image, mediaType, 'v1beta');
    }

    const parsed = parseJSON(text);

    if (!parsed.items || !Array.isArray(parsed.items)) {
      return res.status(422).json({ error: 'Unexpected response format from AI. Try a clearer photo.' });
    }

    res.json(parsed);
  } catch (err) {
    if (err.status === 429) {
      return res.status(429).json({
        error: 'Scan limit reached — Gemini free tier is rate-limited. Wait a minute and try again.',
      });
    }
    if (err instanceof SyntaxError) {
      return res.status(422).json({ error: 'AI returned invalid JSON. Try a clearer photo.' });
    }
    console.error('Scan error:', err.status, err.message);
    res.status(500).json({ error: err.message || 'Scan failed' });
  }
});

module.exports = router;
