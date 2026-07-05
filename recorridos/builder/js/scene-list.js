/**
 * scene-list.js — panel izquierdo: escenas del recorrido + agregar/reordenar.
 */
const TYPE_BADGE = { pano360: '360', potree: '3D', ortho: 'MAPA', splat: '3D+' };

export function renderSceneList(app) {
  const host = document.getElementById('scene-list');
  const m = app.manifest;
  host.innerHTML = '';

  for (const scene of m.scenes) {
    const isStart = m.start.sceneId === scene.id;
    const li = document.createElement('div');
    li.className = 'scene-item' + (scene.id === app.currentSceneId ? ' is-active' : '');
    li.innerHTML = `
      <div class="scene-item__thumb" data-thumb></div>
      <div class="scene-item__body">
        <div class="scene-item__title">${escapeHtml(scene.title || scene.id)}</div>
        <div class="scene-item__meta">
          <span class="scene-item__badge">${TYPE_BADGE[scene.type] || scene.type}</span>
          ${scene.type === 'pano360' ? `<span>${(scene.hotspots || []).filter(h => !String(h.id).startsWith('__draft')).length} hotspots</span>` : ''}
          ${isStart ? '<span class="scene-item__start">★ inicio</span>' : ''}
        </div>
      </div>
      <div class="scene-item__actions">
        ${isStart ? '' : `<button data-act="start" title="Marcar como escena de inicio">★</button>`}
        <button data-act="del" title="Eliminar escena">✕</button>
      </div>`;

    // thumbnail (async — object URL / http)
    const thumb = li.querySelector('[data-thumb]');
    const tpath = scene.thumbnail || (scene.type === 'pano360' ? scene.src : null);
    if (tpath) {
      app.store.prepare(tpath).then(() => {
        const url = app.store.assetUrl(tpath);
        if (url) thumb.style.backgroundImage = `url('${url}')`;
      });
    } else thumb.classList.add('is-empty');

    li.querySelector('.scene-item__body').onclick = () => app.selectScene(scene.id);
    thumb.onclick = () => app.selectScene(scene.id);
    const startBtn = li.querySelector('[data-act="start"]');
    if (startBtn) startBtn.onclick = e => { e.stopPropagation(); app.setStartScene(scene.id); };
    li.querySelector('[data-act="del"]').onclick = e => { e.stopPropagation(); app.deleteScene(scene.id); };
    host.appendChild(li);
  }

  if (!m.scenes.length) {
    host.innerHTML = '<p class="scene-list__empty">Aún no hay escenas.<br>Agrega tu primer panorama 360 →</p>';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
