// Colapsa toda capa detalle al cargar; el botón .ver-mas la expande en su sección.
// Lazy-load: los iframes pesados (360°, Potree) llevan data-src y solo cargan al expandir.
function loadLazyFrames(container) {
  container.querySelectorAll('iframe[data-src]').forEach(f => {
    if (!f.src) f.src = f.dataset.src;
  });
}
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-layer="detalle"]').forEach(el => el.classList.add('collapsed'));
  document.querySelectorAll('.ver-mas').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(btn.getAttribute('data-target'));
      if (!target) return;
      const collapsed = target.classList.toggle('collapsed');
      btn.textContent = collapsed ? btn.dataset.labelOpen : btn.dataset.labelClose;
      if (!collapsed) {
        loadLazyFrames(target);
        target.scrollIntoView({ behavior:'smooth', block:'nearest' });
      }
    });
  });
});
