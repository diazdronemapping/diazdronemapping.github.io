/**
 * studio.js — el Studio (autoría de recorridos). Orquesta:
 *  · el almacenamiento (FileSystemStore / HttpStore)
 *  · el "escenario" (reutiliza los MISMOS motores del viewer en modo edición)
 *  · los 3 paneles: escenas (izq), inspector (der), barra del escenario (arriba)
 *
 * Reutiliza engine-pano360 / engine-ortho / engine-potree / engine-splat del
 * viewer via un ctx con editMode:true. El editor NO reimplementa el render:
 * lo que ves en el Studio es exactamente lo que verá el cliente.
 */

import { renderSceneList } from './scene-list.js';
import { renderInspector } from './inspector.js';
import { renderStageTools } from './stage-tools.js';
import { validateManifest } from './validate.js';

const ENGINE_MODULES = {
  pano360: () => import('../../viewer/js/engines/engine-pano360.js'),
  ortho:   () => import('../../viewer/js/engines/engine-ortho.js'),
  potree:  () => import('../../viewer/js/engines/engine-potree.js'),
  splat:   () => import('../../viewer/js/engines/engine-splat.js'),
};

let _uidCounter = 0;
const uid = prefix => `${prefix}-${Date.now().toString(36)}${(_uidCounter++).toString(36)}`;

const DRAFT_KEY = 'dm_recorridos_builder_draft_v1';

export class BuilderApp {
  constructor() {
    this.store = null;
    this.manifest = null;
    this.currentSceneId = null;
    this.selectedHotspotId = null;
    this.mode = 'navigate';           // navigate | add-nav | add-info | add-link | reposition | draw-polygon
    this.dirty = false;
    this.lastView = { yawDeg: 0, pitchDeg: 0, fovDeg: 70 };
    this._polygonDraft = null;        // vértices {yaw,pitch} mientras se dibuja
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // motores por tipo (instancia perezosa) + contenedores
    this._engines = new Map();
    this._containers = new Map();
    this._currentEngine = null;
    this._currentEngineType = null;
  }

  /* ============================ arranque ============================ */

  async boot() {
    const params = new URLSearchParams(location.search);
    const dev = params.get('dev');
    if (dev) {
      const { HttpStore } = await import('./project-store.js');
      const base = dev.endsWith('/') ? dev : dev + '/';
      this.store = new HttpStore(new URL(base, location.href).href);
      await this.loadFromStore();
    } else {
      this._renderStart();     // pantalla Nuevo / Abrir
    }
    window.studio = this;      // consola + verificación
  }

  _renderStart() {
    const { FileSystemStore } = { FileSystemStore: null }; // placeholder para el check de soporte
    const supported = 'showDirectoryPicker' in window;
    const el = document.getElementById('start-screen');
    el.hidden = false;
    document.getElementById('workspace').hidden = true;
    el.querySelector('#start-unsupported').hidden = supported;
    el.querySelector('#btn-new').disabled = !supported;
    el.querySelector('#btn-open').disabled = !supported;

    el.querySelector('#btn-new').onclick = () => this.newProject();
    el.querySelector('#btn-open').onclick = () => this.openProject();
  }

  async openProject() {
    const { FileSystemStore } = await import('./project-store.js');
    try {
      this.store = await FileSystemStore.pickExisting();
      await this.loadFromStore();
    } catch (e) { if (e?.name !== 'AbortError') this.toast('No se pudo abrir: ' + e.message, 'error'); }
  }

  async newProject() {
    const name = prompt('Nombre del recorrido (p. ej. "Casa Roma"):', 'Recorrido nuevo');
    if (!name) return;
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recorrido';
    const { FileSystemStore } = await import('./project-store.js');
    try {
      this.store = await FileSystemStore.createNew(slug);
      this.manifest = this._blankManifest(slug, name);
      this.currentSceneId = null;
      await this.store.writeManifest(this.manifest);
      this._enterWorkspace();
      this.toast('Proyecto creado · agrega tu primer panorama 360', 'ok');
    } catch (e) { if (e?.name !== 'AbortError') this.toast('No se pudo crear: ' + e.message, 'error'); }
  }

