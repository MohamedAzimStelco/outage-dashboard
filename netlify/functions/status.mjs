import { getStore } from '@netlify/blobs';

export default async () => {
  const store = getStore('status-store');
  const data = await store.get('current', { type: 'json' });
  const fallback = { affected: 0, total: 0, healthy: 0, pct: 0, subsOff: 0, subsOn: 0, subsTotal: 0, offPct: 0, updatedAt: null };

  return new Response(JSON.stringify(data ?? fallback), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    }
  });
}
