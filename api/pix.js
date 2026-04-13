// Vercel Serverless Function — proxy para SillientPay
const CLIENT_ID     = 'sp_live_bd6b696279e958b88441989386d84625';
const CLIENT_SECRET = 'sk_1470d9d9e689c96cdbfb1b716fccc16404109e27fe2c8426dd2a5909e188d8d6';
const BASE          = 'https://api.sillientpay.com';

function authHeader() {
  return 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // POST /api/pix — criar cobrança
    if (req.method === 'POST') {
      const { amount, description, name, email } = req.body;
      const payload = {
        method: 'pix',
        amount: Math.round(amount * 100),
        description,
        customer: {
          name: name || 'Cliente',
          email: email || 'cliente@email.com',
          document: '00000000000',
          phone: '11999999999',
        },
        pix: { expiresInDays: 1 },
      };

      const r = await fetch(BASE + '/api/v1/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader() },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    // GET /api/pix?id=xxx — consultar status
    if (req.method === 'GET') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const r = await fetch(BASE + '/api/v1/transactions/' + id, {
        headers: { 'Authorization': authHeader() },
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