  async loadFromStore() {
    this.manifest = this._normalize(await this.store.readManifest());
    this.currentSceneId = this.manifest.scenes[0]?.id || null;
    this._enterWorkspace();
    if (this.currentSceneId) await this.selectScene(this.currentSceneId);
  }

  _blankManifest(slug, title) {
    return {
      manifestVersion: 1, id: slug,
      meta: { title, locale: 'es-MX', created: new Date().toISOString().slice(0, 10) },
      branding: { theme: { accent: '#7BC142', bg: '#1A1A1A' } },
      access: { visibility: 'unlisted' },
      start: { sceneId: null },
      idle: { autorotateAfter: 12, rpm: 0.4 },
      scenes: [], ext: {},
    };
  }

  _normalize(m) {
    m.scenes ||= [];
    m.branding ||= { theme: { accent: '#7BC142', bg: '#1A1A1A' } };
    m.meta ||= { title: m.id || 'Recorrido' };
    m.start ||= { sceneId: m.scenes[0]?.id || null };
    m.idle ||= { autorotateAfter: 12, rpm: 0.4 };
    for (const s of m.scenes) if (s.type === 'pano360') s.hotspots ||= [];
    return m;
  }

  _enterWorkspace() {
    document.getElementById('start-screen').hidden = true;
    document.getElementById('workspace').hidden = false;
    document.getElementById('project-name').textContent = this.manifest.meta.title;
    document.getElementById('store-label').textContent = this.store.label;
    this._applyTheme();
    this.render();
  }

  _applyTheme() {
    const t = this.manifest.branding?.theme || {};
    if (t.accent) document.documentElement.style.setProperty('--rc-accent', t.accent);
  }

  /* ============================ escenario ============================ */

  currentScene() { return this.manifest.scenes.find(s => s.id === this.currentSceneId) || null; }

  _ctx() {
    return {
      manifest: this.manifest,
      resolveAsset: p => this.store.assetUrl(p),
      isMobile: false,
      reducedMotion: this.reducedMotion,
      debug: true,
      editMode: true,
      emit: (ev, payload) => this._onEngineEvent(ev, payload),
      goTo: () => {},   // en el editor los hotspots de navegación no navegan
    };
  }

  _containerFor(type) {
    if (this._containers.has(type)) return this._containers.get(type);
    let el;
    if (type === 'potree') {
      el = document.getElementById('stage-potree');
    } else {
      el = document.createElement('div');
      el.className = 'stage-engine';
      el.style.cssText = 'position:absolute;inset:0;display:none;';
      document.getElementById('stage-host').appendChild(el);
    }
    this._containers.set(type, el);
    return el;
  }

  async _engineFor(type) {
    if (this._engines.has(type)) return this._engines.get(type);
    const mod = await ENGINE_MODULES[type]();
    const engine = mod.create(this._ctx(), this._containerFor(type));
    this._engines.set(type, engine);
    return engine;
  }

  _showContainer(type) {
    for (const [t, el] of this._containers) {
      const on = t === type;
      if (t === 'potree') el.hidden = !on;
      else el.style.display = on ? 'block' : 'none';
    }
    // aviso "se previsualiza en el viewer" para escenas no editables aquí
    document.getElementById('stage-nonpano').hidden = (type === 'pano360' || type === 'ortho');
  }

  async selectScene(id) {
    const scene = this.manifest.scenes.find(s => s.id === id);
    if (!scene) return;
    this.currentSceneId = id;
    this.selectedHotspotId = null;
    this.setMode('navigate');

    document.getElementById('stage-empty').hidden = true;
    try {
      await this.store.prepare(scene.src);
      if (scene.thumbnail) await this.store.prepare(scene.thumbnail);
      const engine = await this._engineFor(scene.type);
      if (this._currentEngine && this._currentEngine !== engine) this._currentEngine.hide();
      this._showContainer(scene.type);
      await engine.show(scene, null);
      this._currentEngine = engine;
      this._currentEngineType = scene.type;
    } catch (e) {
      console.error('[studio] error mostrando escena:', e);
      this.toast('No se pudo mostrar la escena: ' + e.message, 'error');
    }
    this.render();
  }

