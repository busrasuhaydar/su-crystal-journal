// Kristal defter shader'ları (WebGL2).
// 1) SKY: düşük çözünürlüklü masalsı gökyüzü (bulut, güneş, ay, yıldız, tepeler, kristal şato, göl yansıması, kiraz ağaçları, ışık kürecikleri).
//    Seyrek güncellenir (bulutlar yavaş akar), mipmap'lenir → buzlu cam bulanıklığı için ücretsiz LOD.
// 2) GLASS: tam çözünürlükte, DOM'dan ölçülen cam levhaların (kapak, sayfalar, cilt, dok) fiziksel görünümü:
//    yuvarlatılmış kalın kenar profili, Snell kırılması (RGB ayrı kırılma indisi = dağılma), Fresnel, speküler,
//    inci yanardönerliği, buzlanma (mip LOD), süt beyazı okunurluk katmanı, iç kostik çizgi, yere düşen gölge.

export const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const NOISE = `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02 + 7.1; a *= 0.5; }
  return v;
}`;

export const SKY = `#version 300 es
precision highp float;
uniform vec2 uRes;      // gökyüzü dokusu boyutu (px)
uniform float uTime;
uniform float uMobile;  // 0 masaüstü, 1 mobil (dikey kompozisyon)
out vec4 o;
${NOISE}

// yumuşak tepe sırtı
float ridge(float x, float base, float amp, float freq, float seed) { return base + amp * (fbm(vec2(x * freq + seed, seed)) - 0.5); }

// kristal şato silüeti: kuleler + konik çatılar. d<0 içeride. Ayrıca pencere ışığı maskesi döner.
float tower(vec2 p, float x, float w, float h, float roof) {
  vec2 q = p - vec2(x, 0.0);
  float body = max(abs(q.x) - w, max(-q.y, q.y - h));
  // koni: tepe noktası (0, h+roof), taban genişliği w*1.25
  float k = (q.y - h) / roof;
  float cone = max(abs(q.x) - w * 1.25 * (1.0 - k), max(-(q.y - h), q.y - h - roof));
  return min(body, cone);
}
float castle(vec2 p, out float win) {
  float d = 1e3;
  d = min(d, tower(p, 0.000, 0.034, 0.170, 0.110));
  d = min(d, tower(p, -0.070, 0.022, 0.120, 0.080));
  d = min(d, tower(p, 0.072, 0.024, 0.130, 0.085));
  d = min(d, tower(p, -0.125, 0.016, 0.085, 0.060));
  d = min(d, tower(p, 0.128, 0.017, 0.092, 0.062));
  d = min(d, tower(p, 0.035, 0.012, 0.215, 0.070));
  d = min(d, tower(p, -0.030, 0.011, 0.195, 0.060));
  // sur
  d = min(d, max(abs(p.x) - 0.15, max(-p.y, p.y - 0.06)));
  // pencereler: kulelerin gövdesinde küçük dikdörtgen ızgara
  vec2 g = fract(p * vec2(55.0, 30.0)) - 0.5;
  float cell = hash(floor(p * vec2(55.0, 30.0)));
  win = step(0.62, cell) * step(abs(g.x), 0.18) * step(abs(g.y), 0.26) * step(0.015, p.y);
  return d;
}

vec3 sky(vec2 uv, float horizon) {
  float t = clamp((uv.y - horizon) / (1.0 - horizon), 0.0, 1.0);
  vec3 peach = vec3(1.00, 0.84, 0.70), rose = vec3(0.98, 0.66, 0.83), lav = vec3(0.74, 0.64, 0.95), deep = vec3(0.56, 0.52, 0.90);
  vec3 col = mix(peach, rose, smoothstep(0.0, 0.38, t));
  col = mix(col, lav, smoothstep(0.32, 0.82, t));
  col = mix(col, deep, smoothstep(0.82, 1.15, t) * 0.7);
  // sol üstte turkuaz esinti
  col = mix(col, vec3(0.62, 0.90, 0.94), 0.35 * smoothstep(0.75, 0.0, length((uv - vec2(-0.05, 1.05)) * vec2(1.0, 1.4))));
  float aspect = uRes.x / uRes.y;
  vec2 sp = vec2(mix(0.60, 0.55, uMobile), horizon + 0.07);
  vec2 dv = (uv - sp) * vec2(aspect, 1.0);
  float sd = length(dv);
  col += vec3(1.0, 0.78, 0.55) * exp(-sd * 3.2) * 0.55 + vec3(1.0, 0.92, 0.80) * exp(-sd * 14.0) * 0.8;
  col = mix(col, vec3(1.0, 0.97, 0.90), smoothstep(0.045, 0.038, sd));
  // ay
  vec2 mp = vec2(mix(0.86, 0.80, uMobile), mix(0.84, 0.90, uMobile));
  float md = length((uv - mp) * vec2(aspect, 1.0));
  float moon = smoothstep(0.052, 0.046, md);
  float crater = fbm((uv - mp) * 60.0) * 0.18;
  col += vec3(1.0, 0.9, 0.96) * exp(-md * 9.0) * 0.35;
  col = mix(col, vec3(1.0, 0.93, 0.97) - crater, moon * 0.92);
  // yıldızlar
  vec2 sg = uv * vec2(aspect, 1.0) * 70.0;
  float sh = hash(floor(sg));
  float star = step(0.985, sh) * smoothstep(0.35, 0.0, length(fract(sg) - 0.5)) * (0.55 + 0.45 * sin(uTime * (1.0 + sh * 3.0) + sh * 40.0));
  col += star * smoothstep(0.45, 0.9, t) * 0.9;
  // bulutlar: alan bükmeli fbm, güneşe bakan yüzleri şeftali, gölgeli yüzleri lavanta
  vec2 cp = vec2(uv.x * aspect, uv.y) * vec2(1.35, 3.6) + vec2(uTime * 0.006, 0.0);
  vec2 w = vec2(fbm(cp + 3.1), fbm(cp + 8.7));
  float n = fbm(cp + 1.6 * w);
  float band = smoothstep(0.02, 0.22, t) * smoothstep(1.0, 0.45, t);
  float dens = smoothstep(0.48, 0.80, n) * band;
  float lit = clamp(0.5 + (n - fbm(cp + 1.6 * w + vec2(0.05, -0.08))) * 6.0, 0.0, 1.0);
  vec3 cloud = mix(vec3(0.86, 0.70, 0.93), vec3(1.0, 0.86, 0.86), lit);
  cloud += vec3(1.0, 0.80, 0.60) * exp(-sd * 2.5) * 0.5;
  col = mix(col, cloud, dens * 0.88);
  // ince yüksek bulut çizgileri
  float cir = smoothstep(0.58, 0.85, fbm(vec2(uv.x * aspect * 0.8 + uTime * 0.004, uv.y * 14.0))) * smoothstep(0.4, 0.9, t);
  col = mix(col, vec3(1.0, 0.88, 0.95), cir * 0.35);

  // uzak tepeler (atmosfer perspektifi)
  float x = uv.x * aspect;
  float r1 = ridge(x, horizon + 0.075, 0.09, 2.2, 4.0);
  float r2 = ridge(x, horizon + 0.035, 0.07, 3.4, 9.0);
  col = mix(col, mix(col, vec3(0.80, 0.68, 0.92), 0.65), smoothstep(r1 + 0.004, r1 - 0.004, uv.y));
  // şato
  float cx = mix(0.80, 0.70, uMobile) * aspect;
  float cs = mix(1.55, 1.25, uMobile);
  vec2 cpos = vec2((x - cx) / cs, (uv.y - (horizon + 0.03)) / cs);
  float win;
  float cd = castle(cpos, win);
  float inC = smoothstep(0.003, -0.002, cd);
  vec3 stone = mix(vec3(0.66, 0.50, 0.86), vec3(1.0, 0.84, 0.93), clamp(0.5 - cpos.x * 4.0, 0.0, 1.0));
  stone = mix(stone, vec3(0.95, 0.80, 0.98), smoothstep(0.1, 0.3, cpos.y));
  stone = mix(stone, vec3(1.0, 0.95, 0.98), smoothstep(-0.006, 0.0, cd) * 0.6);   // kenar ışıltısı
  stone += vec3(1.0, 0.85, 0.5) * win * (0.6 + 0.4 * sin(uTime * 2.0 + cpos.x * 90.0));
  col = mix(col, stone, inC * 0.92);
  col += vec3(1.0, 0.82, 0.95) * exp(-max(cd, 0.0) * 40.0) * 0.22 * (1.0 - inC);       // şato çevresinde hale
  col = mix(col, mix(col, vec3(0.74, 0.60, 0.88), 0.7), smoothstep(r2 + 0.004, r2 - 0.004, uv.y));
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float horizon = mix(0.30, 0.36, uMobile);
  vec3 col;
  float aspect = uRes.x / uRes.y;
  if (uv.y >= horizon) {
    col = sky(uv, horizon);
  } else {
    // göl: dalgalı yansıma + güneş yolu pırıltısı
    float dy = horizon - uv.y;
    float rip = (noise(vec2(uv.x * 40.0, dy * 120.0 - uTime * 0.6)) - 0.5) * 0.012 * (0.4 + dy * 4.0);
    col = sky(vec2(uv.x + rip, horizon + dy * 1.25), horizon);
    col = mix(col, vec3(0.78, 0.66, 0.92), 0.25 + dy * 0.6);
    float sx = mix(0.60, 0.55, uMobile);
    float path = exp(-abs(uv.x - sx) * aspect * (6.0 + 30.0 * dy));
    float glit = step(0.86, noise(vec2(uv.x * 260.0, dy * 900.0 - uTime * 2.0)));
    col += vec3(1.0, 0.86, 0.7) * path * (0.25 + glit * 0.9);
  }
  // köşelerde çiçekli kiraz ağaçları: gövde + birkaç çiçek kümesi, gölgeli ve ışıklı taraf
  vec2 q = vec2(uv.x * aspect, uv.y);
  for (int s = 0; s < 2; s++) {
    float side = float(s);
    float sx = side < 0.5 ? 1.0 : -1.0;
    vec2 root = side < 0.5 ? vec2(0.02, horizon - 0.02) : vec2(aspect - 0.02, horizon - 0.03);
    // gövde ve dallar (eğri çizgiler)
    float trunk = 1e3;
    for (int b = 0; b < 4; b++) {
      float fb = float(b);
      vec2 a = root, tip = root + vec2(sx * (0.05 + 0.07 * fb), 0.20 + 0.06 * fb - 0.04 * float(b == 3));
      vec2 pa = q - a, ba = tip - a;
      float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      vec2 bend = vec2(sx * 0.03 * sin(hh * 3.0 + fb), 0.0);
      trunk = min(trunk, length(pa - ba * hh - bend) - mix(0.010, 0.003, hh));
    }
    col = mix(col, vec3(0.45, 0.28, 0.40), smoothstep(0.002, -0.001, trunk) * 0.85);
    // çiçek kümeleri
    float m = 0.0, shade = 0.0;
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      vec2 c = root + vec2(sx * (0.03 + 0.06 * hash(vec2(fk, side + 2.0)) + 0.05 * fk * 0.5), 0.17 + 0.09 * hash(vec2(fk, side + 7.0)) + 0.025 * fk);
      float rad = mix(0.085, 0.065, uMobile) * (0.7 + 0.5 * hash(vec2(fk, side + 4.0)));
      vec2 d = q - c;
      float blob = length(d * vec2(1.0, 1.15)) - rad + (fbm(q * 18.0 + fk) - 0.5) * 0.05;
      float mm = smoothstep(0.006, -0.008, blob);
      shade = max(shade, mm * clamp(0.5 - d.y / rad * 0.6 + sx * d.x / rad * 0.3, 0.0, 1.0));
      m = max(m, mm);
    }
    float fl = fbm(q * 70.0 + side * 5.0);
    vec3 bloom = mix(vec3(0.93, 0.50, 0.72), vec3(1.0, 0.82, 0.92), shade);
    bloom = mix(bloom, vec3(1.0, 0.95, 0.98), smoothstep(0.62, 0.78, fl) * 0.7 * shade);
    bloom = mix(bloom, vec3(0.80, 0.40, 0.62), smoothstep(0.42, 0.30, fl) * 0.35);
    col = mix(col, bloom, m * 0.94);
  }
  // süzülen ışık kürecikleri (bokeh): pembe, altın, turkuaz
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    vec2 bp = vec2(hash(vec2(fi, 1.3)), hash(vec2(fi, 7.9)));
    bp.y = fract(bp.y + uTime * (0.004 + 0.006 * hash(vec2(fi, 3.1))));
    bp.x += 0.03 * sin(uTime * 0.2 + fi);
    float r = 0.012 + 0.03 * hash(vec2(fi, 9.4));
    float bd = length((uv - bp) * vec2(aspect, 1.0));
    vec3 bc = fi < 6.0 ? vec3(1.0, 0.7, 0.88) : fi < 12.0 ? vec3(1.0, 0.88, 0.6) : vec3(0.7, 0.98, 0.96);
    col += bc * smoothstep(r, r * 0.55, bd) * 0.22 * (0.6 + 0.4 * sin(uTime + fi * 2.0));
  }
  o = vec4(col, 1.0);
}`;

