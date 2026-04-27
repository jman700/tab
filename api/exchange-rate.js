// GET /api/exchange-rate?from=MXN&to=USD
// Proxies Frankfurter (ECB data) so the browser doesn't hit CORS / regional blocks.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { from, to = 'USD' } = req.query;
  if (!from) return res.status(400).json({ error: 'Missing from parameter' });
  if (from === to) return res.status(200).json({ rate: 1, date: null });

  try {
    const response = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    if (!response.ok) throw new Error(`Frankfurter ${response.status}`);
    const data = await response.json();
    const rate = data.rates?.[to];
    if (!rate) throw new Error('Rate not in response');
    return res.status(200).json({ rate, date: data.date });
  } catch (err) {
    console.error('Exchange rate error:', err.message);
    return res.status(502).json({ error: 'Could not fetch exchange rate' });
  }
}
