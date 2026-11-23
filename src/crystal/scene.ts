// Kristal sahne çalışma zamanı: tek tam ekran WebGL2 tuvali.
// DOM'daki [data-glass] öğelerinin konumları her karede ölçülür ve shader'a cam levha olarak verilir.
// Performans: gökyüzü düşük çözünürlükte ~12 fps güncellenir; cam geçişi ≤30 fps (mobilde 24), sekme gizliyken durur,
// "hareketi azalt" ve sade modda yalnızca değişiklik olunca tek kare çizilir. WebGL2 yoksa html.no-gl → CSS cam.
import { GLASS, MAX_SLABS, SKY, VERT } from './shaders';

type Kind = { r: number; bevel: number; frost: number; milk: number; thick: number; shadow: number; rim: number; irid: number };
const KINDS: Record<string, Kind> = {
  cover: { r: 34, bevel: 22, frost: 1.2, milk: 0.10, thick: 26, shadow: 1, rim: 1, irid: 0.8 },
  page: { r: 24, bevel: 12, frost: 3.2, milk: 0.58, thick: 14, shadow: 0.45, rim: 0.75, irid: 0.5 },
  left: { r: 24, bevel: 12, frost: 3.0, milk: 0.46, thick: 14, shadow: 0.45, rim: 0.75, irid: 0.6 },
  spine: { r: 14, bevel: 9, frost: 1.5, milk: 0.2, thick: 18, shadow: 0, rim: 1.1, irid: 1 },
  dock: { r: 30, bevel: 14, frost: 2.4, milk: 0.42, thick: 18, shadow: 0.9, rim: 1, irid: 0.7 },
  bar: { r: 22, bevel: 10, frost: 2.6, milk: 0.40, thick: 12, shadow: 0.5, rim: 0.8, irid: 0.6 },
  window: { r: 28, bevel: 14, frost: 0, milk: 0, thick: 22, shadow: 0, rim: 1, irid: 0.9 },
};

export const crystal = {
  turn: { start: 0, dir: 1, active: false },
  pulse(dir: 1 | -1) { this.turn = { start: performance.now(), dir, active: true }; poke(); },
};

