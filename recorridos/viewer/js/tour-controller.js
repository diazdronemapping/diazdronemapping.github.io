/**
 * tour-controller.js — dueño del manifest, del estado del tour y del ciclo
 * de vida de los Scene Engines. Los engines solo renderizan; el controller
 * navega, persiste vistas y coordina el chrome.
 *
 * Contrato de engine (uno por scene.type):
 *   create(ctx, container) -> engine
 *   engine.show(sceneDef, savedView?)  async
 *   engine.hide()
 *   engine.getView() -> objeto serializable | null
 *   engine.capabilities -> { radar?, autopilot?, gyro? }
 *   engine.animateTo?(lookAtDeg, opts)  async   (autopilot, opcional)
 *   engine.destroy?()
 */

import { loadManifest } from './manifest-loader.js';
import { Chrome } from './chrome.js';

const ENGINE_MODULES = {
  pano360: () => import('./engines/engine-pano360.js'),
  potree: () => import('./engines/engine-potree.js'),
  ortho: () => import('./engines/engine-ortho.js'),
  splat: () => import('./engines/engine-splat.js'),
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class TourController {
  constructor({ tourUrl, debug = false }) {
    this.tourUrl = tourUrl;
    this.baseUrl = tourUrl.slice(0, tourUrl.lastIndexOf('/') + 1);
    this.debug = debug;
    this.embedded = window !== window.top;
    this.isMobile = matchMedia('(pointer: coarse)').matches;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.engines = new Map();      // type -> engine instance
    this.containers = new Map();   // type -> element
    this.viewState = new Map();    // sceneId -> view
    this.currentScene = null;
    this.currentEngine = null;
    this._navToken = 0;
    this._listeners = new Map();
    this._autopilot = null;
  }

  /* ---------- eventos internos (chrome / hud) ---------- */
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
  }
  emit(event, payload) {
    (this._listeners.get(event) || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error(`[recorridos] listener ${event}:`, e); }
    });
  }

  /* ---------- assets ---------- */
  resolveAsset(p) {
    if (!p) return p;
    return p.startsWith('/') || /^https?:/.test(p) ? p : this.baseUrl + p;
  }

  /* ---------- boot ---------- */
  async boot() {
    this.manifest = await loadManifest(this.tourUrl);
    document.title = `${this.manifest.meta.title} · Drone Mapping MX`;
    this._applyTheme();

    this.chrome = new Chrome(this);

    if (this.debug) {
      const { DebugHUD } = await import('./debug-hud.js');
      this.hud = new DebugHUD(this);
    }

    window.addEventListener('popstate', () => {
      // sin hash (entrada inicial) → escena de arranque
      const id = this._parseHash() || this.manifest.start.sceneId;
      if (id !== this.currentScene?.id) this.goTo(id, { fromHistory: true });
    });

    const startId = this._parseHash() || this.manifest.start.sceneId;
    await this.goTo(startId, { fromHistory: true, instant: true });
    // fija el hash de la entrada inicial para que Atrás/Adelante siempre resuelvan
    history.replaceState(null, '', `#scene=${startId}`);
    document.getElementById('loading')?.classList.add('is-done');
    this.emit('ready');
  }

  _applyTheme() {
    const t = this.manifest.branding?.theme || {};
    const root = document.documentElement;
    if (t.accent) root.style.setProperty('--rc-accent', t.accent);
    if (t.bg) root.style.setProperty('--rc-bg', t.bg);
  }

  _parseHash() {
    const m = location.hash.match(/scene=([a-z0-9-]+)/);
    return m && this.manifest?.byId.has(m[1]) ? m[1] : null;
  }

  _writeHash(id, fromHistory) {
    if (fromHistory) return;
    const url = `#scene=${id}`;
    // Embebido: replaceState para que el botón Atrás salga de la página host
    // en un clic en vez de deshacer escena por escena.
    if (this.embedded) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }

  /* ---------- engines ---------- */
  _containerFor(type) {
    if (this.containers.has(type)) return this.containers.get(type);
    let el;
    if (type === 'potree') {
      el = document.getElementById('scene-host-potree');
    } else {
      el = document.createElement('div');
      el.className = `rc-engine rc-engine--${type}`;
      el.style.cssText = 'position:absolute;inset:0;display:none;';
      document.getElementById('scene-host').appendChild(el);
    }
    this.containers.set(type, el);
    return el;
  }

  async engineFor(type) {
    if (this.engines.has(type)) return this.engines.get(type);
    const mod = await ENGINE_MODULES[type]();
    const ctx = {
      controller: this,
      manifest: this.manifest,
      resolveAsset: p => this.resolveAsset(p),
      isMobile: this.isMobile,
      reducedMotion: this.reducedMotion,
      debug: this.debug,
      emit: (ev, payload) => this.emit(ev, payload),
      goTo: id => this.goTo(id),
    };
    const engine = mod.create(ctx, this._containerFor(type));
    this.engines.set(type, engine);
    return engine;
  }

  _showContainer(type) {
    for (const [t, el] of this.containers) {
      const on = t === type;
      if (t === 'potree') el.hidden = !on;
      else el.style.display = on ? 'block' : 'none';
    }
  }

  /* ---------- navegación ---------- */
  async goTo(id, { fromHistory = false, instant = false } = {}) {
    const scene = this.manifest.byId.get(id);
    if (!scene) { console.warn(`[recorridos] escena "${id}" no existe`); return; }
    if (this.currentScene?.id === id) return;

    const token = ++this._navToken;
    const fade = document.getElementById('fade-layer');
    if (!instant) {
      fade.classList.add('is-active');
      await sleep(this.reducedMotion ? 0 : 220);
      if (token !== this._navToken) return; // navegación superada por otra
    }

    // guardar la vista de la escena actual para restaurarla al volver
    if (this.currentScene && this.currentEngine?.getView) {
      const v = this.currentEngine.getView();
      if (v) this.viewState.set(this.currentScene.id, v);
    }

    let engine;
    try {
      engine = await this.engineFor(scene.type);
      if (token !== this._navToken) return;
      if (this.currentEngine && this.currentEngine !== engine) this.currentEngine.hide();
      this._showContainer(scene.type);
      await engine.show(scene, this.viewState.get(id) || null);
    } catch (err) {
      console.error(`[recorridos] error mostrando escena "${id}":`, err);
      fade.classList.remove('is-active');
      throw err;
    }
    if (token !== this._navToken) return;

    this.currentScene = scene;
    this.currentEngine = engine;
    this._writeHash(id, fromHistory);
    this.emit('scene-changed', { scene, engine });

    fade.classList.remove('is-active');
  }

  /* ---------- autopilot ---------- */
  get autopilotRunning() { return !!this._autopilot; }

  async startAutopilot() {
    const cfg = this.manifest.autopilot;
    if (!cfg?.enabled || !cfg.steps?.length || this._autopilot) return;
    const run = { stop: false };
    this._autopilot = run;
    this.emit('autopilot', { running: true });

    const cancel = () => this.stopAutopilot();
    document.addEventListener('pointerdown', cancel, { capture: true, once: true });

    try {
      for (const step of cfg.steps) {
        if (run.stop) break;
        await this.goTo(step.sceneId);
        if (run.stop) break;
        if (step.lookAt && this.currentEngine?.animateTo) {
          await this.currentEngine.animateTo(step.lookAt, { speed: '6rpm' });
        }
        if (run.stop) break;
        await sleep((step.dwell ?? 4) * 1000);
      }
    } finally {
      document.removeEventListener('pointerdown', cancel, { capture: true });
      this._autopilot = null;
      this.emit('autopilot', { running: false });
    }
  }

  stopAutopilot() {
    if (this._autopilot) this._autopilot.stop = true;
  }
}
