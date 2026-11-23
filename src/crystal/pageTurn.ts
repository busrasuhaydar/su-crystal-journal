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

function snapshot(dir: 1 | -1) {
  if (off()) return;
  const page = document.querySelector<HTMLElement>('.cb-scroll');
  const host = document.querySelector<HTMLElement>('.cb-right');
  if (!page || !host) return;
  pending?.leaf.remove();
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
  if (cs) cs.scrollTop = page.scrollTop;
  pending = { leaf, dir };
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
    // geri: eski sayfa altta kalır; yeni sayfa cilt tarafından yaprak gibi kalkıp üstüne kapanır (ön yüzü yalnız 90°'den sonra görünür)
    leaf.style.zIndex = '24';
    const host = document.querySelector<HTMLElement>('.cb-right');
    if (!host) { leaf.remove(); return; }
    host.style.transformOrigin = 'left center';
    host.style.zIndex = '26';
    const paper = 'rgba(255,247,252,.94)', glass = 'rgba(255,247,252,0)';
    const a = host.animate([
      { transform: `perspective(2200px) rotateY(${narrow ? -110 : -165}deg)`, opacity: 0, backgroundColor: paper },
      { transform: 'perspective(2200px) rotateY(-92deg)', opacity: 0, backgroundColor: paper, offset: 0.4 },
      { transform: 'perspective(2200px) rotateY(-78deg) skewY(1deg)', opacity: 1, backgroundColor: paper, offset: 0.48 },
      { transform: 'perspective(2200px) rotateY(-12deg)', opacity: 1, backgroundColor: paper, offset: 0.9 },
      { transform: 'perspective(2200px) rotateY(0deg)', opacity: 1, backgroundColor: glass },
    ], { duration: dur, easing: ease });
    leaf.animate([{ opacity: 1 }, { opacity: 1, offset: 0.46 }, { opacity: 0 }], { duration: dur, easing: 'linear', fill: 'forwards' });
    const done = () => { leaf.remove(); host.style.zIndex = ''; host.style.transformOrigin = ''; };
    a.onfinish = done; a.oncancel = done;
  }
}