let wake = () => {};
let poke = () => {};

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}
function program(gl: WebGL2RenderingContext, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

export function startCrystal(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) { document.documentElement.classList.add('no-gl'); return () => {}; }
  let skyP: WebGLProgram, glassP: WebGLProgram;
  try { skyP = program(gl, SKY); glassP = program(gl, GLASS); } catch (e) {
    console.warn('Kristal shader derlenemedi', e); document.documentElement.classList.add('no-gl'); return () => {};
  }
  document.documentElement.classList.add('gl');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture()!;
  const fbo = gl.createFramebuffer()!;
  let skyW = 0, skyH = 0;
  const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const su = { res: U(skyP, 'uRes'), time: U(skyP, 'uTime'), mobile: U(skyP, 'uMobile') };
  const gu = {
    sky: U(glassP, 'uSky'), res: U(glassP, 'uRes'), dpr: U(glassP, 'uDpr'), time: U(glassP, 'uTime'), light: U(glassP, 'uLight'), count: U(glassP, 'uCount'),
    rect: U(glassP, 'uRect'), shape: U(glassP, 'uShape'), opt: U(glassP, 'uOpt'), map: U(glassP, 'uMap'), clip: U(glassP, 'uClip'), turn: U(glassP, 'uTurn'),
  };
  const rects = new Float32Array(MAX_SLABS * 4), shapes = new Float32Array(MAX_SLABS * 4), opts = new Float32Array(MAX_SLABS * 4), maps = new Float32Array(MAX_SLABS * 4), clips = new Float32Array(MAX_SLABS * 4);

  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('simple');
  let dpr = 1, W = 0, H = 0, mobile = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.6 : 1.5);
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    canvas.width = W; canvas.height = H;
    mobile = innerWidth < 761 ? 1 : 0;
    const s = coarse ? 0.55 : 0.6;
    skyW = Math.max(64, Math.round(innerWidth * s)); skyH = Math.max(64, Math.round(innerHeight * s));
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, skyW, skyH, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    lastSky = -1e9;
  }

  // ışık: fareyi yumuşakça izler; dokunmatikte yavaşça döner
  const light = { x: innerWidth * 0.25, y: -80, tx: innerWidth * 0.25, ty: -80 };
  const onMove = (e: PointerEvent) => { lastInput = performance.now(); if (e.pointerType === 'mouse') { light.tx = e.clientX; light.ty = e.clientY - 40; wake(); } };
  addEventListener('pointermove', onMove, { passive: true });

  let raf = 0, lastSky = -1e9, lastFrame = 0, running = true, ready = false, lastInput = performance.now();
  const t0 = performance.now();

  function measure() {
    const els = document.querySelectorAll<HTMLElement>('[data-glass]');
    let n = 0;
    for (const el of els) {
      if (n >= MAX_SLABS) break;
      const k = KINDS[el.dataset.glass!];
      if (!k) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2 || !el.getClientRects().length) continue;
      const css = getComputedStyle(el);
      const rad = parseFloat(css.borderTopLeftRadius) || k.r;
      rects.set([b.left, b.top, b.width, b.height], n * 4);
      const sc = el.closest('.cb-scroll');
      if (sc) { const c = sc.getBoundingClientRect(); clips.set([c.left, c.top, c.right, c.bottom], n * 4); }
      else clips.set([-1e5, -1e5, 1e5, 1e5], n * 4);
      shapes.set([rad, k.bevel * (mobile ? 0.8 : 1), k.frost, k.milk], n * 4);
      opts.set([k.thick * (mobile ? 0.75 : 1), k.shadow, k.rim, k.irid], n * 4);
      if (el.dataset.glass === 'window') {
        // pencere oranında, şato + ufuk + güneşi çerçeveleyen sahne bölgesi
        const vw = innerWidth, vh = innerHeight;
        // şato tabanı pencerenin %86 yüksekliğine, masaüstünde sağdaki kristal kartların arkasına (%80) oturur
        const cx = vw * (mobile ? 0.70 : 0.80), base = vh * (mobile ? 0.61 : 0.67);
        let th = vh * 0.62, tw = th * (b.width / b.height);
        if (tw > vw * 0.98) { tw = vw * 0.98; th = tw * (b.height / b.width); }
        const tx = Math.min(Math.max(cx - tw * (mobile ? 0.5 : 0.8), 0), vw - tw), ty = Math.min(Math.max(base - th * 0.86, 0), vh - th);
        maps.set([tx, ty, tw, th], n * 4);
      } else maps.set([0, 0, 0, 0], n * 4);
      n++;
    }
    return n;
  }

  function frame(now: number) {
    raf = 0;
    if (!running) return;
    const still = reduce();
    // etkileşim yokken (8 sn) kare hızı yarıya iner: pil ve ısı tasarrufu
    const idle = now - lastInput > 8000;
    const fps = (coarse ? 24 : 30) / (idle ? 2 : 1);
    if (!still && now - lastFrame < 1000 / fps - 2) { raf = requestAnimationFrame(frame); return; }
    lastFrame = now;
    const t = (now - t0) / 1000;
    light.x += (light.tx - light.x) * 0.12; light.y += (light.ty - light.y) * 0.12;
    if (coarse && !still) { light.tx = innerWidth * (0.5 + 0.35 * Math.sin(t * 0.25)); light.ty = innerHeight * (0.15 + 0.1 * Math.cos(t * 0.31)); }
    const g = gl!;
    // gökyüzü
    if (now - lastSky > (still ? 1e12 : idle ? 170 : 85) || lastSky < 0) {
      lastSky = now;
      g.bindFramebuffer(g.FRAMEBUFFER, fbo);
      g.viewport(0, 0, skyW, skyH);
      g.useProgram(skyP);
      g.uniform2f(su.res, skyW, skyH); g.uniform1f(su.time, still ? 12 : t); g.uniform1f(su.mobile, mobile);
      g.drawArrays(g.TRIANGLES, 0, 3);
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.bindTexture(g.TEXTURE_2D, tex);
      g.generateMipmap(g.TEXTURE_2D);
    }
    // cam
    const n = measure();
    let turnX = 0, turnA = 0;
    if (crystal.turn.active) {
      const k = (now - crystal.turn.start) / 820;
      if (k >= 1) crystal.turn.active = false; else { turnX = k * 1.3 - 0.15; turnA = Math.sin(Math.PI * k); }
    }
    g.viewport(0, 0, W, H);
    g.useProgram(glassP);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, tex); g.uniform1i(gu.sky, 0);
    g.uniform2f(gu.res, W, H); g.uniform1f(gu.dpr, dpr); g.uniform1f(gu.time, still ? 12 : t);
    g.uniform2f(gu.light, light.x, light.y); g.uniform1i(gu.count, n);
    g.uniform4fv(gu.rect, rects); g.uniform4fv(gu.shape, shapes); g.uniform4fv(gu.opt, opts); g.uniform4fv(gu.map, maps); g.uniform4fv(gu.clip, clips);
    g.uniform4f(gu.turn, turnX, turnA, crystal.turn.dir, 0);
    g.drawArrays(g.TRIANGLES, 0, 3);
    if (!ready) { ready = true; requestAnimationFrame(() => document.documentElement.classList.add('gl-ready')); }
    const settling = Math.abs(light.tx - light.x) + Math.abs(light.ty - light.y) > 0.5;
    if (!still || crystal.turn.active || settling) raf = requestAnimationFrame(frame);
  }
  wake = () => { if (!raf && running) raf = requestAnimationFrame(frame); };
  poke = () => { lastInput = performance.now(); wake(); };

  const onResize = () => { resize(); wake(); };
  const onVis = () => { running = !document.hidden; if (running) wake(); };
  // düzen değişince (sayfa geçişi, menü açılması) yeniden ölç
  const ro = new ResizeObserver(() => wake());
  const mo = new MutationObserver(() => { for (const el of document.querySelectorAll('[data-glass]')) ro.observe(el); wake(); });
  mo.observe(document.body, { childList: true, subtree: true });
  const onScroll = () => { lastInput = performance.now(); wake(); };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; document.documentElement.classList.replace('gl', 'no-gl'); });
  resize(); wake();
  return () => {
    running = false; cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove); removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis); document.removeEventListener('scroll', onScroll, true); ro.disconnect(); mo.disconnect();
  };
}
