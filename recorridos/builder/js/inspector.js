/**
 * inspector.js — panel derecho contextual:
 *  · hotspot seleccionado → editor del hotspot
 *  · si no, escena actual  → editor de la escena
 *  · si no, el recorrido   → ajustes del tour
 */
export function renderInspector(app) {
  const host = document.getElementById('inspector');
  const scene = app.currentScene();
  const hotspot = scene?.hotspots?.find(h => h.id === app.selectedHotspotId && !String(h.id).startsWith('__draft'));

  if (hotspot) host.innerHTML = '', renderHotspot(app, host, scene, hotspot);
  else if (scene) renderScene(app, host, scene);
  else renderTour(app, host);
}

/* ---------------- hotspot ---------------- */
function renderHotspot(app, host, scene, h) {
  const scenesOptions = app.manifest.scenes
    .filter(s => s.id !== scene.id)
    .map(s => `<option value="${s.id}" ${h.target === s.id ? 'selected' : ''}>${esc(s.title || s.id)}</option>`).join('');

  const rows = [`
    <div class="insp__head">
      <span class="insp__kicker">Hotspot · ${labelKind(h.type)}</span>
      <button class="insp__x" data-act="deselect" title="Volver a la escena">↩</button>
    </div>`];

  if (h.type !== 'polygon')
    rows.push(field('Posición', `<span class="insp__ro">${h.position ? `yaw ${h.position.yaw}° · pitch ${h.position.pitch}°` : '—'}</span>
      <button class="insp__mini" data-act="reposition">Reubicar (clic en la escena)</button>`));
  else
    rows.push(field('Trazo', `<span class="insp__ro">${(h.positions || []).length} esquinas</span>`));

  if (h.type === 'nav')
    rows.push(
      field('Ir a la escena', `<select data-k="target">${scenesOptions}</select>`),
      field('Etiqueta', `<input type="text" data-k="label" value="${esc(h.label || '')}">`),
    );
  if (h.type === 'link')
    rows.push(
      field('URL', `<input type="url" data-k="url" value="${esc(h.url || '')}">`),
      field('Etiqueta', `<input type="text" data-k="label" value="${esc(h.label || '')}">`),
    );
  if (h.type === 'info' || h.type === 'polygon')
    rows.push(
      field('Título', `<input type="text" data-k="content.title" value="${esc(h.content?.title || '')}">`),
      field('Descripción (HTML simple)', `<textarea data-k="content.html" rows="4">${esc(h.content?.html || '')}</textarea>`),
    );

  rows.push(`<button class="insp__danger" data-act="delete">Eliminar hotspot</button>`);
  host.innerHTML = rows.join('');

  host.querySelector('[data-act="deselect"]').onclick = () => app.selectHotspot(null);
  const rep = host.querySelector('[data-act="reposition"]');
  if (rep) rep.onclick = () => { app.setMode('reposition'); app.toast('Haz clic en la escena para reubicar el hotspot', 'info'); };
  host.querySelector('[data-act="delete"]').onclick = () => app.deleteHotspot(h.id);

  bindFields(host, (k, v) => app.updateHotspot(h.id, pathPatch(k, v)));
}

/* ---------------- escena ---------------- */
function renderScene(app, host, s) {
  const rows = [`<div class="insp__head"><span class="insp__kicker">Escena · ${labelKind(s.type)}</span></div>`];
  rows.push(field('Título', `<input type="text" data-k="title" value="${esc(s.title || '')}">`));

  if (s.type === 'pano360') {
    rows.push(field('Vista inicial',
      `<span class="insp__ro">${s.initialView ? `yaw ${s.initialView.yaw}° · fov ${s.initialView.fov}°` : '—'}</span>
       <button class="insp__mini" data-act="capture">Capturar vista actual</button>`));
    rows.push(field('Norte (para el radar)',
      `<span class="insp__ro">${s.northOffset == null ? 'sin calibrar' : s.northOffset + '°'}</span>
       <div class="insp__north">
         <input type="number" step="0.1" placeholder="bearing°" data-north-bearing style="width:76px">
         <button class="insp__mini" data-act="north">Fijar (centra el rasgo primero)</button>
       </div>`));
  }
  if (s.type === 'potree')
    rows.push(field('Ruta de la nube (metadata.json)', `<input type="text" data-k="cloud.path" value="${esc(s.cloud?.path || '')}">`),
      note('Las nubes se previsualizan en el recorrido publicado. Súbelas a /assets/_potree/clouds/ del sitio.'));
  if (s.type === 'ortho')
    rows.push(field('Tiles (plantilla {z}/{x}/{y})', `<input type="text" data-k="tiles.url" value="${esc(s.tiles?.url || '')}">`));
  if (s.type === 'splat')
    rows.push(note('Escena 3D Gaussian Splatting — el motor llega en una fase posterior. Por ahora se muestra un cartel "próximamente".'));

  host.innerHTML = rows.join('');
  const cap = host.querySelector('[data-act="capture"]'); if (cap) cap.onclick = () => app.captureInitialView();
  const north = host.querySelector('[data-act="north"]');
  if (north) north.onclick = () => app.setNorthFromBearing(parseFloat(host.querySelector('[data-north-bearing]').value));
  bindFields(host, (k, v) => app.updateScene(s.id, pathPatch(k, v)));
}

/* ---------------- tour ---------------- */
function renderTour(app, host) {
  const m = app.manifest;
  host.innerHTML = [
    `<div class="insp__head"><span class="insp__kicker">Recorrido</span></div>`,
    field('Título', `<input type="text" data-k="meta.title" value="${esc(m.meta.title || '')}">`),
    field('Cliente', `<input type="text" data-k="meta.client" value="${esc(m.meta.client || '')}">`),
    field('Descripción', `<textarea data-k="meta.description" rows="3">${esc(m.meta.description || '')}</textarea>`),
    field('Color de marca', `<input type="color" data-k="branding.theme.accent" value="${m.branding?.theme?.accent || '#7BC142'}">`),
    field('Visibilidad', `<select data-k="access.visibility">
       <option value="public" ${m.access?.visibility === 'public' ? 'selected' : ''}>Pública</option>
       <option value="unlisted" ${m.access?.visibility === 'unlisted' ? 'selected' : ''}>No listada</option>
       <option value="gated" ${m.access?.visibility === 'gated' ? 'selected' : ''}>Con acceso restringido</option>
     </select>`),
    note('Selecciona una escena a la izquierda para editarla, o agrega tu primer panorama 360.'),
  ].join('');
  bindFields(host, (k, v) => app.updateTour(pathPatch(k, v)));
}

/* ---------------- helpers ---------------- */
function field(label, control) { return `<label class="insp__field"><span class="insp__label">${label}</span>${control}</label>`; }
function note(txt) { return `<p class="insp__note">${esc(txt)}</p>`; }
function labelKind(k) { return { pano360: 'Panorama 360', potree: 'Nube de puntos', ortho: 'Mapa / ortofoto', splat: 'Escena 3D', nav: 'Navegación', info: 'Información', link: 'Enlace', polygon: 'Trazo de terreno' }[k] || k; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function bindFields(host, onChange) {
  host.querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    const ev = (el.tagName === 'SELECT' || el.type === 'color') ? 'change' : 'input';
    el.addEventListener(ev, () => onChange(k, el.value));
  });
}
function pathPatch(path, value) {
  const parts = path.split('.'); const root = {}; let cur = root;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] = {};
  cur[parts.at(-1)] = value;
  return root;
}
