// SW: sirve octree.bin de nubes grandes (>100MB) desde chunks <100MB (límite de archivo de GitHub).
// Mapa EXPLÍCITO de nubes → total de bytes. Solo intercepta estas rutas; todo lo demás pasa directo
// (clouds pequeñas con octree.bin monolítico NO se tocan).
const CHUNK = 90 * 1024 * 1024; // 94371840 — debe coincidir con el chunker
const CLOUDS = {
  '/assets/_potree/clouds/parcelas/octree.bin': 603132040,
  '/assets/_potree/clouds/agua-blanca-veg/octree.bin': 532335521,
};

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

function chunkName(target, k){ return target + '.' + String(k).padStart(3, '0'); }

async function readRange(target, total, start, end){ // end inclusive
  const parts = [];
  const k0 = Math.floor(start / CHUNK), k1 = Math.floor(end / CHUNK);
  for (let k = k0; k <= k1; k++){
    const base = k * CHUNK;
    const from = Math.max(start, base) - base;
    const to   = Math.min(end, base + CHUNK - 1) - base;
    const resp = await fetch(chunkName(target, k), { headers: { Range: `bytes=${from}-${to}` } });
    let buf;
    if (resp.status === 206){ buf = await resp.arrayBuffer(); }
    else { const full = await resp.arrayBuffer(); buf = full.slice(from, to + 1); }
    parts.push(new Uint8Array(buf));
  }
  let len = parts.reduce((a, p) => a + p.byteLength, 0);
  const out = new Uint8Array(len); let off = 0;
  for (const p of parts){ out.set(p, off); off += p.byteLength; }
  return out;
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const total = CLOUDS[url.pathname];
  if (url.origin !== self.location.origin || total === undefined) return; // solo nubes chunked listadas
  event.respondWith((async () => {
    const range = event.request.headers.get('range');
    let start = 0, end = total - 1;
    if (range){
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m){
        if (m[1] === '' && m[2] !== ''){ start = total - parseInt(m[2], 10); end = total - 1; }
        else { start = parseInt(m[1], 10); end = m[2] ? parseInt(m[2], 10) : total - 1; }
      }
    }
    start = Math.max(0, start); end = Math.min(total - 1, end);
    const body = await readRange(url.pathname, total, start, end);
    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, max-age=31536000',
    };
    let status = 200;
    if (range){ status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${total}`; }
    return new Response(body, { status, headers });
  })());
});
