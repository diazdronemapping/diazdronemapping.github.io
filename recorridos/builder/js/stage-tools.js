/**
 * stage-tools.js — barra sobre el escenario: modo de edición + agregar hotspots
 * + acciones de dibujo. Sólo aplica a escenas pano360 (donde se coloca clicando).
 */
export function renderStageTools(app) {
  const bar = document.getElementById('stage-tools');
  const scene = app.currentScene();
  const isPano = scene?.type === 'pano360';
  bar.hidden = !scene;
  if (!scene) return;

  const drawing = app.mode === 'draw-polygon';
  const tool = (id, label, title, on) =>
    `<button data-tool="${id}" class="stage-tool${on ? ' is-on' : ''}" title="${title}">${label}</button>`;

  if (isPano) {
    bar.innerHTML = `
      <div class="stage-tools__group">
        ${tool('navigate', '✋ Navegar', 'Mover la cámara sin editar', app.mode === 'navigate')}
        ${tool('add-nav', '↗ Ir a…', 'Colocar un botón que salta a otra escena', app.mode === 'add-nav')}
        ${tool('add-info', 'ⓘ Info', 'Colocar un punto de información', app.mode === 'add-info')}
        ${tool('add-link', '🔗 Enlace', 'Colocar un enlace externo', app.mode === 'add-link')}
        ${drawing
          ? `<button data-tool="finish-poly" class="stage-tool is-on">✓ Cerrar trazo</button>
             <button data-tool="cancel-poly" class="stage-tool">✕ Cancelar</button>`
          : tool('draw-polygon', '▱ Trazar terreno', 'Dibujar el polígono del predio', false)}
      </div>
      <div class="stage-tools__hint">${modeHint(app.mode)}</div>
      <div class="stage-tools__readout" id="stage-readout">—</div>`;
  } else {
    bar.innerHTML = `<div class="stage-tools__hint">Esta escena se edita en el panel derecho. Se previsualiza tal cual en el recorrido publicado.</div>`;
  }

  bar.querySelectorAll('[data-tool]').forEach(b => {
    b.onclick = () => {
      const t = b.dataset.tool;
      if (t === 'draw-polygon') app.startPolygon();
      else if (t === 'finish-poly') app.finishPolygon();
      else if (t === 'cancel-poly') app.setMode('navigate');
      else app.setMode(t);
    };
  });
}

function modeHint(mode) {
  return {
    navigate: 'Arrastra para mirar. Haz clic en un hotspot para editarlo.',
    'add-nav': 'Haz clic donde quieras el botón de navegación.',
    'add-info': 'Haz clic donde quieras el punto de información.',
    'add-link': 'Haz clic donde quieras el enlace.',
    reposition: 'Haz clic en la nueva posición del hotspot.',
    'draw-polygon': 'Haz clic en cada esquina del terreno. Cierra con "✓ Cerrar trazo".',
  }[mode] || '';
}
