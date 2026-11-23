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

/** Yeni sayfa DOM'a yerleşince (useLayoutEffect) çağrılır: animasyonu oynatır. */
export function playPageTurn() {
  const p = pending;
  pending = null;
  const page = document.querySelector<HTMLElement>('.cb-scroll');
  if (page) page.scrollTop = 0;
  if (!p) return;
  const { leaf, dir } = p;
  const narrow = innerWidth < 761;
  crystal.pulse(dir);
  pageFlip(narrow ? 0.56 : 0.7);
  const ease = 'cubic-bezier(.45,.05,.2,1)';
  const dur = narrow ? 700 : 820;
  const front = leaf.querySelector<HTMLElement>('.cb-leaf-front')!;
  const shade = leaf.querySelector<HTMLElement>('.cb-leaf-shade')!;
  if (dir > 0) {
    // eski sayfa cilt etrafında sola çevrilir
    const end = narrow ? -150 : -172;
    const a = leaf.animate([
      { transform: `perspective(${narrow ? 1100 : 2200}px) rotateY(0deg)`, opacity: 1 },
      { transform: `perspective(${narrow ? 1100 : 2200}px) rotateY(${end * 0.5}deg) skewY(-1.2deg) scaleX(.985)`, opacity: 1, offset: 0.5 },
      { transform: `perspective(${narrow ? 1100 : 2200}px) rotateY(${end * 0.85}deg)`, opacity: 1, offset: 0.85 },
      { transform: `perspective(${narrow ? 1100 : 2200}px) rotateY(${end}deg)`, opacity: 0 },
    ], { duration: dur, easing: ease, fill: 'forwards' });
    shade.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.5 }, { opacity: 0.4 }], { duration: dur, easing: ease, fill: 'forwards' });
    front.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.08)', offset: 0.35 }, { filter: 'brightness(.9)' }], { duration: dur, easing: ease });
    a.onfinish = () => leaf.remove();
    a.oncancel = () => leaf.remove();
  } else {
    // geri: gerçek defter gibi — eski sayfa sağda sabit kalır, soldaki yaprak (yeni sayfa) cilt etrafında
    // sağa çevrilip üstüne kapanır. İleri çevirmenin tam aynası; canlı sayfaya (cam ölçülen öğe) dokunulmaz.
    const host = document.querySelector<HTMLElement>('.cb-right');
    if (!host) { leaf.remove(); return; }
    leaf.style.zIndex = '24';
    const incoming = makeLeaf(host, -1, 0);
    incoming.style.zIndex = '25';
    const start = narrow ? -150 : -172;
    const persp = `perspective(${narrow ? 1100 : 2200}px)`;
    const a = incoming.animate([
      { transform: `${persp} rotateY(${start}deg)`, opacity: 0 },
      { transform: `${persp} rotateY(${start * 0.85}deg)`, opacity: 1, offset: 0.15 },
      { transform: `${persp} rotateY(${start * 0.5}deg) skewY(1.2deg) scaleX(.985)`, opacity: 1, offset: 0.5 },
      { transform: `${persp} rotateY(0deg)`, opacity: 1 },
    ], { duration: dur, easing: ease, fill: 'forwards' });
    const inShade = incoming.querySelector<HTMLElement>('.cb-leaf-shade')!;
    inShade.animate([{ opacity: 0.4 }, { opacity: 0.9, offset: 0.5 }, { opacity: 0 }], { duration: dur, easing: ease, fill: 'forwards' });
    incoming.querySelector<HTMLElement>('.cb-leaf-front')!.animate([{ filter: 'brightness(.9)' }, { filter: 'brightness(1.08)', offset: 0.65 }, { filter: 'brightness(1)' }], { duration: dur, easing: ease });
    // yaklaşan yaprağın gölgesi eski sayfaya düşer
    shade.animate([{ opacity: 0 }, { opacity: 0.25, offset: 0.5 }, { opacity: 0.7 }], { duration: dur, easing: ease, fill: 'forwards' });
    const done = () => { leaf.remove(); incoming.remove(); };
    a.onfinish = done; a.oncancel = done;
  }
}
