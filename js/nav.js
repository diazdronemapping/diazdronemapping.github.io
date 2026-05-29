// scroll progress bar
const bar = document.getElementById('scroll-progress');
addEventListener('scroll', () => {
  const h = document.documentElement;
  bar.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + '%';
});
// caminito rail: one dot per section with data-rail
const secs = [...document.querySelectorAll('[data-section][data-rail]')];
const rail = document.createElement('nav'); rail.id = 'caminito';
secs.forEach(s => {
  const a = document.createElement('a'); a.href = '#' + s.id;
  a.innerHTML = `<span>${s.dataset.rail}</span>`; rail.appendChild(a);
});
document.body.appendChild(rail);
const railLinks = [...rail.children];
const spy = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) {
    const i = secs.indexOf(e.target);
    railLinks.forEach((l,j) => l.classList.toggle('active', j === i));
  }});
}, { threshold: 0.5 });
secs.forEach(s => spy.observe(s));
