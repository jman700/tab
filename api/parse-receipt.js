// ============================================================
// TAB — Receipt OCR Serverless Function
// POST /api/parse-receipt
// Body: { image: base64string, mediaType: "image/jpeg" }
// Returns: { restaurant, items: [{name, price, quantity, note}], taxes: [{label, amount}], tax, tax_included, date }
// ============================================================

import Anthropic from '@anthropic-ai/sdk';

// Raise Vercel's default 4.5 MB body limit — base64 phone photos can hit 6–8 MB
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
};

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a receipt parser. Extract all food and drink items from receipt images.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation. Use this exact structure:
{
  "restaurant": "restaurant name if visible, otherwise null",
  "currency":   "MXN",
  "items": [
    {
      "name":     "item name as printed",
      "quantity": 1,
      "price":    12.50,
      "note":     "modifier or description, or null"
    }
  ],
  "taxes": [
    { "label": "Tax", "amount": 3.50 }
  ],
  "tax_included": false,
  "date":         "2024-03-15"
}

Rules:
- "currency" is the ISO 4217 code (e.g. USD, MXN, EUR, GBP, JPY, CAD, AUD, BRL). Detect from currency symbols, words like "pesos", "euros", "yenes", price formatting, or country context. Default to "USD" if genuinely unclear.
- "price" is the price per unit (not total for the line)
- "quantity" is the number of units ordered
- "tax_included" is true only if tax is already baked into item prices (no separate tax line on the receipt)
- "date" is the date printed on the receipt in YYYY-MM-DD format, or null if not visible or not a date you're confident about
- "taxes" is an array of all separate tax/fee lines on the receipt (Tax, IVA, VAT, Service Fee, etc.). Each entry has a "label" (as printed) and "amount". If no separate tax lines, use an empty array [].
- If tax_included is true, set "taxes" to [].
- Use separate entries in "taxes" for distinct tax lines (e.g. food tax + alcohol tax = two entries).
- Do NOT include items with $0 price (complimentary items, service charges listed as $0)
- Do NOT include tip/gratuity as an item
- If you cannot confidently read a price, make your best estimate
- Keep item names as close to the receipt as possible`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { image, mediaType } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
  const type = validTypes.includes(mediaType) ? mediaType : 'image/jpeg';

  // HEIC/HEIF not supported by Claude Vision — treat as JPEG
  const claudeType = (type === 'image/heic' || type === 'image/heif') ? 'image/jpeg' : type;

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type:   'image',
              source: { type: 'base64', media_type: claudeType, data: image },
            },
            {
              type: 'text',
              text: 'Parse this receipt.',
            },
          ],
        },
      ],
    });

    const text  = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```(?:json)?/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Claude sometimes wraps JSON or adds trailing text — try to extract it
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          // Also strip trailing commas before } or ] which Claude occasionally adds
          const fixed = match[0].replace(/,(\s*[}\]])/g, '$1');
          parsed = JSON.parse(fixed);
        } catch {
          console.error('JSON parse failed after extraction attempt:', clean.slice(0, 500));
          return res.status(422).json({ error: 'Could not parse receipt — please add items manually' });
        }
      } else {
        console.error('No JSON object found in Claude response:', clean.slice(0, 500));
        return res.status(422).json({ error: 'Could not parse receipt — please add items manually' });
      }
    }

    const validCurrencies = ['USD','EUR','GBP','JPY','CAD','AUD','MXN','BRL','INR','CNY','KRW','SGD','HKD','CHF','NOK','SEK','NZD','ZAR','AED','THB','MYR','PHP','IDR','COP','CLP','PEN','ARS'];
    const detectedCurrency = String(parsed.currency || 'USD').toUpperCase().trim();

    const taxes = (Array.isArray(parsed.taxes) ? parsed.taxes : [])
      .map(t => ({ label: String(t.label || 'Tax').trim(), amount: Math.max(0, parseFloat(t.amount) || 0) }))
      .filter(t => t.amount > 0);

    // Keep scalar `tax` for backward compat — sum of all tax lines
    const taxTotal = taxes.reduce((s, t) => s + t.amount, 0);

    const sanitized = {
      restaurant:   parsed.restaurant || null,
      currency:     validCurrencies.includes(detectedCurrency) ? detectedCurrency : 'USD',
      taxes,
      tax:          taxTotal,
      tax_included: Boolean(parsed.tax_included),
      date: (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date)))
        ? String(parsed.date)
        : null,
      items: (parsed.items || [])
        .map(item => ({
          name:     String(item.name     || 'Unknown Item').trim(),
          quantity: Math.max(1, parseInt(item.quantity) || 1),
          price:    Math.max(0, parseFloat(item.price)  || 0),
          note:     item.note ? String(item.note).trim() : null,
        }))
        .filter(item => item.price > 0),
    };

    return res.status(200).json(sanitized);

  } catch (err) {
    console.error('Claude API error:', err);
    return res.status(500).json({ error: 'Receipt scanning failed — please add items manually' });
  }
}