  refreshStage() {
    const scene = this.currentScene();
    if (scene && this._currentEngine?.refresh) this._currentEngine.refresh(scene);
    if (this._currentEngine?.highlight) this._currentEngine.highlight(this.selectedHotspotId);
  }

  _onEngineEvent(ev, payload) {
    if (ev === 'view') {
      this.lastView = payload;
      const r = document.getElementById('stage-readout');
      if (r) r.textContent = `yaw ${payload.yawDeg.toFixed(1)}° · pitch ${payload.pitchDeg.toFixed(1)}° · fov ${payload.fovDeg.toFixed(0)}°`;
    } else if (ev === 'pano-click') {
      this._onStageClick(payload);
    } else if (ev === 'hotspot-select') {
      if (this.mode === 'navigate') this.selectHotspot(payload);
    }
  }

  _onStageClick({ yawDeg, pitchDeg }) {
    const pos = { yaw: +yawDeg.toFixed(1), pitch: +pitchDeg.toFixed(1) };
    if (this.mode === 'reposition' && this.selectedHotspotId) {
      this.updateHotspot(this.selectedHotspotId, { position: pos });
      this.setMode('navigate');
      this.toast('Hotspot reubicado', 'ok');
    } else if (this.mode === 'draw-polygon') {
      this._polygonDraft.push(pos);
      this.toast(`Vértice ${this._polygonDraft.length} · doble clic o "Cerrar" para terminar`, 'info');
      this._previewPolygon();
    } else if (this.mode.startsWith('add-')) {
      this._addHotspot(this.mode.slice(4), pos);
    }
  }

  /* ============================ hotspots ============================ */

  _addHotspot(kind, position) {
    const scene = this.currentScene();
    if (!scene || scene.type !== 'pano360') return;
    const h = { id: uid(kind), type: kind, position };
    if (kind === 'nav') { h.target = this.manifest.scenes.find(s => s.id !== scene.id)?.id || ''; h.label = 'Ir a…'; }
    if (kind === 'info') h.content = { title: 'Nuevo punto', html: '<p>Describe este punto.</p>' };
    if (kind === 'link') { h.url = 'https://'; h.label = 'Enlace'; }
    scene.hotspots.push(h);
    this.markDirty();
    this.selectedHotspotId = h.id;
    this.setMode('navigate');
    this.refreshStage();
    this.render();
  }

  updateHotspot(id, patch) {
    const scene = this.currentScene();
    const h = scene?.hotspots?.find(x => x.id === id);
    if (!h) return;
    deepMerge(h, patch);
    this.markDirty();
    this.refreshStage();
    this.render();
  }

  deleteHotspot(id) {
    const scene = this.currentScene();
    if (!scene) return;
    scene.hotspots = scene.hotspots.filter(x => x.id !== id);
    if (this.selectedHotspotId === id) this.selectedHotspotId = null;
    this.markDirty();
    this.refreshStage();
    this.render();
  }

  selectHotspot(id) {
    this.selectedHotspotId = id;
    if (this._currentEngine?.highlight) this._currentEngine.highlight(id);
    this.render();
  }

  /* -------- polígono (trazo de terreno) -------- */
  startPolygon() {
    this._polygonDraft = [];
    this.setMode('draw-polygon');
    this.toast('Haz clic en cada esquina del terreno · doble clic o "Cerrar" para terminar', 'info');
  }
  _previewPolygon() {
    const scene = this.currentScene();
    if (!scene) return;
    scene.hotspots = scene.hotspots.filter(h => h.id !== '__draft-poly');
    if (this._polygonDraft.length >= 2) {
      scene.hotspots.push({
        id: '__draft-poly', type: 'polygon', positions: this._polygonDraft.slice(),
        style: { stroke: '#7BC142', fill: 'rgba(123,193,66,0.16)' },
        content: { title: 'Terreno' },
      });
    }
    this.refreshStage();
  }
  finishPolygon() {
    const scene = this.currentScene();
    scene.hotspots = scene.hotspots.filter(h => h.id !== '__draft-poly');
    if (this._polygonDraft && this._polygonDraft.length >= 3) {
      const h = {
        id: uid('poly'), type: 'polygon', positions: this._polygonDraft.slice(),
        style: { stroke: '#7BC142', fill: 'rgba(123,193,66,0.16)' },
        content: { title: 'Terreno', html: '<p>Describe el terreno.</p>' },
      };
      scene.hotspots.push(h);
      this.selectedHotspotId = h.id;
      this.markDirty();
      this.toast('Trazo del terreno creado', 'ok');
    } else {
      this.toast('Un trazo necesita al menos 3 esquinas', 'error');
    }
    this._polygonDraft = null;
    this.setMode('navigate');
    this.refreshStage();
    this.render();
  }

