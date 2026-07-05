/**
 * chrome.js — UI persistente compartida entre escenas: barra superior,
 * menú de escenas con miniaturas, planta+radar, panel de info de hotspots,
 * controles (autopilot · gyro · música · pantalla completa).
 * Los plugins Map/Plan/Gallery de PSV viven DENTRO del contenedor PSV y
 * desaparecerían en escenas Potree/ortho — por eso este chrome es custom.
 */

import { normDeg } from './geo-core.js';

const SCENE_BADGE = { pano360: '360', potree: '3D', ortho: 'MAPA', splat: '3D+' };

export class Chrome {
  constructor(controller) {
    this.c = controller;
    this.m = controller.manifest;

    this._buildTop();
    this._buildMenu();
    this._buildPlan();
    this._bindInfoPanel();
    this._bindControls();

    controller.on('scene-changed', ({ scene, engine }) => this._onSceneChanged(scene, engine));
    controller.on('view', v => this._onView(v));
    controller.on('info', content => this.showInfo(content));
    controller.on('autopilot', ({ running }) =>
      document.getElementById('btn-autopilot')?.classList.toggle('is-on', running));
  }

  /* ---------- top bar ---------- */
  _buildTop() {
    document.getElementById('tour-title').textContent = this.m.meta.title;
    const logo = document.getElementById('brand-logo');
    if (this.m.branding?.logo) {
      logo.src = this.c.resolveAsset(this.m.branding.logo);
      logo.hidden = false;
    }
  }

  /* ---------- menú de escenas ---------- */
  _buildMenu() {
    const menu = document.getElementById('scene-menu');
    for (const scene of this.m.scenes) {
      const btn = document.createElement('button');
      btn.className = 'rc-menu__item';
      btn.dataset.sceneId = scene.id;
      btn.setAttribute('aria-label', scene.title);
      const badge = SCENE_BADGE[scene.type] || scene.type;
      btn.innerHTML = `
        ${scene.thumbnail ? `<img src="${this.c.resolveAsset(scene.thumbnail)}" alt="" loading="lazy">` : ''}
        <span>${scene.title}</span>
        <span class="rc-menu__badge">${badge}</span>`;
      btn.addEventListener('click', () => this.c.goTo(scene.id));
      menu.appendChild(btn);
    }
    const toggle = document.getElementById('menu-toggle');
    toggle.addEventListener('click', () => {
      const hidden = menu.classList.toggle('is-hidden');
      toggle.setAttribute('aria-expanded', String(!hidden));
    });
  }

