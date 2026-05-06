// Endpoint de export — baixa toda a base como JSON. Útil pra backup.
import { redis } from '../lib/shared.js';

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (process.env.SETUP_SECRET && auth !== `Bearer ${process.env.SETUP_SECRET}`) {
    return res.status(401).json({ ok: false });
  }
  const data = await redis.get('lugares_data');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="lugares.json"');
  res.status(200).send(JSON.stringify(data, null, 2));
}