  /* ============================ escenas ============================ */

  async ingestPano(file) {
    if (!file) return;
    if (!this.store.canWrite && this.store.constructor.name === 'HttpStore') {
      // en dev igual permitimos previsualizar (object URL en memoria)
    }
    const idx = this.manifest.scenes.filter(s => s.type === 'pano360').length + 1;
    const base = `pano-${String(idx).padStart(2, '0')}`;
    const srcPath = `assets/360/${base}.jpg`;
    const thumbPath = `assets/thumbs/${base}.jpg`;

    await this.store.putAsset(srcPath, file);
    const thumb = await makeThumbnail(file, 320);
    if (thumb) await this.store.putAsset(thumbPath, thumb);

    const scene = {
      type: 'pano360', id: uid('pano'), title: `Escena ${idx}`,
      thumbnail: thumbPath, src: srcPath,
      initialView: { yaw: 0, pitch: 0, fov: 70 }, northOffset: null, hotspots: [],
    };
    this.manifest.scenes.push(scene);
    if (!this.manifest.start.sceneId) this.manifest.start.sceneId = scene.id;
    this.markDirty();
    await this.selectScene(scene.id);
    this.toast(`Panorama agregado: ${scene.title}`, 'ok');
  }

  addScene(type) {
    const n = this.manifest.scenes.length + 1;
    let scene;
    if (type === 'splat') scene = { type: 'splat', id: uid('splat'), title: `Escena 3D ${n}`, src: null };
    else if (type === 'ortho') scene = { type: 'ortho', id: uid('ortho'), title: `Mapa ${n}`, tiles: { url: '', tms: true, minZoom: 16, maxNativeZoom: 21 }, layers: [], hotspots: [] };
    else if (type === 'potree') scene = { type: 'potree', id: uid('nube'), title: `Nube ${n}`, cloud: { path: '/assets/_potree/clouds/', pointBudget: 1500000 }, tools: { measure: true }, hotspots: [] };
    else return;
    this.manifest.scenes.push(scene);
    if (!this.manifest.start.sceneId) this.manifest.start.sceneId = scene.id;
    this.markDirty();
    this.selectScene(scene.id);
  }

  updateScene(id, patch) {
    const s = this.manifest.scenes.find(x => x.id === id);
    if (!s) return;
    deepMerge(s, patch);
    this.markDirty();
    if (id === this.currentSceneId && ('title' in patch)) this.render();
    else this.render();
  }

  deleteScene(id) {
    if (!confirm('¿Eliminar esta escena del recorrido?')) return;
    this.manifest.scenes = this.manifest.scenes.filter(s => s.id !== id);
    // limpiar navegaciones colgadas
    for (const s of this.manifest.scenes)
      if (s.hotspots) s.hotspots = s.hotspots.filter(h => h.type !== 'nav' || h.target !== id);
    if (this.manifest.start.sceneId === id) this.manifest.start.sceneId = this.manifest.scenes[0]?.id || null;
    this.markDirty();
    if (this.currentSceneId === id) {
      const next = this.manifest.scenes[0]?.id || null;
      if (next) this.selectScene(next);
      else { this.currentSceneId = null; document.getElementById('stage-empty').hidden = false; this.render(); }
    } else this.render();
  }

  setStartScene(id) { this.manifest.start.sceneId = id; this.markDirty(); this.render(); }

