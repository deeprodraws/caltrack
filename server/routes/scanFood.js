const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

router.post('/', async (req, res) => {
  const { image, mediaType } = req.body;

  if (!image) return res.status(400).json({ error: 'image (base64) required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'paste-your-key-here') {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured in server/.env' });
  }

  const client = new Anthropic({ apiKey });

  const prompt = `You are a nutrition expert. Analyze this food image and identify all food items visible.

For each distinct food item, estimate the nutritional content for the visible portion size.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "items": [
    {
      "name": "Food name (be specific, e.g. 'Grilled chicken breast' not just 'chicken')",
      "calories": 250,
      "protein": 30,
      "carbs": 0,
      "fat": 8,
      "serving_description": "~150g / 1 breast",
      "confidence": "high"
    }
  ]
}

confidence must be "high", "medium", or "low".
- high: food is clearly identifiable and portion is estimable
- medium: food is identifiable but portion is uncertain
- low: food is unclear or heavily obscured

Round all numbers to one decimal place. Use 0 if a macro is negligible.
If the image contains no food, return { "items": [] }.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const text = response.content[0].text.trim();

    // Strip markdown code fences if Claude wraps the JSON
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(jsonText);

    if (!parsed.items || !Array.isArray(parsed.items)) {
      return res.status(422).json({ error: 'Unexpected response format from AI' });
    }

    res.json(parsed);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(422).json({ error: 'AI returned non-JSON response. Try a clearer photo.' });
    }
    console.error('Scan error:', err.message);
    res.status(500).json({ error: err.message || 'Scan failed' });
  }
});

module.exports = router;
