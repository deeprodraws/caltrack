const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

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

function isRateLimit(err) {
  return (
    err?.status === 429 ||
    err?.httpErrorCode === 429 ||
    /429|quota|rate.?limit|resource.?exhausted/i.test(err?.message || '')
  );
}

router.post('/', async (req, res) => {
  const { image, mediaType } = req.body;
  if (!image) return res.status(400).json({ error: 'image (base64) required' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'paste-your-key-here') {
    return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // gemini-1.5-flash: free tier, vision-capable, fast
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  async function generate() {
    const result = await model.generateContent([
      { inlineData: { mimeType: mediaType || 'image/jpeg', data: image } },
      PROMPT,
    ]);
    return result.response.text().trim();
  }

  function parseJSON(text) {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(cleaned);
  }

  try {
    // First attempt
    let parsed;
    try {
      const text = await generate();
      parsed = parseJSON(text);
    } catch (firstErr) {
      if (isRateLimit(firstErr)) {
        return res.status(429).json({
          error: 'Scan limit reached — Gemini free tier is rate-limited. Wait a minute and try again.',
        });
      }
      // Retry once on transient error or bad JSON
      const text2 = await generate();
      parsed = parseJSON(text2);
    }

    if (!parsed.items || !Array.isArray(parsed.items)) {
      return res.status(422).json({ error: 'Unexpected response format from AI. Try a clearer photo.' });
    }

    res.json(parsed);
  } catch (err) {
    if (isRateLimit(err)) {
      return res.status(429).json({
        error: 'Scan limit reached — Gemini free tier is rate-limited. Wait a minute and try again.',
      });
    }
    if (err instanceof SyntaxError) {
      return res.status(422).json({ error: 'AI returned invalid JSON. Try a clearer photo.' });
    }
    console.error('Scan error:', err.message);
    res.status(500).json({ error: err.message || 'Scan failed' });
  }
});

module.exports = router;
