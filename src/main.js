import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/manrope/index.css';
import '@fontsource/mrs-saint-delafield/latin-400.css';
import './styles.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);

/* ---------- Configuração da cliente ---------- */
const WHATSAPP = '5511988426981';
const waLink = (msg) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const mobileMQ = matchMedia('(max-width: 1023px)');
const fontsReady = Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);

/* ---------- Links de WhatsApp com mensagem pronta ---------- */
$$('[data-wa]').forEach((a) => {
  a.href = waLink(a.dataset.wa);
  a.target = '_blank';
  a.rel = 'noopener';
});

/* ---------- Texto "roll" letra por letra nos botões ---------- */
$$('[data-roll]').forEach((el) => {
  const text = el.textContent.trim();
  const chars = [...text].map((c, i) => `<span class="ch" style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  el.innerHTML = `<span class="sr-only">${text}</span><span class="roll-inner" aria-hidden="true">${chars}</span>`;
});

/* ---------- Scroll suave (Lenis) ---------- */
let lenis = null;
if (!reduceMotion) {
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ---------- Header + menu mobile ---------- */
const header = $('[data-header]');
const mobileBar = $('[data-mobile-bar]');
const toggle = $('[data-menu-toggle]');
let lastY = window.scrollY;
let ticking = false;

function onScroll() {
  const y = window.scrollY;
  header.classList.toggle('scrolled', y > 20);
  if (!document.body.classList.contains('menu-open')) {
    header.classList.toggle('hidden', y > lastY && y > 400);
  }
  mobileBar?.classList.toggle('show', y > window.innerHeight * 0.7);
  lastY = y;
  ticking = false;
}
window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();

function setMenu(open) {
  document.body.classList.toggle('menu-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  if (lenis) open ? lenis.stop() : lenis.start();
}
toggle.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

/* âncoras internas com scroll suave */
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = $(id);
    if (!target) return;
    e.preventDefault();
    setMenu(false);
    if (lenis) lenis.scrollTo(target, { duration: 1.5, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  });
});

/* ---------- Coluna 3D (carregada sob demanda) ---------- */
let spine = null;
let storyF = 0;
const spineEl = $('[data-spine]');
const labels = Object.fromEntries($$('[data-label]').map((el) => [el.dataset.label, el]));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

if (hasWebGL()) {
  import('./spine.js').then(({ createSpine }) => {
    spine = createSpine(spineEl, { labels, isMobile: mobileMQ.matches, reducedMotion: reduceMotion });
    spine.setProgress(storyF);
    mobileMQ.addEventListener('change', (e) => spine.setMobile(e.matches));
  }).catch(() => document.documentElement.classList.add('no-webgl'));
} else {
  document.documentElement.classList.add('no-webgl');
}

if (finePointer) {
  window.addEventListener('pointermove', (e) => {
    spine?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
}

/* progresso da "jornada" pela coluna: 0 = hero, 1..4 = regiões */
const dots = $$('[data-progress-dot]');
const dotsWrap = $('.story-progress');
const hint = $('[data-hint]');
ScrollTrigger.create({
  trigger: '[data-story]',
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: (self) => {
    storyF = self.progress * 4;
    spine?.setProgress(storyF);
    const idx = Math.round(storyF);
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    dotsWrap.classList.toggle('on', storyF > 0.45);
    if (hint) hint.style.opacity = String(Math.max(0, 1 - storyF * 3));
  },
});

/* cartões das regiões entram/saem com o scroll */
$$('.story-panel.region').forEach((panel) => {
  const card = $('.region-card', panel);
  gsap.timeline({ scrollTrigger: { trigger: panel, start: 'top bottom', end: 'bottom top', scrub: 0.6 } })
    .fromTo(card, { autoAlpha: 0, y: 140 }, { autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.36 })
    .to(card, { autoAlpha: 1, duration: 0.26 })
    .to(card, { autoAlpha: 0, y: -110, ease: 'power2.in', duration: 0.38 });
});
gsap.to(['.hero-copy', '.hero-card', '.scroll-cue'], {
  autoAlpha: 0, y: -90, ease: 'none',
  scrollTrigger: { trigger: '.story-panel.hero', start: 'top top', end: 'bottom 35%', scrub: true },
});

/* ---------- Intro do hero ---------- */
fontsReady.then(() => {
  const title = $('[data-hero-title]');
  const tl = gsap.timeline({ delay: 0.1 });
  if (reduceMotion) {
    gsap.set(['[data-hero-in]', title], { opacity: 1 });
    return;
  }
  let played = false;
  SplitText.create(title, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'split-line',
    autoSplit: true,
    onSplit(self) {
      gsap.set(title, { opacity: 1 });
      if (played) return;
      played = true;
      tl.from(self.lines, { yPercent: 115, duration: 1.3, ease: 'expo.out', stagger: 0.12 }, 0);
    },
  });
  tl.fromTo('[data-hero-in]', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.09 }, 0.3);
});

/* ---------- Títulos com SplitText ---------- */
fontsReady.then(() => {
  $$('[data-split]').forEach((el) => {
    if (reduceMotion) { gsap.set(el, { visibility: 'visible' }); return; }
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'split-line',
      autoSplit: true,
      onSplit(self) {
        gsap.set(el, { visibility: 'visible' });
        return gsap.from(self.lines, {
          yPercent: 112, duration: 1.15, ease: 'expo.out', stagger: 0.1,
          scrollTrigger: { trigger: el, start: 'top 86%', once: true },
        });
      },
    });
  });
  ScrollTrigger.refresh();
});

/* ---------- Revelações ---------- */
if (!reduceMotion) {
  $$('[data-reveal]').forEach((el) => {
    gsap.from(el, { y: 60, autoAlpha: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });
  $$('[data-stagger]').forEach((list) => {
    gsap.from(list.children, { y: 34, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, scrollTrigger: { trigger: list, start: 'top 85%', once: true } });
  });
  $$('[data-parallax]').forEach((img) => {
    gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

/* ---------- Faixa infinita reativa à velocidade do scroll ---------- */
(() => {
  const track = $('[data-marquee-track]');
  if (!track) return;
  const clone = document.createElement('div');
  clone.setAttribute('aria-hidden', 'true');
  clone.style.display = 'contents';
  clone.innerHTML = track.innerHTML;
  track.appendChild(clone);
  if (reduceMotion) return;
  let x = 0, dir = -1, visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(track);
  lenis?.on('scroll', (e) => { if (e.direction) dir = e.direction > 0 ? -1 : 1; });
  gsap.ticker.add((t, dt) => {
    if (!visible) return;
    const v = lenis ? Math.min(Math.abs(lenis.velocity), 60) : 0;
    x += dir * (70 + v * 14) * (dt / 1000);
    const half = track.scrollWidth / 2;
    if (x <= -half) x += half;
    if (x > 0) x -= half;
    gsap.set(track, { x });
  });
})();

/* ---------- Método: scroll horizontal fixado (desktop) ---------- */
const mm = gsap.matchMedia();
mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
  const section = $('[data-method]');
  const track = $('[data-method-track]', section);
  const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
  const tween = gsap.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: { trigger: section, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1 },
  });
  gsap.to('[data-method-bar]', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: section, start: 'top top', end: () => '+=' + dist(), scrub: true } });
  $$('[data-draw]', section).forEach((svg) => {
    gsap.fromTo(svg, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', scrollTrigger: { trigger: svg, containerAnimation: tween, start: 'left 88%', once: true } });
  });
  $$('.step-media img', section).forEach((img) => {
    gsap.fromTo(img, { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: img, containerAnimation: tween, start: 'left right', end: 'right 60%', scrub: true } });
  });
});
mm.add('(max-width: 1023px), (prefers-reduced-motion: reduce)', () => {
  $$('[data-draw]').forEach((svg) => {
    gsap.fromTo(svg, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', scrollTrigger: { trigger: svg, start: 'top 90%', once: true } });
  });
});

/* ---------- Assinatura "escrita" com o scroll ---------- */
const signature = $('[data-signature]');
if (signature && !reduceMotion) {
  gsap.fromTo(signature, { clipPath: 'inset(0 100% 0 0)' }, {
    clipPath: 'inset(0 0% 0 0)', ease: 'none',
    scrollTrigger: { trigger: signature, start: 'top 88%', end: 'top 50%', scrub: 0.6 },
  });
}

/* ---------- Contadores ---------- */
$$('[data-count]').forEach((el) => {
  const end = parseFloat(el.dataset.count);
  const dec = parseInt(el.dataset.decimals || '0', 10);
  const fmt = (v) => v.toFixed(dec).replace('.', ',');
  if (reduceMotion) { el.textContent = fmt(end); return; }
  const obj = { v: 0 };
  el.textContent = fmt(0);
  gsap.to(obj, {
    v: end, duration: 1.8, ease: 'power2.out',
    scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    onUpdate: () => { el.textContent = fmt(obj.v); },
  });
});

/* ---------- Avaliações: duplicação para loop contínuo ---------- */
(() => {
  const track = $('[data-review-track]');
  if (!track || reduceMotion) return;
  [...track.children].forEach((li) => {
    const c = li.cloneNode(true);
    c.setAttribute('aria-hidden', 'true');
    track.appendChild(c);
  });
})();

/* ---------- Microinterações (somente mouse) ---------- */
if (finePointer && !reduceMotion) {
  $$('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.22);
      yTo((e.clientY - r.top - r.height / 2) * 0.32);
    });
    el.addEventListener('mouseleave', () => { xTo(0); yTo(0); });
  });
  $$('[data-tilt]').forEach((el) => {
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.8, ease: 'power3' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.8, ease: 'power3' });
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 7);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 7);
    });
    el.addEventListener('mouseleave', () => { rx(0); ry(0); });
  });
}

/* ---------- FAQ com animação de altura ---------- */
$$('[data-faq] details').forEach((d) => {
  const summary = $('summary', d);
  const answer = $('.faq-a', d);
  summary.addEventListener('click', (e) => {
    e.preventDefault();
    if (d.open) {
      gsap.to(answer, { height: 0, duration: 0.45, ease: 'power3.inOut', onComplete: () => { d.open = false; gsap.set(answer, { clearProps: 'height' }); ScrollTrigger.refresh(); } });
    } else {
      d.open = true;
      gsap.fromTo(answer, { height: 0 }, { height: 'auto', duration: 0.6, ease: 'power3.out', onComplete: () => ScrollTrigger.refresh() });
    }
  });
});

/* ---------- Pré-agendamento → WhatsApp ---------- */
const form = $('[data-booking]');
form?.addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = form.elements.nome;
  if (!nome.value.trim()) {
    nome.classList.add('invalid');
    nome.focus();
    return;
  }
  nome.classList.remove('invalid');
  const data = new FormData(form);
  const msg = [
    `Olá, Sylvia! Meu nome é ${data.get('nome').trim()}.`,
    'Gostaria de agendar uma avaliação.',
    '',
    `• Queixa: ${data.get('queixa')}`,
    `• Melhor período: ${data.get('periodo')}`,
    `• Atendimento: ${data.get('local')}`,
    '',
    '(Mensagem enviada pelo site)',
  ].join('\n');
  window.open(waLink(msg), '_blank', 'noopener');
});
form?.elements.nome.addEventListener('input', (e) => e.target.classList.remove('invalid'));

/* ---------- Diversos ---------- */
$$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
window.addEventListener('load', () => ScrollTrigger.refresh());
