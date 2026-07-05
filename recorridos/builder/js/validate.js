/**
 * validate.js — chequeo de invariantes del manifest antes de guardar.
 * No es JSON-Schema completo (eso vive en schema/manifest.schema.json); aquí
 * validamos lo que ROMPE el recorrido, en lenguaje del usuario.
 * Devuelve [{ level:'error'|'warn', msg }].
 */
export function validateManifest(m) {
  const out = [];
  const err = msg => out.push({ level: 'error', msg });
  const warn = msg => out.push({ level: 'warn', msg });

  if (!m.meta?.title) err('El recorrido necesita un título.');
  if (!m.scenes?.length) { err('El recorrido no tiene escenas.'); return out; }

  const ids = new Set();
  for (const s of m.scenes) {
    if (!s.id) { err('Hay una escena sin identificador.'); continue; }
    if (ids.has(s.id)) err(`Escena repetida: "${s.id}".`);
    ids.add(s.id);
    if (!s.title) warn(`La escena "${s.id}" no tiene título.`);
    if (s.type === 'pano360' && !s.src) err(`La escena "${s.title || s.id}" no tiene panorama.`);
    if (s.type === 'potree' && !s.cloud?.path) warn(`La nube "${s.title || s.id}" no tiene ruta.`);
  }

  if (!m.start?.sceneId) err('No hay escena de inicio.');
  else if (!ids.has(m.start.sceneId)) err('La escena de inicio no existe.');

  for (const s of m.scenes) {
    for (const h of s.hotspots || []) {
      if (String(h.id).startsWith('__draft')) continue;
      if (h.type === 'nav') {
        if (!h.target) warn(`Un botón "ir a" en "${s.title || s.id}" no apunta a ninguna escena.`);
        else if (!ids.has(h.target)) err(`Un botón en "${s.title || s.id}" apunta a una escena que ya no existe.`);
      }
      if (h.type === 'link' && (!h.url || h.url === 'https://')) warn(`Un enlace en "${s.title || s.id}" está vacío.`);
      if (h.type === 'polygon' && (!h.positions || h.positions.length < 3)) warn(`Un trazo en "${s.title || s.id}" tiene menos de 3 esquinas.`);
    }
  }
  return out;
}
