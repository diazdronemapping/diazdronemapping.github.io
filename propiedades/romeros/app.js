(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const steps = [...document.querySelectorAll('.story-step')];
  const videos = [...document.querySelectorAll('.story-video')];
  const progress = document.querySelector('.story-progress span');

  function activate(step) {
    const scene = step.dataset.scene;
    steps.forEach((item, index) => {
      const active = item === step;
      item.classList.toggle('is-active', active);
      if (active && progress) progress.style.transform = `translateY(${index * 100}%)`;
    });
    videos.forEach(video => {
      const active = video.dataset.scene === scene;
      video.classList.toggle('is-active', active);
      if (active && !reduceMotion) video.play().catch(() => {});
      else video.pause();
    });
  }

  const storyObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) activate(visible.target);
  }, { threshold: [0.4, 0.55, 0.7] });
  steps.forEach(step => storyObserver.observe(step));

  if (!reduceMotion && videos[0]) videos[0].play().catch(() => {});

  if (window.L) {
    const coords = [
      [20.0328945955, -98.3927173486],
      [20.0324535254, -98.3915805125],
      [20.0306150433, -98.3916094358],
      [20.0297480321, -98.3918172563],
      [20.0302310977, -98.3935857719]
    ];
    const map = L.map('property-map', { scrollWheelZoom: false, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics'
    }).addTo(map);
    const polygon = L.polygon(coords, { color: '#b7f34a', weight: 3, opacity: 1, fillColor: '#b7f34a', fillOpacity: .18 }).addTo(map);
    map.fitBounds(polygon.getBounds(), { padding: [55, 55] });
    polygon.bindTooltip('Los Romeros · 5.115 ha', { permanent: true, direction: 'center', className: 'property-label' }).openTooltip();
    coords.forEach((coord, index) => L.circleMarker(coord, { radius: 4, color: '#fff', weight: 2, fillColor: '#11130f', fillOpacity: 1 }).addTo(map).bindTooltip(`V${index + 1}`));
    setTimeout(() => map.invalidateSize(), 200);
  }
})();
