// SW: sirve /assets/_potree/clouds/parcelas/octree.bin desde chunks <100MB (GitHub Pages).
const TOTAL = 603132040;
const CHUNK = 94371840;
const COUNT = 7;
const TARGET = '/assets/_potree/clouds/parcelas/octree.bin';
const DIR = '/assets/_potree/clouds/parcelas/';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

function chunkName(k){ return DIR + 'octree.bin.' + String(k).padStart(3,'0'); }

async function readRange(start, end){ // inclusive end
  const parts = [];
  let k0 = Math.floor(start / CHUNK), k1 = Math.floor(end / CHUNK);
  for (let k = k0; k <= k1; k++){
    const base = k * CHUNK;
    const from = Math.max(start, base) - base;
    const to   = Math.min(end, base + CHUNK - 1) - base; // inclusive dentro del chunk
    const resp = await fetch(chunkName(k), { headers: { Range: `bytes=${from}-${to}` } });
    let buf;
    if (resp.status === 206){ buf = await resp.arrayBuffer(); }
    else { // host no dio 206 → tomar todo el chunk y rebanar
      const full = await resp.arrayBuffer();
      buf = full.slice(from, to + 1);
    }
    parts.push(new Uint8Array(buf));
  }
  let len = parts.reduce((a,p)=>a+p.byteLength, 0);
  const out = new Uint8Array(len); let off = 0;
  for (const p of parts){ out.set(p, off); off += p.byteLength; }
  return out;
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.endsWith('octree.bin')) return;
  event.respondWith((async () => {
    const range = event.request.headers.get('range');
    let start = 0, end = TOTAL - 1;
    if (range){
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m){
        if (m[1] === '' && m[2] !== ''){ start = TOTAL - parseInt(m[2],10); end = TOTAL - 1; }
        else { start = parseInt(m[1],10); end = m[2] ? parseInt(m[2],10) : TOTAL - 1; }
      }
    }
    start = Math.max(0, start); end = Math.min(TOTAL - 1, end);
    const body = await readRange(start, end);
    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, max-age=31536000',
    };
    let status = 200;
    if (range){ status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${TOTAL}`; }
    return new Response(body, { status, headers });
  })());
});
