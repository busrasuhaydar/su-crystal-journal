// Gerçekçi sayfa çevirme: yönlendirici yeni sayfayı çizmeden hemen önce eski sayfanın DOM kopyası alınır,
// kopya cilt (sol kenar) etrafında 3B döner; arka yüzü boş kristal sayfadır, kıvrım gölgesi ve parıltı taşır.
// Geri gidişte yeni sayfa soldan çevrilerek gelir. Yalnız transform/opacity → GPU. Hareketi azalt/sade modda kapalı.
import { crystal } from './scene';

const off = () => document.documentElement.classList.contains('simple') || matchMedia('(prefers-reduced-motion: reduce)').matches;
let pending: { leaf: HTMLElement; dir: 1 | -1 } | null = null;
let lastPath = location.pathname;

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
  const clone = page.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  clone.querySelectorAll('[data-glass]').forEach((n) => n.removeAttribute('data-glass'));
  clone.classList.remove('cb-scroll'); clone.classList.add('cb-clone');
  clone.style.cssText = `position:absolute;inset:0;overflow:hidden;`;
  const inner = document.createElement('div');
  inner.style.cssText = `position:absolute;left:0;right:0;top:${-page.scrollTop}px;`;
  // .cb-scroll'un kendisini kopyaladık; kaydırma konumunu korumak için içeriği kaydır
  while (clone.firstChild) inner.appendChild(clone.firstChild);
  clone.appendChild(inner);
  front.appendChild(clone);
  const shade = document.createElement('div'); shade.className = 'cb-leaf-shade';
  front.appendChild(shade);
  const back = document.createElement('div'); back.className = 'cb-leaf-back';
  leaf.append(front, back);
  document.body.appendChild(leaf);
  pending = { leaf, dir };
}

function onPath(next: string, dir: 1 | -1) {
  const changed = next !== lastPath;
  lastPath = next;
  if (changed) snapshot(dir);
}

/** history'yi sarmala: yönlendirici pushState'i çağırmadan önce kopya alınır. Bir kez kurulur. */
export function installPageTurn() {
  const push = history.pushState.bind(history);
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    if (url != null) onPath(new URL(String(url), location.href).pathname, 1);
    push(data, unused, url);
  };
  // popstate: bu dinleyici yönlendiriciden önce eklenir → önce o çalışır
  addEventListener('popstate', () => onPath(location.pathname, -1));
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
  const ease = 'cubic-bezier(.45,.05,.2,1)';
  const dur = narrow ? 640 : 820;
  const front = leaf.querySelector<HTMLElement>('.cb-leaf-front')!;
  const shade = leaf.querySelector<HTMLElement>('.cb-leaf-shade')!;
  if (dir > 0) {
    // eski sayfa cilt etrafında sola çevrilir
    const end = narrow ? -118 : -172;
    const a = leaf.animate([
      { transform: 'perspective(2200px) rotateY(0deg)', opacity: 1 },
      { transform: `perspective(2200px) rotateY(${end * 0.5}deg) skewY(-1.2deg) scaleX(.985)`, opacity: 1, offset: 0.5 },
      { transform: `perspective(2200px) rotateY(${end}deg)`, opacity: narrow ? 0 : 0.0 },
    ], { duration: dur, easing: ease, fill: 'forwards' });
    shade.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.5 }, { opacity: 0.4 }], { duration: dur, easing: ease, fill: 'forwards' });
    front.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.08)', offset: 0.35 }, { filter: 'brightness(.9)' }], { duration: dur, easing: ease });
    a.onfinish = () => leaf.remove();
    a.oncancel = () => leaf.remove();
  } else {
    // geri: yeni sayfa soldan gelir, eski kopya altta kalır ve söner
    leaf.style.zIndex = '4';
    const host = document.querySelector<HTMLElement>('.cb-right');
    if (!host) { leaf.remove(); return; }
    host.style.transformOrigin = 'left center';
    host.style.zIndex = '6';
    const a = host.animate([
      { transform: `perspective(2200px) rotateY(${narrow ? -100 : -150}deg)`, opacity: 0 },
      { transform: 'perspective(2200px) rotateY(-60deg)', opacity: 1, offset: 0.4 },
      { transform: 'perspective(2200px) rotateY(0deg)', opacity: 1 },
    ], { duration: dur, easing: ease });
    leaf.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: 'ease-in', fill: 'forwards' });
    const done = () => { leaf.remove(); host.style.zIndex = ''; host.style.transformOrigin = ''; };
    a.onfinish = done; a.oncancel = done;
  }
}
