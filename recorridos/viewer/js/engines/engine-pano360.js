/**
 * engine-pano360.js — Scene Engine de panoramas 360 equirectangulares.
 * Photo Sphere Viewer v5 + Markers/Autorotate/Gyroscope.
 * UNA instancia de Viewer reutilizada entre panos (setPanorama).
 * La navegación entre escenas es del TourController (no VirtualTourPlugin:
 * su modelo de nodos pelea con escenas heterogéneas Potree/ortho).
 */

import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { AutorotatePlugin } from '@photo-sphere-viewer/autorotate-plugin';
import { GyroscopePlugin } from '@photo-sphere-viewer/gyroscope-plugin';
import { degToRad, radToDeg } from '../geo-core.js';

const MIN_FOV = 30, MAX_FOV = 90;
const fovToZoom = fov => Math.round((MAX_FOV - fov) / (MAX_FOV - MIN_FOV) * 100);

const ICONS = {
  nav: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
};

function markerHtml(kind, label) {
  return `<div class="rc-hotspot rc-hotspot--${kind}">${ICONS[kind] || ICONS.info}` +
         (label ? `<span class="rc-hotspot__label">${label}</span>` : '') + `</div>`;
}

export function create(ctx, container) {
  let viewer = null, markers = null, autorotate = null, gyro = null;
  let currentFov = 70;
  let gyroOn = false;
  let lastViewEmit = 0;

  function buildMarkers(scene) {
    const defs = [];
    for (const h of scene.hotspots || []) {
      if (h.type === 'polygon') {
        defs.push({
          id: h.id,
          polygon: h.positions.map(p => [degToRad(p.yaw), degToRad(p.pitch)]),
          svgStyle: {
            fill: h.style?.fill || 'rgba(123,193,66,0.16)',
            stroke: h.style?.stroke || 'var(--rc-accent)',
            'stroke-width': '2.5px',
          },
          data: { kind: 'info', content: h.content },
        });
        continue;
      }
      defs.push({
        id: h.id,
        position: { yaw: degToRad(h.position.yaw), pitch: degToRad(h.position.pitch) },
        html: markerHtml(h.type, h.label || (h.type === 'info' ? h.content?.title : null)),
        size: { width: 44, height: 44 },
        anchor: 'center center',
        data: { kind: h.type, target: h.target, url: h.url, content: h.content },
      });
    }
    // nadir con logo (parche de marca "pegado" al piso del pano)
    const nadir = ctx.manifest.branding?.nadirLogo;
    if (nadir) {
      defs.push({
        id: '__nadir',
        imageLayer: ctx.resolveAsset(nadir),
        // parche plano en el piso: 4 esquinas alrededor del polo (pitch -72°)
        position: [
          { yaw: degToRad(-45), pitch: degToRad(-72) },
          { yaw: degToRad(45), pitch: degToRad(-72) },
          { yaw: degToRad(135), pitch: degToRad(-72) },
          { yaw: degToRad(-135), pitch: degToRad(-72) },
        ],
        data: { kind: 'nadir' },
      });
    }
    return defs;
  }

  function createViewer(scene, view) {
    viewer = new Viewer({
      container,
      panorama: ctx.resolveAsset(scene.src),
      navbar: false,
      keyboard: false,
      defaultYaw: degToRad(view.yaw ?? 0),
      defaultPitch: degToRad(view.pitch ?? 0),
      minFov: MIN_FOV,
      maxFov: MAX_FOV,
      defaultZoomLvl: fovToZoom(view.fov ?? 70),
      loadingTxt: 'Cargando panorama…',
      touchmoveTwoFingers: false,
      plugins: [
        [MarkersPlugin, {}],
        [AutorotatePlugin, {
          autostartDelay: (ctx.manifest.idle?.autorotateAfter ?? 12) * 1000,
          autostartOnIdle: !ctx.editMode, // en el Studio no rota solo (estorba al editar)
          autorotateSpeed: `${ctx.manifest.idle?.rpm ?? 0.4}rpm`,
        }],
        [GyroscopePlugin, { touchmove: true }],
      ],
    });
    markers = viewer.getPlugin(MarkersPlugin);
    autorotate = viewer.getPlugin(AutorotatePlugin);
    gyro = viewer.getPlugin(GyroscopePlugin);
    if (ctx.debug) { window.__psv = viewer; window.__psvMarkers = markers; }
    currentFov = view.fov ?? 70;

    markers.addEventListener('select-marker', ({ marker }) => {
      // Modo edición (Studio): seleccionar un hotspot lo abre en el inspector
      // en vez de ejecutar su acción. El nadir (__*) no es hotspot editable.
      if (ctx.editMode) {
        if (!marker.id.startsWith('__')) ctx.emit('hotspot-select', marker.id);
        return;
      }
      const d = marker.data || {};
      if (d.kind === 'nav' && d.target) ctx.goTo(d.target);
      else if (d.kind === 'info' && d.content) ctx.emit('info', d.content);
      else if (d.kind === 'link' && d.url) window.open(d.url, '_blank', 'noopener');
    });

    viewer.addEventListener('position-updated', ({ position }) => {
      const now = performance.now();
      if (now - lastViewEmit < 80) return; // throttle del radar/HUD
      lastViewEmit = now;
      ctx.emit('view', {
        yawDeg: radToDeg(position.yaw),
        pitchDeg: radToDeg(position.pitch),
        fovDeg: currentFov,
      });
    });
    viewer.addEventListener('zoom-updated', ({ zoomLevel }) => {
      currentFov = MAX_FOV - (zoomLevel / 100) * (MAX_FOV - MIN_FOV);
    });
    viewer.addEventListener('click', ({ data }) => {
      if (!data || data.rightclick) return;
      ctx.emit('pano-click', { yawDeg: radToDeg(data.yaw), pitchDeg: radToDeg(data.pitch) });
    });

    return new Promise((resolve, reject) => {
      viewer.addEventListener('ready', () => resolve(), { once: true });
      viewer.addEventListener('panorama-error', e => reject(e.error || new Error('panorama-error')), { once: true });
    });
  }

  return {
    capabilities: { radar: true, gyro: true, autopilot: true },

    async show(scene, savedView) {
      const view = savedView || {
        yaw: scene.initialView?.yaw ?? 0,
        pitch: scene.initialView?.pitch ?? 0,
        fov: scene.initialView?.fov ?? 70,
      };
      if (!viewer) {
        await createViewer(scene, view);
      } else {
        await viewer.setPanorama(ctx.resolveAsset(scene.src), {
          position: { yaw: degToRad(view.yaw), pitch: degToRad(view.pitch) },
          zoom: fovToZoom(view.fov ?? 70),
          transition: false,
          showLoader: true,
        });
        currentFov = view.fov ?? 70;
      }
      // tras un display:none el tamaño interno quedó en 0 — recalcular antes
      // de proyectar markers (los polígonos darían paths NaN)
      viewer.autoSize();
      await new Promise(r => requestAnimationFrame(r));
      markers.clearMarkers();
      markers.setMarkers(buildMarkers(scene));
      // primer view para el radar/HUD
      const p = viewer.getPosition();
      ctx.emit('view', { yawDeg: radToDeg(p.yaw), pitchDeg: radToDeg(p.pitch), fovDeg: currentFov });
    },

    hide() {
      viewer?.stopAnimation();
      autorotate?.stop();
      if (gyroOn) { gyro?.stop(); gyroOn = false; }
      // el contenedor pasa a display:none → PSV proyectaría los polígonos con
      // tamaño 0 (paths NaN). show() los reconstruye al volver.
      markers?.clearMarkers();
    },

    getView() {
      if (!viewer) return null;
      const p = viewer.getPosition();
      return { yaw: radToDeg(p.yaw), pitch: radToDeg(p.pitch), fov: currentFov };
    },

    // Studio: reconstruye los markers de la escena SIN recargar el pano ni
    // mover la cámara (tras agregar/mover/borrar un hotspot).
    refresh(scene) {
      if (!viewer || !markers) return;
      markers.clearMarkers();
      markers.setMarkers(buildMarkers(scene));
    },

    // Studio: resalta el hotspot seleccionado.
    highlight(hotspotId) {
      if (!markers) return;
      for (const m of Object.values(markers.markers || {})) {
        const el = m.domElement || m.element;
        if (el && el.classList) el.classList.toggle('is-selected', m.id === hotspotId);
      }
    },

    async animateTo(lookAtDeg, { speed = '6rpm' } = {}) {
      if (!viewer) return;
      await viewer.animate({
        yaw: degToRad(lookAtDeg.yaw),
        pitch: degToRad(lookAtDeg.pitch ?? 0),
        speed,
      });
    },

    async toggleGyro() {
      if (!gyro) return false;
      if (gyroOn) { gyro.stop(); gyroOn = false; return false; }
      await gyro.start(); // rechaza si no hay permiso/soporte → chrome oculta el botón
      gyroOn = true;
      return true;
    },

    destroy() {
      viewer?.destroy();
      viewer = markers = autorotate = gyro = null;
    },
  };
}
