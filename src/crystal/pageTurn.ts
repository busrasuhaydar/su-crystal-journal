// Gerçekçi sayfa çevirme (kıvrılan kristal yaprak).
// Yönlendirici yeni sayfayı çizmeden hemen önce sağ sayfanın DOM kopyası alınır. Yaprak, cilde bağlı iç içe 5 dilimden
// oluşur: her dilim bir öncekinin ucuna menteşelidir; dönüş sırasında dilimler kademeli büküldüğü için yaprak kâğıt gibi
// kıvrılır, yere inerken düzleşir. Her dilim açısına göre gölgelenir/parlar, arka yüzü buzlu kristal sayfadır,
// alttaki sayfaya yaprağın kenarını izleyen gölge düşer. Yaprak yüzü buzlu yarı saydam camdır (opak beyaz değil).
// Animasyon rAF ile yalnız transform/opacity günceller. Hareketi azalt / sade / zoom modunda kapalı.
import { crystal } from './scene';
import { pageFlip } from './sound';
import { NAV, isActive } from './Nav';

const off = () => {
  const c = document.documentElement.classList;
  return c.contains('simple') || c.contains('zm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
};
type Snap = { tpl: HTMLElement; scrollTop: number; dir: 1 | -1 };
let pending: Snap | null = null;
let running: (() => void) | null = null;
let lastPath = location.pathname;
let lastIdx = (history.state as { idx?: number } | null)?.idx ?? 0;
const navOf = (path: string) => NAV.findIndex((n) => isActive(path, n));
/** Defter mantığı: menüde ileride olan bölüme geçiş sayfayı ileri çevirir, geride olana geçiş geri çevirir; aynı bölümde derine inmek ileri. */
function dirBetween(from: string, to: string, fallback: 1 | -1): 1 | -1 {
  const a = navOf(from), b = navOf(to);
  if (a >= 0 && b >= 0 && a !== b) return b > a ? 1 : -1;
  return fallback;
}

/** Sağ sayfanın (başlık + içerik) etkileşimsiz kopyası. */
function cloneHost(host: HTMLElement) {
  const c = host.cloneNode(true) as HTMLElement;
  c.removeAttribute('data-glass'); c.removeAttribute('style');
  c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  c.querySelectorAll('[data-glass]').forEach((n) => n.removeAttribute('data-glass'));
  c.querySelectorAll('.cb-corner').forEach((n) => n.remove());
  c.className = 'cb-clone';
  c.querySelector('.cb-scroll')?.classList.replace('cb-scroll', 'cb-clone-scroll');
  return c;
}

function snapshot(dir: 1 | -1) {
  if (off()) return;
  const page = document.querySelector<HTMLElement>('.cb-scroll');
  const host = document.querySelector<HTMLElement>('.cb-right');
  if (!page || !host) return;
  running?.();
  pending = { tpl: cloneHost(host), scrollTop: page.scrollTop, dir };
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
  addEventListener('popstate', () => {
    const idx = (history.state as { idx?: number } | null)?.idx ?? lastIdx - 1;
    const dir: 1 | -1 = idx > lastIdx ? 1 : -1;
    lastIdx = idx;
    onPath(location.pathname, dir);
  });
}

// ── kıvrılan yaprak ──
const FR = [0.4, 0.12, 0.1, 0.1, 0.1, 0.09, 0.09];          // dilim genişlikleri (cilt → uç)
const BEND = [0, 5, 7, 9, 11, 13, 15];                     // en çok bükülme (derece), uca doğru artar

type Face = { el: HTMLElement; shade: HTMLElement };
type Leaf = { root: HTMLElement; segs: HTMLElement[]; fronts: Face[]; backs: Face[] };

function buildLeaf(rect: DOMRect, radius: string, content: HTMLElement, scrollTop: number, z: number): Leaf {
  const stage = document.querySelector('.cb-stage') ?? document.body;
  const root = document.createElement('div');
  root.className = 'cl-leaf'; root.setAttribute('aria-hidden', 'true');
  root.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:${z}`;
  const segs: HTMLElement[] = [], fronts: Face[] = [], backs: Face[] = [];
  let parent: HTMLElement = root, x0 = 0, prevW = 0;
  FR.forEach((f, i) => {
    const w = rect.width * f;
    const last = i === FR.length - 1;
    const seg = document.createElement('div');
    seg.className = 'cl-seg';
    // komşu dilimler arasında kıl payı örtüşme: kıvrımda ince çizgi/boşluk görünmesin
    seg.style.cssText = `left:${i ? prevW - 0.5 : 0}px;width:${w + (last ? 0 : 1)}px`;
    const mk = (cls: string): Face => {
      const el = document.createElement('div'); el.className = `cl-face ${cls}`;
      const shade = document.createElement('div'); shade.className = 'cl-shade';
      return { el, shade };
    };
    const fr = mk('front'), bk = mk('back');
    const c = i === 0 ? content : (content.cloneNode(true) as HTMLElement);
    c.style.cssText = `position:absolute;top:0;left:${-(x0 - (i ? 0.5 * i : 0))}px;width:${rect.width}px;height:${rect.height}px`;
    fr.el.append(c, fr.shade); bk.el.append(bk.shade);
    if (i === 0) { fr.el.style.borderRadius = `${radius} 0 0 ${radius}`; bk.el.style.borderRadius = `0 ${radius} ${radius} 0`; }
    if (last) {
      fr.el.style.borderRadius = `0 ${radius} ${radius} 0`; bk.el.style.borderRadius = `${radius} 0 0 ${radius}`;
      const ed = document.createElement('div'); ed.className = 'cl-edge'; fr.el.appendChild(ed);
    }
    seg.append(fr.el, bk.el);
    parent.appendChild(seg);
    segs.push(seg); fronts.push(fr); backs.push(bk);
    parent = seg; x0 += w; prevW = w;
  });
  stage.appendChild(root);
  root.querySelectorAll<HTMLElement>('.cb-clone-scroll').forEach((s) => { s.scrollTop = scrollTop; });
  return { root, segs, fronts, backs };
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const D2R = Math.PI / 180;

/** p: 0 = yaprak sağda düz, 1 = sola kapanmış. Yaprağı, dilim gölgelerini ve düşen gölgeyi bu duruma getirir. */
function pose(L: Leaf, p: number, end: number, persp: number, cast: HTMLElement, W: number) {
  const theta = end * p;
  const flex = Math.pow(Math.sin(Math.PI * p), 1.1);  // ortada en çok kıvrım, başta/sonda düz
  L.root.style.transform = `perspective(${persp}px) rotateY(${theta.toFixed(2)}deg) translateZ(${(30 * flex).toFixed(1)}px)`;
  let phi = theta, pd = -1, pg = 0;
  for (let i = 0; i < L.segs.length; i++) {
    const b = BEND[i] * flex;                          // uç geride kalır: yaprak hava direnciyle bombeleşir
    phi += b;
    if (i) L.segs[i].style.transform = `rotateY(${b.toFixed(2)}deg)`;
    const tilt = 1 - Math.abs(Math.cos(phi * D2R));   // 0 düz, 1 dik
    const dark = Math.min(0.42, tilt * 0.46);
    const glint = Math.max(0, -Math.sin(2 * phi * D2R)) * 0.2 * flex;   // 30-60° arası ince parlama
    if (pd < 0) { pd = dark; pg = glint; }
    // dilimden dilime yumuşak geçiş: her dilimin gölgesi bir öncekinin değerinden başlar → ek yeri görünmez
    L.fronts[i].shade.style.background = `linear-gradient(90deg, rgba(255,255,255,${pg.toFixed(3)}), rgba(255,255,255,${glint.toFixed(3)})), linear-gradient(90deg, rgba(70,12,60,${pd.toFixed(3)}), rgba(70,12,60,${dark.toFixed(3)}))`;
    L.backs[i].shade.style.background = `linear-gradient(270deg, rgba(70,12,60,${(pd * 0.85).toFixed(3)}), rgba(70,12,60,${(dark * 0.85).toFixed(3)}))`;
    pd = dark; pg = glint;
  }
  // alttaki sayfaya düşen gölge: yaprağın izdüşüm kenarını izler
  cast.style.setProperty('--x', `${Math.max(0, W * Math.cos(theta * D2R)).toFixed(1)}px`);
  cast.style.opacity = (Math.sin(Math.PI * p) * 0.9).toFixed(3);
  // sol sayfayı (menüyü) örtmemek için son %20'de söner
  L.root.style.opacity = p > 0.8 ? Math.max(0, (1 - p) / 0.2).toFixed(3) : '1';
}

/** Yeni sayfa DOM'a yerleşince (useLayoutEffect) çağrılır: animasyonu oynatır. */
export function playPageTurn() {
  const snap = pending;
  pending = null;
  const page = document.querySelector<HTMLElement>('.cb-scroll');
  if (page) page.scrollTop = 0;
  if (!snap) return;
  const host = document.querySelector<HTMLElement>('.cb-right');
  if (!host) return;
  const rect = host.getBoundingClientRect();
  const radius = getComputedStyle(host).borderTopLeftRadius || '20px';
  const narrow = innerWidth < 761;
  const end = narrow ? -165 : -179;
  const persp = narrow ? 1300 : 2600;
  const dur = narrow ? 820 : 1050;
  const stage = document.querySelector('.cb-stage') ?? document.body;
  crystal.pulse(snap.dir);
  pageFlip(dur / 1000);

  const box = (cls: string, z: number) => {
    const d = document.createElement('div'); d.className = cls; d.setAttribute('aria-hidden', 'true');
    d.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:${z};border-radius:${radius}`;
    stage.appendChild(d); return d;
  };
  const cast = box('cl-cast', 25);
  let leaf: Leaf, under: HTMLElement | null = null;
  if (snap.dir > 0) {
    // ileri: eski sayfa kıvrılarak sola çevrilir; altında yeni sayfa
    leaf = buildLeaf(rect, radius, snap.tpl, snap.scrollTop, 26);
  } else {
    // geri: eski sayfa yerinde kalır (kopya), yeni sayfa soldan kıvrılarak gelip üstüne kapanır
    under = box('cl-under', 24);
    under.appendChild(snap.tpl);
    const s = snap.tpl.querySelector<HTMLElement>('.cb-clone-scroll'); if (s) s.scrollTop = snap.scrollTop;
    leaf = buildLeaf(rect, radius, cloneHost(host), 0, 26);
    host.classList.add('cl-hide');                      // canlı sayfa yaprak inene kadar gizli: iki sayfa üst üste binmez
  }
  const t0 = performance.now();
  let raf = 0;
  const p0 = snap.dir > 0 ? 0 : 1;
  const finish = () => { cancelAnimationFrame(raf); leaf.root.remove(); cast.remove(); under?.remove(); host.classList.remove('cl-hide'); running = null; };
  running = finish;
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = easeInOut(t);
    pose(leaf, snap.dir > 0 ? e : 1 - e, end, persp, cast, rect.width);
    if (t < 1) raf = requestAnimationFrame(step); else finish();
  };
  pose(leaf, p0, end, persp, cast, rect.width);
  raf = requestAnimationFrame(step);
}
