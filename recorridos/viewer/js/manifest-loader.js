/**
 * manifest-loader.js — carga y normaliza el manifest.json de un tour.
 * Contrato: schema/manifest.schema.json (v1).
 * Forward-compat: tipos de escena/hotspot DESCONOCIDOS se descartan con
 * console.warn — el viewer nunca crashea por un manifest más nuevo.
 */

const KNOWN_SCENE_TYPES = ['pano360', 'potree', 'ortho', 'splat'];
const KNOWN_HOTSPOT_TYPES = {
  pano360: ['nav', 'info', 'link', 'polygon'],
  potree: ['nav', 'info', 'link'],
  ortho: ['nav', 'info', 'link'],
  splat: [],
};

export async function loadManifest(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`manifest ${res.status} ${res.statusText} (${url})`);
  const raw = await res.json();

  if (raw.manifestVersion !== 1) {
    console.warn(`[recorridos] manifestVersion ${raw.manifestVersion} > 1 — se intenta leer como v1 (forward-compat)`);
  }
  if (!raw.id || !raw.meta?.title || !raw.start?.sceneId || !Array.isArray(raw.scenes)) {
    throw new Error('manifest inválido: faltan id/meta.title/start.sceneId/scenes');
  }

  const scenes = [];
  for (const scene of raw.scenes) {
    if (!KNOWN_SCENE_TYPES.includes(scene.type)) {
      console.warn(`[recorridos] escena "${scene.id}" tipo desconocido "${scene.type}" — ignorada`);
      continue;
    }
    const knownHs = KNOWN_HOTSPOT_TYPES[scene.type];
    const hotspots = (scene.hotspots || []).filter(h => {
      if (!knownHs.includes(h.type)) {
        console.warn(`[recorridos] hotspot "${h.id}" tipo "${h.type}" no soportado en escena ${scene.type} — ignorado`);
        return false;
      }
      return true;
    });
    scenes.push({ ...scene, hotspots });
  }
  if (!scenes.length) throw new Error('manifest sin escenas soportadas');

  const byId = new Map(scenes.map(s => [s.id, s]));
  let startId = raw.start.sceneId;
  if (!byId.has(startId)) {
    console.warn(`[recorridos] start.sceneId "${startId}" no existe — usando la primera escena`);
    startId = scenes[0].id;
  }

  return {
    ...raw,
    scenes,
    byId,
    start: { ...raw.start, sceneId: startId },
    idle: { autorotateAfter: 12, rpm: 0.4, ...(raw.idle || {}) },
    branding: raw.branding || {},
    autopilot: raw.autopilot || { enabled: false, steps: [] },
  };
}
