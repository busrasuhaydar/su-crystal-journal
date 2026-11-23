// Gerçekçi sayfa çevirme: yönlendirici yeni sayfayı çizmeden hemen önce eski sayfanın DOM kopyası alınır,
// kopya cilt (sol kenar) etrafında 3B döner; arka yüzü boş kristal sayfadır, kıvrım gölgesi ve parıltı taşır.
// Geri gidişte yeni sayfa soldan çevrilerek gelir. Yalnız transform/opacity → GPU. Hareketi azalt/sade modda kapalı.
import { crystal } from './scene';
import { pageFlip } from './sound';
import { NAV, isActive } from './Nav';

const off = () => document.documentElement.classList.contains('simple') || matchMedia('(prefers-reduced-motion: reduce)').matches;
let pending: { leaf: HTMLElement; dir: 1 | -1 } | null = null;
let lastPath = location.pathname;
let lastIdx = (history.state as { idx?: number } | null)?.idx ?? 0;
const navOf = (path: string) => NAV.findIndex((n) => isActive(path, n));
/** Defter mantığı: menüde ileride olan bölüme geçiş sayfayı ileri çevirir, geride olana geçiş geri çevirir; aynı bölümde derine inmek ileri. */
function dirBetween(from: string, to: string, fallback: 1 | -1): 1 | -1 {
  const a = navOf(from), b = navOf(to);
  if (a >= 0 && b >= 0 && a !== b) return b > a ? 1 : -1;
  return fallback;
}

/** .cb-right sayfasının o anki hâlinden çevrilebilir yaprak üretir (ön yüz = sayfa kopyası, arka yüz = boş kristal sayfa). */
function makeLeaf(host: HTMLElement, dir: 1 | -1, scrollTop: number) {
  const r = host.getBoundingClientRect();
  const leaf = document.createElement('div');
  leaf.className = `cb-leaf ${dir > 0 ? 'fwd' : 'back'}`;
  leaf.setAttribute('aria-hidden', 'true');
  leaf.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${getComputedStyle(host).borderTopLeftRadius}`;
  const front = document.createElement('div');
  front.className = 'cb-leaf-front';
  // sağ sayfanın tamamı (başlık + içerik) kopyalanır; kaydırma konumu korunur
  const clone = host.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-glass');
  clone.removeAttribute('style');
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  clone.querySelectorAll('[data-glass]').forEach((n) => n.removeAttribute('data-glass'));
  clone.className = 'cb-clone';
  const cs = clone.querySelector<HTMLElement>('.cb-scroll');
  cs?.classList.replace('cb-scroll', 'cb-clone-scroll');
  front.appendChild(clone);
  const shade = document.createElement('div'); shade.className = 'cb-leaf-shade';
  front.appendChild(shade);
  const back = document.createElement('div'); back.className = 'cb-leaf-back';
  leaf.append(front, back);
  (document.querySelector('.cb-stage') ?? document.body).appendChild(leaf);
  if (cs) cs.scrollTop = scrollTop;
  return leaf;
}

function snapshot(dir: 1 | -1) {
  if (off()) return;
  const page = document.querySelector<HTMLElement>('.cb-scroll');
  const host = document.querySelector<HTMLElement>('.cb-right');
  if (!page || !host) return;
  pending?.leaf.remove();
  pending = { leaf: makeLeaf(host, dir, page.scrollTop), dir };
}

function onPath(next: string, dir: 1 | -1) {
  const changed = next !== lastPath;
  const d = dirBetween(lastPath, next, dir);
  lastPath = next;
  if (changed) snapshot(d);
}

/** history'yi sarmala: yönlendirici pushState'i çağırmadan önce kopya alınır. Bir kez kurulur. */
export function installPageTurn() {
  const push = history.pushState.bind(history);
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    if (url != null) onPath(new URL(String(url), location.href).pathname, 1);
    lastIdx = (data as { idx?: number } | null)?.idx ?? lastIdx + 1;
    push(data, unused, url);
  };
  // popstate: bu dinleyici yönlendiriciden önce eklenir → önce o çalışır. Tarayıcı ileri/geri: history idx'ine göre yön
  addEventListener('popstate', () => {
    const idx = (history.state as { idx?: number } | null)?.idx ?? lastIdx - 1;
    const dir: 1 | -1 = idx > lastIdx ? 1 : -1;
    lastIdx = idx;
    onPath(location.pathname, dir);
  });
}

/** Çevrilen yaprağın altındaki sayfaya düşen gölge (cilde yakın koyulaşır, yaprak kalkınca yayılır). */
function makeCast(host: HTMLElement, z: number) {
  const r = host.getBoundingClientRect();
  const c = document.createElement('div');
  c.className = 'cb-turn-cast';
  c.setAttribute('aria-hidden', 'true');
  c.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:${z};border-radius:${getComputedStyle(host).borderTopLeftRadius}`;
  (document.querySelector('.cb-stage') ?? document.body).appendChild(c);
  return c;
}