  /* ---------- planta + radar ---------- */
  _buildPlan() {
    const plan = this.m.plan;
    this.planWidget = document.getElementById('plan-widget');
    if (!plan || !plan.pins?.length) return; // sin planta declarada → widget oculto

    this.planWidget.hidden = false;
    const img = document.getElementById('plan-img');
    if (plan.src) img.src = this.c.resolveAsset(plan.src);

    const [w, h] = plan.size || [1000, 750];
    const svg = document.getElementById('plan-overlay');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = '';

    // cono del radar (dirección de cámara) — debajo de los pins
    this.cone = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.cone.setAttribute('class', 'rc-plan__cone');
    this.cone.setAttribute('visibility', 'hidden');
    svg.appendChild(this.cone);

    this.pins = new Map();
    const r = Math.max(10, w * 0.014);
    for (const pin of plan.pins) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'rc-plan__pin');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      const scene = this.m.byId.get(pin.sceneId);
      g.setAttribute('aria-label', scene?.title || pin.sceneId);
      const [x, y] = pin.position;
      const num = pin.sceneId.match(/\d+$/)?.[0]?.replace(/^0/, '') || '';
      g.innerHTML = `<circle cx="${x}" cy="${y}" r="${r}"></circle>
                     <text x="${x}" y="${y + r * 0.35}">${num}</text>`;
      const go = () => this.c.goTo(pin.sceneId);
      g.addEventListener('click', go);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      svg.appendChild(g);
      this.pins.set(pin.sceneId, { g, x, y, r });
    }

    document.getElementById('plan-toggle').addEventListener('click', e => {
      const collapsed = this.planWidget.classList.toggle('is-collapsed');
      e.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  _updateRadar(yawDeg) {
    if (!this.cone || !this.activePin) return;
    const northOffset = this.c.currentScene?.northOffset;
    const radarOn = this.m.plan?.radar !== false;
    if (northOffset == null || !radarOn) { this.cone.setAttribute('visibility', 'hidden'); return; }
    const bearing = normDeg(northOffset + yawDeg - (this.m.plan.bearing || 0));
    const { x, y } = this.activePin;
    const [w] = this.m.plan.size || [1000];
    const len = w * 0.1, half = 26; // largo proporcional a la planta · apertura en grados
    const a1 = (bearing - half) * Math.PI / 180, a2 = (bearing + half) * Math.PI / 180;
    // 0° = norte = arriba (−y en pantalla)
    const p1 = [x + len * Math.sin(a1), y - len * Math.cos(a1)];
    const p2 = [x + len * Math.sin(a2), y - len * Math.cos(a2)];
    this.cone.setAttribute('d', `M${x},${y} L${p1[0]},${p1[1]} A${len},${len} 0 0 1 ${p2[0]},${p2[1]} Z`);
    this.cone.setAttribute('visibility', 'visible');
  }

  _onView(v) {
    this._lastView = v;
    this._updateRadar(v.yawDeg);
  }

  /* ---------- panel de info ---------- */
  _bindInfoPanel() {
    this.panel = document.getElementById('info-panel');
    document.getElementById('info-close').addEventListener('click', () => this.hideInfo());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.hideInfo(); });
  }

  showInfo(content) {
    if (!content) return;
    const box = document.getElementById('info-content');
    let html = `<h2>${content.title || ''}</h2>`;
    if (content.media) {
      const src = this.c.resolveAsset(content.media.src);
      if (content.media.kind === 'image') html += `<img src="${src}" alt="">`;
      else if (content.media.kind === 'video') html += `<video src="${src}" controls playsinline></video>`;
      else if (content.media.kind === 'audio') html += `<audio src="${src}" controls></audio>`;
    }
    if (content.html) html += content.html;
    box.innerHTML = html;
    this.panel.hidden = false;
    requestAnimationFrame(() => this.panel.classList.add('is-open'));
  }

  hideInfo() {
    this.panel.classList.remove('is-open');
    setTimeout(() => { this.panel.hidden = true; }, 320);
  }

  /* ---------- controles ---------- */
  _bindControls() {
    // autopilot
    const ap = document.getElementById('btn-autopilot');
    if (this.m.autopilot?.enabled && this.m.autopilot.steps?.length) {
      ap.hidden = false;
      ap.addEventListener('click', () => {
        if (this.c.autopilotRunning) this.c.stopAutopilot();
        else this.c.startAutopilot();
      });
    }

    // giroscopio — el botón aparece solo si el engine actual lo soporta y hay API
    this.gyroBtn = document.getElementById('btn-gyro');
    if ('DeviceOrientationEvent' in window) {
      this.gyroBtn.addEventListener('click', async () => {
        const engine = this.c.currentEngine;
        if (!engine?.toggleGyro) return;
        try {
          const on = await engine.toggleGyro();
          this.gyroBtn.classList.toggle('is-on', on);
        } catch {
          this.gyroBtn.hidden = true; // probe falló (permisos/cadena de iframes) — se retira
        }
      });
    }

    // música ambiente (play tras primer gesto — política de autoplay)
    if (this.m.music?.src) {
      const btn = document.getElementById('btn-music');
      btn.hidden = false;
      this.audio = new Audio(this.c.resolveAsset(this.m.music.src));
      this.audio.loop = this.m.music.loop !== false;
      this.audio.volume = this.m.music.volume ?? 0.4;
      const startOnce = () => { this.audio.play().then(() => btn.classList.add('is-on')).catch(() => {}); };
      document.addEventListener('pointerdown', startOnce, { once: true });
      btn.addEventListener('click', () => {
        if (this.audio.paused) { this.audio.play(); btn.classList.add('is-on'); }
        else { this.audio.pause(); btn.classList.remove('is-on'); }
      });
    }

    // pantalla completa (camino primario en embed — abre el tour top-level)
    if (this.c.embedded) {
      const fp = document.getElementById('btn-fullpage');
      fp.href = location.href;
      fp.hidden = false;
    }
  }

  /* ---------- cambio de escena ---------- */
  _onSceneChanged(scene, engine) {
    document.getElementById('scene-title').textContent = scene.title;

    document.querySelectorAll('.rc-menu__item').forEach(el =>
      el.classList.toggle('is-active', el.dataset.sceneId === scene.id));
    document.querySelector(`.rc-menu__item[data-scene-id="${scene.id}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });

    // gyro visible solo donde aplica
    this.gyroBtn.hidden = !('DeviceOrientationEvent' in window) || !engine.capabilities?.gyro;

    // planta: pin activo + cono según capacidades. Sin pin para la escena
    // (p. ej. Potree/ortho de OTRO sitio) el widget completo se oculta.
    if (this.pins) {
      for (const [sceneId, pin] of this.pins) pin.g.classList.toggle('is-active', sceneId === scene.id);
      this.activePin = this.pins.get(scene.id) || null;
      this.planWidget.hidden = !this.activePin;
      if (!this.activePin || !engine.capabilities?.radar) this.cone.setAttribute('visibility', 'hidden');
      else if (this._lastView) this._updateRadar(this._lastView.yawDeg);
    }

    this.hideInfo();
  }
}
