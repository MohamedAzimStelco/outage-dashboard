import { getStore } from '@netlify/blobs';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization'
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: cors });

  try {
    const body = await req.json();
    const payload = {
      affected: Number(body.affected ?? 0),
      total: Number(body.total ?? 0),
      healthy: Number(body.healthy ?? Math.max(0, (body.total ?? 0) - (body.affected ?? 0))),
      pct: Number(body.pct ?? (body.total ? Math.round(((body.affected / body.total) * 100) * 10) / 10 : 0)),
      subsOff: Number(body.subsOff ?? 0),
      subsOn: Number(body.subsOn ?? 0),
      subsTotal: Number(body.subsTotal ?? ((body.subsOff ?? 0) + (body.subsOn ?? 0))),
      offPct: Number(body.offPct ?? (body.subsTotal ? Math.round(((body.subsOff / body.subsTotal) * 100) * 10) / 10 : 0)),
      updatedAt: new Date().toISOString()
    };

    const store = getStore('status-store');
    await store.set('current', JSON.stringify(payload));

    return new Response('OK', { status: 200, headers: { ...cors, 'content-type': 'text/plain' } });
  } catch {
    return new Response('Bad Request', { status: 400, headers: cors });
  }
}