  captureInitialView() {
    const scene = this.currentScene();
    if (!scene || scene.type !== 'pano360') return;
    const v = this._currentEngine?.getView?.();
    if (!v) return;
    scene.initialView = { yaw: +v.yaw.toFixed(1), pitch: +v.pitch.toFixed(1), fov: Math.round(v.fov) };
    this.markDirty();
    this.toast('Vista inicial capturada', 'ok');
    this.render();
  }

  /** Asistente de norte: northOffset = bearing del rasgo − yaw actual. */
  setNorthFromBearing(bearing) {
    const scene = this.currentScene();
    if (!scene || Number.isNaN(bearing)) return;
    let off = (bearing - this.lastView.yawDeg) % 360;
    if (off > 180) off -= 360; if (off < -180) off += 360;
    scene.northOffset = +off.toFixed(1);
    this.markDirty();
    this.toast(`Norte calibrado: ${scene.northOffset}°`, 'ok');
    this.render();
  }

  updateTour(patch) { deepMerge(this.manifest, patch); this.markDirty(); this._applyTheme();
    document.getElementById('project-name').textContent = this.manifest.meta.title; this.render(); }

  /* ============================ guardar / preview ============================ */

  markDirty() { this.dirty = true; this._saveDraft(); this._updateSaveBtn(); }
  _updateSaveBtn() {
    const b = document.getElementById('btn-save');
    if (b) { b.classList.toggle('is-dirty', this.dirty); b.textContent = this.dirty ? 'Guardar •' : 'Guardado'; }
  }
  _saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ id: this.manifest.id, manifest: this.manifest, at: Date.now() })); } catch {}
  }

  async save() {
    const problems = validateManifest(this.manifest);
    const errors = problems.filter(p => p.level === 'error');
    if (errors.length) {
      this.toast(`No se guardó: ${errors[0].msg}`, 'error');
      this.render();
      return false;
    }
    // limpia cualquier draft de polígono a medias
    for (const s of this.manifest.scenes) if (s.hotspots) s.hotspots = s.hotspots.filter(h => !String(h.id).startsWith('__draft'));
    this.manifest.meta.updated = new Date().toISOString().slice(0, 10);
    try {
      await this.store.writeManifest(this.manifest);
      this.dirty = false; this._updateSaveBtn();
      this.toast(this.store.canWrite ? 'Guardado en la carpeta del proyecto' : 'manifest.json descargado (modo dev)', 'ok');
      return true;
    } catch (e) { this.toast('Error al guardar: ' + e.message, 'error'); return false; }
  }

  preview() {
    const dev = new URLSearchParams(location.search).get('dev');
    if (dev) {
      // el viewer lee el mismo manifest por HTTP (versión en disco)
      const manifestUrl = new URL((dev.endsWith('/') ? dev : dev + '/') + 'manifest.json', location.href).href;
      window.open(`../viewer/?manifest=${encodeURIComponent(manifestUrl)}`, '_blank');
    } else {
      this.toast('Guarda, y verás el recorrido final una vez publicado. Aquí en el Studio ya lo ves tal cual mientras editas.', 'info');
    }
  }

  /* ============================ util UI ============================ */

  setMode(m) {
    if (m === 'navigate' && this._polygonDraft) { // cancelar dibujo
      const scene = this.currentScene();
      if (scene) scene.hotspots = scene.hotspots.filter(h => h.id !== '__draft-poly');
      this._polygonDraft = null;
      this.refreshStage();
    }
    this.mode = m;
    document.body.dataset.mode = m;
    this.render();
  }

  render() {
    if (!this.manifest) return;
    renderSceneList(this);
    renderInspector(this);
    renderStageTools(this);
  }

  toast(msg, kind = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast is-' + kind; t.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.hidden = true; }, 3200);
  }
}

/* ---------- helpers ---------- */
function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k]))
      deepMerge(target[k], v);
    else target[k] = v;
  }
  return target;
}

async function makeThumbnail(file, w) {
  try {
    const bmp = await createImageBitmap(file);
    const h = Math.round(w * bmp.height / bmp.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.78));
  } catch { return null; }
}