export const MAX_SLABS = 8;

export const GLASS = `#version 300 es
precision highp float;
uniform sampler2D uSky;
uniform vec2 uRes;        // tuval (cihaz px)
uniform float uDpr;
uniform float uTime;
uniform vec2 uLight;      // ışık (css px)
uniform int uCount;
uniform vec4 uRect[${MAX_SLABS}];   // x, y, w, h (css px, sol üst köken)
uniform vec4 uShape[${MAX_SLABS}];  // yarıçap, kenar genişliği, buzlanma LOD, süt
uniform vec4 uOpt[${MAX_SLABS}];    // kalınlık, gölge, kenar parlaklığı, yanardöner
uniform vec4 uMap[${MAX_SLABS}];    // sihirli pencere: levhanın içine sahnenin hangi bölgesi çizilecek (x,y,w,h css px; w=0 → doğrudan arka)
uniform vec4 uClip[${MAX_SLABS}];   // kaydırma kabı sınırı (x0, y0, x1, y1)
uniform vec4 uTurn;       // x: ilerleme 0..1, y: genlik, z: yön
out vec4 o;

float sdRound(vec2 p, vec2 c, vec2 h, float r) {
  vec2 q = abs(p - c) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec3 skyAt(vec2 css, float lod) {
  vec2 uv = vec2(css.x, uRes.y / uDpr - css.y) / (uRes / uDpr);
  return textureLod(uSky, clamp(uv, 0.001, 0.999), lod).rgb;
}
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec3 col = skyAt(p, 0.0);
  vec2 L2 = normalize(uLight - p + 0.001);

  for (int i = 0; i < ${MAX_SLABS}; i++) {
    if (i >= uCount) break;
    vec4 R = uRect[i]; vec4 S = uShape[i]; vec4 O = uOpt[i]; vec4 M = uMap[i]; vec4 K = uClip[i];
    if (p.x < K.x || p.y < K.y || p.x > K.z || p.y > K.w) continue;
    vec2 c = R.xy + R.zw * 0.5, h = R.zw * 0.5;
    float r = min(S.x, min(h.x, h.y));
    float d = sdRound(p, c, h, r);

    // yere düşen yumuşak gölge + gölgede ışık toplayan pembe kostik
    if (O.y > 0.0 && d > 0.0) {
      float ds = sdRound(p - vec2(0.0, 18.0), c, h, r);
      float sh = (1.0 - smoothstep(-12.0, 46.0, ds)) * O.y;
      col = mix(col, col * vec3(0.78, 0.58, 0.76), sh * 0.55);
      float ca = exp(-pow((ds - 6.0) / 7.0, 2.0)) * O.y;
      col += vec3(1.0, 0.72, 0.86) * ca * 0.10;
    }
    if (d > 0.8) continue;

    float e = max(-d, 0.0);
    float B = S.y;
    float tt = clamp(e / B, 0.0, 1.0);
    // gradyan (dışa doğru)
    vec2 eps = vec2(0.75, 0.0);
    vec2 g = vec2(sdRound(p + eps.xy, c, h, r) - sdRound(p - eps.xy, c, h, r), sdRound(p + eps.yx, c, h, r) - sdRound(p - eps.yx, c, h, r));
    g = normalize(g + 1e-5);
    // çeyrek daire kenar profili → eğim
    float u = 1.0 - tt;
    float slope = clamp(u / sqrt(max(1.0 - u * u, 0.0004)), 0.0, 7.0);
    vec3 N = normalize(vec3(g * slope, 1.0));
    float thick = O.x;

    // Snell kırılması: RGB için farklı indis → kenarlarda prizma dağılması
    vec3 I = vec3(0.0, 0.0, -1.0);
    vec3 rr = refract(I, N, 1.0 / 1.46), rg = refract(I, N, 1.0 / 1.50), rb = refract(I, N, 1.0 / 1.545);
    float lens = thick * (0.6 + 0.4 * u);
    vec2 offR = rr.xy / max(-rr.z, 0.2) * lens, offG = rg.xy / max(-rg.z, 0.2) * lens, offB = rb.xy / max(-rb.z, 0.2) * lens;
    // iç yüzeyde hafif büyüteç (merkeze doğru)
    vec2 mag = (c - p) * 0.035 * (1.0 - tt * 0.5);
    vec2 base = p;
    if (M.z > 0.0) { vec2 k = M.zw / R.zw; base = M.xy + (p - R.xy) * k; offR *= k; offG *= k; offB *= k; mag = vec2(0.0); }
    float lod = S.z * smoothstep(0.0, 1.0, tt);
    vec3 refr = vec3(skyAt(base + offR + mag, lod).r, skyAt(base + offG + mag, lod).g, skyAt(base + offB + mag, lod).b);

    if (M.z > 0.0) { refr = mix(vec3(dot(refr, vec3(0.333))), refr, 1.3); refr = (refr - 0.5) * 1.14 + 0.47; }
    // süt beyazı okunurluk katmanı (kenarda berrak, içte buzlu)
    float milk = S.w * smoothstep(0.15, 1.0, tt);
    vec3 glass = mix(refr * vec3(1.02, 0.98, 1.03), vec3(1.0, 0.965, 0.985), milk);
    glass += vec3(0.04, 0.02, 0.05) * (1.0 - milk);

    // ışık: speküler (kenar profili üzerinde) + Fresnel + inci yanardönerlik
    vec3 Lv = normalize(vec3(uLight - p, 260.0));
    vec3 H = normalize(Lv + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(N, H), 0.0), 70.0) * (1.0 - N.z) * 4.0;
    float fres = pow(1.0 - N.z, 2.2);
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + e * 0.045 + dot(g, L2) * 0.35 + uTime * 0.03));
    glass += (vec3(1.0) * spec + mix(vec3(1.0), irid, O.w) * fres * 0.55) * O.z;
    // geniş yüzey parlaması (ışığa göre)
    float sheen = pow(max(0.0, 1.0 - length(p - uLight) / max(R.z, R.w) * 0.9), 2.0);
    glass += vec3(1.0, 0.97, 1.0) * sheen * 0.08 * O.z;
    // iç kostik çizgisi (kenar profili bittiği yerde) ve keskin dış kenar
    glass += vec3(1.0, 0.96, 1.0) * exp(-pow((e - B) / 1.1, 2.0)) * 0.22 * O.z;
    float side = dot(g, L2);
    glass = mix(glass, side > 0.0 ? vec3(1.0) : glass * vec3(0.72, 0.55, 0.70), exp(-pow(e / 0.9, 2.0)) * (0.55 + 0.35 * abs(side)));
    // kenar boyunca gezinen pırıltılar
    float ang = atan(p.y - c.y, p.x - c.x);
    float glint = pow(max(0.0, sin(ang * 3.0 - uTime * 0.45 + float(i))), 60.0) * exp(-e / 3.0);
    glass += vec3(1.0, 0.95, 1.0) * glint * 0.9 * O.z;
    // sayfa çevirme: cam sayfa boyunca kayan ışık bandı
    float tu = (p.x - R.x) / R.z;
    float tb = uTurn.z > 0.0 ? tu : 1.0 - tu;
    glass += vec3(1.0, 0.9, 0.98) * exp(-pow((tb - uTurn.x) / 0.07, 2.0)) * uTurn.y * step(B, e) * 0.35;

    float cov = smoothstep(0.8, -0.6, d);
    col = mix(col, glass, cov);
  }
  // çok hafif film greni (banding'i önler)
  col += (hash(p + fract(uTime)) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;