/** Yaprağı cilt etrafında çevirir. from/to: açı (0 = sağ sayfada düz, -180 = sola kapanmış).
 *  Gerçekçilik: yaprak ortada hafifçe kalkar (translateZ) ve kıvrılır (skew/scale), yüzeyinde ışık bandı kayar,
 *  dış kenarında parıltı, altındaki sayfaya gölge düşer; sol sayfayı (menüyü) örtmemek için uçta söner. */
function turn(leaf: HTMLElement, from: number, to: number, dur: number, narrow: boolean, cast: HTMLElement) {
  const persp = `perspective(${narrow ? 1200 : 2400}px)`;
  const fwd = to < from;
  const ang = (k: number) => from + (to - from) * k;
  const lift = narrow ? 18 : 42;
  const curl = fwd ? -1 : 1;
  const T = (k: number, z: number, sk: number, sx: number) => `${persp} rotateY(${ang(k)}deg) translateZ(${z}px) skewY(${sk * curl}deg) scaleX(${sx})`;
  const frames: Keyframe[] = [
    { transform: T(0, 0, 0, 1), opacity: fwd ? 1 : 0 },
    { transform: T(0.12, lift * 0.4, 0.8, 0.995), opacity: 1, offset: 0.12 },
    { transform: T(0.35, lift, 1.8, 0.975), opacity: 1, offset: 0.35 },
    { transform: T(0.6, lift * 0.85, 1.2, 0.97), opacity: 1, offset: 0.6 },
    { transform: T(0.86, lift * 0.3, 0.4, 0.99), opacity: fwd ? 1 : 1, offset: 0.86 },
    { transform: T(1, 0, 0, 1), opacity: fwd ? 0 : 1 },
  ];
  if (!fwd) { frames[1].opacity = 1; frames[0].opacity = 0; }
  const ease = 'cubic-bezier(.55,.06,.25,1)';
  const a = leaf.animate(frames, { duration: dur, easing: ease, fill: 'forwards' });
  const shade = leaf.querySelector<HTMLElement>('.cb-leaf-shade')!;
  // ışık bandı yaprak yüzeyinde cilde doğru kayar; yaprak dikleşince yüzey kararır
  shade.animate(fwd
    ? [{ opacity: 0, backgroundPosition: '100% 0' }, { opacity: 1, offset: 0.4 }, { opacity: 0.85, backgroundPosition: '0% 0' }]
    : [{ opacity: 0.85, backgroundPosition: '0% 0' }, { opacity: 1, offset: 0.6 }, { opacity: 0, backgroundPosition: '100% 0' }],
    { duration: dur, easing: ease, fill: 'forwards' });
  const front = leaf.querySelector<HTMLElement>('.cb-leaf-front')!;
  front.animate(fwd
    ? [{ filter: 'brightness(1)' }, { filter: 'brightness(1.1)', offset: 0.25 }, { filter: 'brightness(.82)' }]
    : [{ filter: 'brightness(.82)' }, { filter: 'brightness(1.1)', offset: 0.75 }, { filter: 'brightness(1)' }], { duration: dur, easing: ease });
  const edge = document.createElement('div'); edge.className = 'cb-leaf-edge'; front.appendChild(edge);
  edge.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: dur, easing: ease, fill: 'forwards' });
  cast.animate(fwd
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0.55, offset: 0.7 }, { opacity: 0 }]
    : [{ opacity: 0 }, { opacity: 0.55, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: dur, easing: ease, fill: 'forwards' });
  return a;
}

/** Yeni sayfa DOM'a yerleşince (useLayoutEffect) çağrılır: animasyonu oynatır. */
export function playPageTurn() {
  const p = pending;
  pending = null;
  const page = document.querySelector<HTMLElement>('.cb-scroll');
  if (page) page.scrollTop = 0;
  if (!p) return;
  const { leaf, dir } = p;
  const host = document.querySelector<HTMLElement>('.cb-right');
  if (!host) { leaf.remove(); return; }
  const narrow = innerWidth < 761;
  crystal.pulse(dir);
  pageFlip(narrow ? 0.56 : 0.7);
  const dur = narrow ? 760 : 980;
  const end = narrow ? -160 : -178;
  if (dir > 0) {
    // ileri: eski sayfa cilt etrafında sola çevrilir, altından yeni sayfa görünür
    leaf.style.zIndex = '26';
    const cast = makeCast(host, 25);
    const a = turn(leaf, 0, end, dur, narrow, cast);
    const done = () => { leaf.remove(); cast.remove(); };
    a.onfinish = done; a.oncancel = done;
  } else {
    // geri: eski sayfa sağda kalır, soldaki yaprak (yeni sayfa) çevrilip üstüne kapanır
    leaf.style.zIndex = '24';
    const cast = makeCast(host, 25);
    const incoming = makeLeaf(host, -1, 0);
    incoming.style.zIndex = '26';
    const a = turn(incoming, end, 0, dur, narrow, cast);
    const done = () => { leaf.remove(); incoming.remove(); cast.remove(); };
    a.onfinish = done; a.oncancel = done;
  }
}
