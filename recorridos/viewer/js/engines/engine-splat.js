/**
 * engine-splat.js — placeholder del tipo de escena `splat` (Gaussian Splatting).
 * El manifest YA declara el tipo; el renderer 3DGS llega en Fase 1.5
 * (Spark vs GaussianSplats3D · input = export comprimido de PostShot).
 */

export function create(ctx, container) {
  return {
    capabilities: { radar: false, gyro: false, autopilot: false },

    async show(scene) {
      const thumb = scene.thumbnail ? ctx.resolveAsset(scene.thumbnail) : null;
      container.innerHTML = `
        <div class="rc-placeholder" ${thumb ? `style="background-image:url('${thumb}')"` : ''}>
          <span class="rc-tag">Próximamente</span>
          <h2>${scene.title}</h2>
          <p>Modelo 3D inmersivo de alta fidelidad (Gaussian Splatting) en preparación.
             Mientras tanto, explora el recorrido 360 y la nube de puntos.</p>
        </div>`;
    },

    hide() {},
    getView() { return null; },
  };
}
