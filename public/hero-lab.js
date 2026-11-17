import { buildResumeInnerHtml } from './app.js';
import { createProfileDeck, setActiveProfile, getActiveExample } from './demo-profiles.js';

export const SHOWCASE_INTERVAL_MS = 3000;
const layouts = {
  chronological: { name: 'Career', note: 'Experience in focus' },
  hybrid: { name: 'Skills', note: 'Strengths, connected' },
  technical: { name: 'Portfolio', note: 'Ideas made real' },
  academic: { name: 'Academic', note: 'Knowledge, shared' },
};
const lab = document.querySelector('.role-lab');
if (lab) {
  const paper = document.getElementById('heroResumePaper');
  const frame = document.getElementById('demoDocument');
  const canvas = document.getElementById('demoCanvas');
  const labels = [...canvas.querySelectorAll('.showcase-layout, .showcase-identity')];
  // Move a cover over stationary text, rather than changing the text's rasterization.
  const revealCover = document.createElement('div');
  revealCover.className = 'paper-reveal-cover';
  revealCover.setAttribute('aria-hidden', 'true');
  frame.append(revealCover);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const nextProfile = createProfileDeck();
  let paused = reduced.matches, visible = false, timer = null, tiltFrame = null;
  let transitions = [];
  function stopTransitions() {
    transitions.forEach(animation => animation.cancel());
    transitions = [];
  }
  function enter() {
    transitions.push(revealCover.animate([
      {transform:'translateY(0)', opacity:1},
      {transform:'translateY(110%)', opacity:1},
    ], {duration:850, easing:'cubic-bezier(.22, .61, .36, 1)'}));
    labels.forEach((label, index) => transitions.push(label.animate([
      {opacity:0, scale:'.86', translate:'0 10px'},
      {opacity:1, scale:'1.025', translate:'0 -2px', offset:.75},
      {opacity:1, scale:'1', translate:'0 0'},
    ], {duration:420, delay:90 + index * 65, fill:'backwards', easing:'cubic-bezier(.2, .7, .25, 1)'})));
  }

  function fit() {
    if (frame.clientWidth && paper.offsetWidth) paper.style.setProperty('--hero-scale', frame.clientWidth / paper.offsetWidth);
  }
  function sync() {
    clearTimeout(timer);
    const running = !paused && !reduced.matches && visible && !document.hidden;
    lab.dataset.paused = String(!running);
    if (running) timer = setTimeout(() => show(nextProfile()), SHOWCASE_INTERVAL_MS);
  }
  async function show(profile, animate = true) {
    stopTransitions();
    if (animate && !reduced.matches) {
      transitions.push(revealCover.animate([
        {transform:'translateY(0)', opacity:0},
        {transform:'translateY(0)', opacity:1},
      ], {duration:220, easing:'ease-in', fill:'forwards'}));
      labels.forEach(label => transitions.push(label.animate([
        {opacity:1, scale:'1', translate:'0 0'},
        {opacity:0, scale:'.88', translate:'0 -8px'},
      ], {duration:180, easing:'ease-in', fill:'forwards'})));
      try { await Promise.all(transitions.map(animation => animation.finished)); } catch { return; }
    }
    setActiveProfile(profile.id);
    const layout = layouts[profile.layout];
    paper.innerHTML = buildResumeInnerHtml(getActiveExample(), { linksClickable: false, layout: profile.layout });
    paper.className = `resume-paper template-executive layout-${profile.layout}`;
    lab.dataset.layout = profile.layout;
    lab.dataset.profile = profile.id;
    document.getElementById('demoRole').textContent = profile.title;
    document.getElementById('demoName').textContent = profile.name;
    document.getElementById('demoLayout').textContent = layout.name;
    fit();
    stopTransitions();
    if (animate && !reduced.matches) enter();
    sync();
  }
  // Freeze the exact displayed example before a user opens it, including keyboard activation.
  for (const type of ['pointerdown', 'focus']) document.getElementById('previewExampleBtn').addEventListener(type, () => { paused = true; stopTransitions(); sync(); });
  new ResizeObserver(fit).observe(frame);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, {threshold: .15}).observe(lab);
  document.addEventListener('visibilitychange', sync);
  document.fonts?.ready.then(fit);
  function resetTilt() {
    cancelAnimationFrame(tiltFrame);
    canvas.style.setProperty('--tilt-x', '0deg');
    canvas.style.setProperty('--tilt-y', '0deg');
  }
  canvas.addEventListener('pointermove', event => {
    if (reduced.matches || !finePointer.matches) return;
    const bounds = canvas.getBoundingClientRect();
    cancelAnimationFrame(tiltFrame);
    tiltFrame = requestAnimationFrame(() => {
      canvas.style.setProperty('--tilt-x', `${(0.5 - (event.clientY - bounds.top) / bounds.height) * 5}deg`);
      canvas.style.setProperty('--tilt-y', `${((event.clientX - bounds.left) / bounds.width - 0.5) * 7}deg`);
    });
  });
  canvas.addEventListener('pointerleave', resetTilt);
  canvas.addEventListener('pointercancel', resetTilt);
  finePointer.addEventListener('change', resetTilt);
  reduced.addEventListener('change', () => { if (reduced.matches) { paused = true; stopTransitions(); resetTilt(); } sync(); });
  show(nextProfile(), false);
  if (!reduced.matches) enter();
}
