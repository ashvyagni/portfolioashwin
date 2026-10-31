import * as THREE from 'three'

// The background layer: the void, the distant star, the black hole and the
// Renaissance construction geometry that space bends around.

const vertex = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragment = /* glsl */ `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uStar;     // distant star: 0 hidden, ~0.1 faint point, 1 full shine
uniform float uHole;     // black hole presence
uniform float uGeo;      // how much of the construction geometry has been drawn
uniform float uKaleido;  // kaleidoscope fold amount
uniform float uRot;      // fold / geometry rotation
uniform float uSettle;   // 1 once we have arrived at the landing page
uniform vec2 uMouse;     // pointer, in the same units as p0
uniform float uLantern;  // how much the pointer lights the construction
uniform float uFit;      // < 1 on portrait screens: the construction stands upright and shrinks to fit

#define PHI 1.6180339887
#define TAU 6.2831853072

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float stars(vec2 uv, float scale, float density) {
  vec2 g = uv * scale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash(id);
  float on = step(1.0 - density, h);
  vec2 o = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
  float size = 0.03 + 0.05 * hash(id + 1.3);
  float d = length(f - o * 0.7);
  float tw = 0.65 + 0.35 * sin(uTime * (0.6 + h * 1.8) + h * 50.0);
  return on * (1.0 - smoothstep(0.0, size, d)) * tw * (0.4 + 0.6 * hash(id + 9.1));
}

// Distance to the part of segment a→b drawn so far (reveal 0..1 from a).
float sdSeg(vec2 p, vec2 a, vec2 b, float reveal) {
  if (reveal <= 0.0) return 1e3;
  vec2 pa = p - a, ba = (b - a) * reveal;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Distance to an arc around c of radius r, starting at angle a0 and sweeping
// (signed) through sweep radians — like a compass that is still moving.
float sdArc(vec2 p, vec2 c, float r, float a0, float sweep) {
  if (abs(sweep) < 1e-4) return 1e3;
  vec2 v = p - c;
  float a = atan(v.y, v.x) - a0;
  float s = sign(sweep);
  a = mod(a * s, TAU);
  if (a <= abs(sweep)) return abs(length(v) - r);
  vec2 e0 = c + r * vec2(cos(a0), sin(a0));
  vec2 e1 = c + r * vec2(cos(a0 + sweep), sin(a0 + sweep));
  return min(length(p - e0), length(p - e1));
}

float hairline(float d, float w, float px) {
  return 1.0 - smoothstep(w, w + px * 1.25, d);
}

float stage(float prog, float start, float len) {
  return clamp((prog - start) / len, 0.0, 1.0);
}

// The construction, drawn as a draughtsman would: the golden rectangle ruled
// edge by edge, each square divided off and its quarter of the spiral swept
// in turn, compass circles at golden-ratio radii, the Vitruvian circle and
// square, then the radiating rays. prog runs 0..1 across the whole drawing.
vec3 geometry(vec2 p, float px, float prog) {
  float s = 0.62;
  float x0 = -s * PHI * 0.5;
  float y0 = -s * 0.5;
  float w = s * PHI;
  float h = s;

  // Frame: four edges, ruled one after another.
  float f = stage(prog, 0.0, 0.16) * 4.0;
  float frame = 1e3;
  frame = min(frame, sdSeg(p, vec2(x0, y0), vec2(x0 + w, y0), clamp(f, 0.0, 1.0)));
  frame = min(frame, sdSeg(p, vec2(x0 + w, y0), vec2(x0 + w, y0 + h), clamp(f - 1.0, 0.0, 1.0)));
  frame = min(frame, sdSeg(p, vec2(x0 + w, y0 + h), vec2(x0, y0 + h), clamp(f - 2.0, 0.0, 1.0)));
  frame = min(frame, sdSeg(p, vec2(x0, y0 + h), vec2(x0, y0), clamp(f - 3.0, 0.0, 1.0)));
  float lines = hairline(frame, px * 0.5, px);
  float arcs = 0.0;

  for (int i = 0; i < 10; i++) {
    float t = stage(prog, 0.12 + float(i) * 0.045, 0.09);
    float tl = clamp(t * 2.0, 0.0, 1.0);
    float ta = clamp(t * 2.0 - 0.6, 0.0, 1.0) / 0.4;
    int dir = i - (i / 4) * 4;
    float dl;
    float da;
    if (dir == 0) {
      dl = sdSeg(p, vec2(x0 + h, y0), vec2(x0 + h, y0 + h), tl);
      da = sdArc(p, vec2(x0 + h, y0), h, 3.14159, -1.5708 * min(ta, 1.0));
      x0 += h; w -= h;
    } else if (dir == 1) {
      dl = sdSeg(p, vec2(x0, y0 + h - w), vec2(x0 + w, y0 + h - w), tl);
      da = sdArc(p, vec2(x0, y0 + h - w), w, 1.5708, -1.5708 * min(ta, 1.0));
      h -= w;
    } else if (dir == 2) {
      dl = sdSeg(p, vec2(x0 + w - h, y0 + h), vec2(x0 + w - h, y0), tl);
      da = sdArc(p, vec2(x0 + w - h, y0 + h), h, 0.0, -1.5708 * min(ta, 1.0));
      w -= h;
    } else {
      dl = sdSeg(p, vec2(x0 + w, y0 + w), vec2(x0, y0 + w), tl);
      da = sdArc(p, vec2(x0 + w, y0 + w), w, -1.5708, -1.5708 * min(ta, 1.0));
      y0 += w; h -= w;
    }
    lines = max(lines, hairline(dl, px * 0.45, px));
    arcs = max(arcs, hairline(da, px * 0.7, px));
  }

  // Compass circles at golden-ratio radii, each swept from the top.
  float r = length(p);
  float circles = 0.0;
  float R0 = length(vec2(s * PHI, s)) * 0.5;
  for (int k = 0; k < 6; k++) {
    float Rk = R0 * pow(1.0 / PHI, float(k));
    float t = stage(prog, 0.3 + float(k) * 0.06, 0.16);
    circles = max(circles, hairline(sdArc(p, vec2(0.0), Rk, 1.5708, -TAU * t), px * 0.45, px));
  }

  // Vitruvian pair: a circle and the square that shares its base.
  float vR = R0 * 1.18;
  float tv = stage(prog, 0.55, 0.22);
  float vit = hairline(sdArc(p, vec2(0.0), vR, -1.5708, TAU * tv), px * 0.45, px);
  float sq = vR * 1.62;
  vec2 b0 = vec2(-sq * 0.5, -vR);
  float tq = stage(prog, 0.62, 0.2) * 4.0;
  float sqd = 1e3;
  sqd = min(sqd, sdSeg(p, b0, b0 + vec2(sq, 0.0), clamp(tq, 0.0, 1.0)));
  sqd = min(sqd, sdSeg(p, b0 + vec2(sq, 0.0), b0 + vec2(sq, sq), clamp(tq - 1.0, 0.0, 1.0)));
  sqd = min(sqd, sdSeg(p, b0 + vec2(sq, sq), b0 + vec2(0.0, sq), clamp(tq - 2.0, 0.0, 1.0)));
  sqd = min(sqd, sdSeg(p, b0 + vec2(0.0, sq), b0, clamp(tq - 3.0, 0.0, 1.0)));
  vit = max(vit, hairline(sqd, px * 0.45, px));

  float seg = TAU / 24.0;
  float a = atan(p.y, p.x);
  float dRay = abs(fract(a / seg + 0.5) - 0.5) * seg * r;
  float reach = stage(prog, 0.45, 0.55) * 1.5;
  float rays = hairline(dRay, px * 0.35, px) * (1.0 - smoothstep(reach - 0.25, reach, r)) * step(0.0001, reach);

  vec3 gold = vec3(0.79, 0.64, 0.33);
  vec3 bone = vec3(0.93, 0.89, 0.82);
  return gold * (lines * 0.7 + arcs) + bone * (circles * 0.32 + vit * 0.22) + gold * rays * 0.24;
}

// Everything that lives in bent space: stars and the construction, seen
// through the lens of the hole. r0 is the true screen radius of the pixel.
vec3 space(vec2 p, float r0, float glow) {
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);
  vec2 lp = p - dir * (0.02 * uHole) / max(r, 0.035);
  // Pixel footprint in bent space; capped so lines don't balloon near the hole.
  float px = min(length(fwidth(lp)) * 0.7, 3.0 / uRes.y) + 1e-5;

  vec3 col = vec3(0.0);
  float starAmt = max(uHole, uSettle * 0.5);
  float st = stars(lp, 70.0, 0.08) + stars(lp * 1.7 + 3.0, 120.0, 0.05) * 0.6;
  col += vec3(0.93, 0.89, 0.82) * st * starAmt;

  float rs = 0.085 * uHole;
  float nearHole = uHole > 0.001 ? smoothstep(rs * 1.3, rs * 5.0, r0) : 1.0;
  col += geometry(lp, px, uGeo) * (mix(1.0, 0.2, uSettle) + glow) * nearHole;
  return col;
}

void main() {
  vec2 p0 = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float r0 = length(p0);
  float upright = uFit < 1.0 ? 1.5708 : 0.0;
  float a0 = atan(p0.y, p0.x) + uRot + upright + sin(uTime * 0.11) * 0.012 * uSettle;
  float rFit = r0 / uFit;

  // The lantern: the construction brightens where the pointer passes.
  vec2 m = p0 - uMouse;
  float glow = exp(-dot(m, m) / 0.022) * 0.85 * uLantern;
  vec2 pTurn = rFit * vec2(cos(a0), sin(a0));

  // Kaleidoscope: fold the plane into ten mirrored wedges and look through
  // them at the eye of the spiral, where the golden squares nest densest.
  // The drawing and the mandala are rendered separately and crossfaded.
  vec3 col;
  float k = smoothstep(0.0, 1.0, uKaleido);
  if (k < 0.001) {
    col = space(pTurn, r0, glow);
  } else {
    float seg = TAU / 10.0;
    float af = abs(mod(a0, seg) - seg * 0.5);
    vec2 pFold = rFit * vec2(cos(af), sin(af)) * 0.42 + vec2(0.155, -0.112);
    vec3 mandala = space(pFold, r0, glow);
    col = k > 0.999 ? mandala : mix(space(pTurn, r0, glow), mandala, k);
  }

  float rs = 0.085 * uHole;
  if (uHole > 0.001) {
    col *= smoothstep(rs * 0.97, rs * 1.03, r0);
    float ring = exp(-pow((r0 - rs * 1.15) / 0.006, 2.0));
    float halo = exp(-pow((r0 - rs * 1.15) / 0.03, 2.0)) * 0.25;
    col += vec3(1.0, 0.58, 0.24) * (ring * 0.9 + halo) * uHole;
  }

  // The distant star, outside the bent space.
  vec2 sp = p0 - vec2(0.0, 0.16);
  float sd = length(sp);
  float core = exp(-sd * sd / (0.00003 + 0.0005 * uStar * uStar));
  float spikes = exp(-abs(sp.y) * 900.0) * exp(-abs(sp.x) * (30.0 - 22.0 * uStar))
               + exp(-abs(sp.x) * 900.0) * exp(-abs(sp.y) * (30.0 - 22.0 * uStar));
  float bloom = exp(-sd * (18.0 - 10.0 * uStar)) * 0.25;
  col += vec3(1.0, 0.94, 0.86) * (core + (spikes + bloom) * uStar) * uStar;

  gl_FragColor = vec4(col, 1.0);
}
`

export function createCosmos() {
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uStar: { value: 0 },
    uHole: { value: 0 },
    uGeo: { value: 0 },
    uKaleido: { value: 0 },
    uRot: { value: 0 },
    uSettle: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uLantern: { value: 0 },
    uFit: { value: 1 },
  }
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -2
  return { mesh, uniforms }
}
