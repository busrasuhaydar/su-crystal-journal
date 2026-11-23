// Sihirli sesler: dosya yok, WebAudio ile sentezlenir. Kristal cam çınlaması (dokunuş) ve gerçek sayfa çevirme hışırtısı.
// Ayar: su:sound ('0' = kapalı). iOS'ta ilk dokunuşta ses bağlamı açılır.
import { getPref } from '../lib/prefs';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const on = () => getPref('sound', '1') !== '0';

function ac(): AudioContext | null {
  if (!on()) return null;
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain(); master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

let lastGlass = 0;
/** Kristal cam çınlaması: uyumsuz kısmi sesler (gerçek cam), kısa parıltı + uzun sönüm. */
export function glassTap(strength = 1) {
  const c = ac(); if (!c || !master) return;
  const now = c.currentTime;
  if (now - lastGlass < 0.045) return;
  lastGlass = now;
  const base = 1760 * (0.94 + Math.random() * 0.14);
  const parts: [number, number, number][] = [[1, 0.16, 0.9], [2.32, 0.09, 0.6], [4.25, 0.05, 0.35], [6.8, 0.025, 0.2]];
  for (const [r, g, dec] of parts) {
    const o = c.createOscillator(), e = c.createGain();
    o.type = 'sine'; o.frequency.value = base * r;
    e.gain.setValueAtTime(0, now);
    e.gain.linearRampToValueAtTime(g * strength, now + 0.004);
    e.gain.exponentialRampToValueAtTime(0.0001, now + dec);
    o.connect(e); e.connect(master); o.start(now); o.stop(now + dec + 0.05);
  }
  // ince pırıltı (yüksek frekans gürültü tıkı)
  if (noise) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), e = c.createGain();
    s.buffer = noise; f.type = 'highpass'; f.frequency.value = 6500;
    e.gain.setValueAtTime(0.05 * strength, now); e.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    s.connect(f); f.connect(e); e.connect(master); s.start(now, Math.random()); s.stop(now + 0.08);
  }
}

/** Sayfa çevirme: kâğıt hışırtısı (bant geçiren süpürme) + sonda yaprağın düşüş "fıp"ı. */
export function pageFlip(dur = 0.62) {
  const c = ac(); if (!c || !master || !noise) return;
  const now = c.currentTime;
  const s = c.createBufferSource(), bp = c.createBiquadFilter(), hp = c.createBiquadFilter(), e = c.createGain();
  s.buffer = noise;
  bp.type = 'bandpass'; bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(900, now);
  bp.frequency.exponentialRampToValueAtTime(3800, now + dur * 0.55);
  bp.frequency.exponentialRampToValueAtTime(1400, now + dur);
  hp.type = 'highpass'; hp.frequency.value = 380;
  e.gain.setValueAtTime(0.0001, now);
  e.gain.exponentialRampToValueAtTime(0.32, now + dur * 0.18);
  e.gain.linearRampToValueAtTime(0.22, now + dur * 0.6);
  e.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  s.connect(bp); bp.connect(hp); hp.connect(e); e.connect(master);
  s.start(now, Math.random() * 0.3); s.stop(now + dur + 0.05);
  // yaprak yerine otururken yumuşak tok ses
  const t = now + dur * 0.82;
  const s2 = c.createBufferSource(), lp = c.createBiquadFilter(), e2 = c.createGain();
  s2.buffer = noise; lp.type = 'lowpass'; lp.frequency.value = 700;
  e2.gain.setValueAtTime(0.0001, t); e2.gain.exponentialRampToValueAtTime(0.4, t + 0.012); e2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  s2.connect(lp); lp.connect(e2); e2.connect(master); s2.start(t, 0.5); s2.stop(t + 0.15);
}

/** Her dokunulabilir öğeye cam sesi. Bir kez kurulur. */
export function installSounds() {
  const sel = 'button, a[href], [role="button"], .check, input[type="checkbox"], input[type="radio"], select, summary, .chip';
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement | null;
    const el = t?.closest<HTMLElement>(sel);
    if (!el || (el as HTMLButtonElement).disabled) return;
    glassTap(el.matches('.btn-primary, .cr-new, .check') ? 1.15 : 0.8);
  }, { passive: true, capture: true });
}
