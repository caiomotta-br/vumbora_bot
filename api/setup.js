import { redis, TG_TOKEN } from '../lib/shared.js';
import seed from '../data/seed.js';

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (process.env.SETUP_SECRET && auth !== `Bearer ${process.env.SETUP_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'SETUP_SECRET inválido' });
  }

  const log = [];
  const existing = await redis.get('lugares_data');
  if (existing && !req.query.force) {
    log.push(`base já existe com ${existing.lugares?.length || 0} lugares (use ?force=1 pra sobrescrever)`);
  } else {
    await redis.set('lugares_data', seed);
    log.push(`base populada com ${seed.lugares.length} lugares`);
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const webhookUrl = `${proto}://${host}/api/telegram`;

  const tgRes = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message', 'edited_message'],
    }),
  });
  const tgJson = await tgRes.json();
  log.push(`telegram setWebhook: ${JSON.stringify(tgJson)}`);

  const infoRes = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getWebhookInfo`);
  const info = await infoRes.json();

  res.status(200).json({
    ok: true,
    webhookUrl,
    log,
    webhookInfo: info.result,
    proximoPasso: 'Mande /start pro seu bot no Telegram pra testar.',
  });
}
