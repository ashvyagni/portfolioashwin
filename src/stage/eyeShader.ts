// The eyes, drawn per pixel the way an illustrator inks them — then lit, and
// set glowing in the void. This is the "source" image: it is rendered
// off-screen and then shown as fine halftone dots (and, under the cursor's
// veil, as it is). uFrame is the cutscene's lens: it cuts from an extreme
// close-up of one eye to both.
//
// The drawing follows the user's references: a bold, tapered lash line that
// flicks into a wing at the outer corner with clumped lash spikes, a crease
// line, a broken lower lid line with a few lower lashes, a brush-stroke brow,
// hatching for form, and an iris with an ink rim, lid shadow, fibres, crypts
// and ember light. Expression comes from pose uniforms, tweened between
// keyframes on the CPU (shut, drowsy, open, menacing) like a sprite sheet.
//
// Local space per eye: x runs inner corner (-1) to outer corner (+1), y up,
// one unit = half the eye's width. Both eyes are mirrored into this space, so
// anything that must agree on screen (light, gaze, highlights) is flipped back
// with side.

export const eyeSourceFragment = /* glsl */ `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uEyeSep;
uniform float uEyeY;
uniform float uEyeSize;
uniform vec2 uLook;
uniform float uSkin;     // how much of the face the light finds

// Pose (tweened between keyframes on the CPU).
uniform float uOpen;     // 0 shut … 1 open
uniform float uLidH;     // upper lid height when open
uniform float uLidFlat;  // flatter = heavier, harder upper lid
uniform float uSlant;    // > 0 drops the inner end of the upper lid (anger)
uniform float uLowH;     // lower lid depth
uniform float uBrowY;
uniform float uBrowTilt; // > 0 pulls the inner end of the brow down
uniform float uBrowArch;
uniform float uCrease;
uniform float uPupil;
uniform float uMenace;   // 0..1, drives the small things anger changes
uniform vec3 uFrame;     // the lens: xy where it looks (scene units), z zoom

#define PI 3.14159265

const vec3 KEY = vec3(-0.48, 0.5, 0.72);
const vec3 INK = vec3(0.93, 0.87, 0.79);
const vec3 EMBER = vec3(1.0, 0.45, 0.14);

float hash2(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
             mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x),
                 mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x),
                 mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.07 + 13.1;
    a *= 0.5;
  }
  return v;
}

// A stroke of half-width w around distance d, with a brush's uneven edge.
float ink(float d, float w, float aa) {
  return 1.0 - smoothstep(w - aa, w + aa, d);
}

// ---------------------------------------------------------------- lids

float lidArc(float x, float k, float squash) {
  float t = clamp((x + 1.0) * 0.5, 0.0, 1.0);
  return pow(max(sin(PI * pow(t, k)), 0.0), squash);
}
float canthi(float x) { return mix(-0.03, 0.08, clamp((x + 1.0) * 0.5, 0.0, 1.0)); }
float upperOpen(float x) { return canthi(x) + uLidH * lidArc(x, 0.868, uLidFlat) * (1.0 + uSlant * x); }
float lowerOpen(float x) { return canthi(x) - uLowH * lidArc(x, 1.275, 1.05); }
float shutLine(float x) { return canthi(x) - 0.17 * lidArc(x, 1.275, 1.05); }
float upperLid(float x) { return mix(shutLine(x), upperOpen(x), uOpen); }
float lowerLid(float x) { return mix(shutLine(x) - 0.012, lowerOpen(x), uOpen); }

// Perpendicular distance to the graph y = f(x), from its value and slope.
float graphDist(float y, float f, float slope) {
  return abs(y - f) / sqrt(1.0 + slope * slope);
}

// ---------------------------------------------------------------- iris

vec3 iris(vec2 irl, float R, float side, float lit, vec2 lightDir, out float mask) {
  float rr = length(irl) / R;
  float ang = atan(irl.y, irl.x);
  vec2 cs = vec2(cos(ang), sin(ang));
  float pr = uPupil + 0.01 * sin(uTime * 1.3) + 0.005 * sin(uTime * 3.1);
  float t = clamp((rr - pr) / (1.0 - pr), 0.0, 1.0);

  float wob = (noise3(vec3(cs * 2.0, rr * 4.0 + side * 7.0)) - 0.5) * 0.16;
  vec2 cw = vec2(cos(ang + wob), sin(ang + wob));
  float fibre = noise3(vec3(cw * 34.0, rr * 2.6 + side * 3.0)) * 0.6
              + noise3(vec3(cw * 92.0, rr * 6.0 + side * 11.0)) * 0.4;

  float rc = pr + 0.19 + 0.06 * (noise3(vec3(cs * 3.0, side + 2.0)) - 0.5);
  float collar = exp(-pow((rr - rc) / 0.022, 2.0));
  float crypt = smoothstep(0.72, 0.8, noise3(vec3(cs * 11.0, rr * 9.0 + side * 5.0)))
              * smoothstep(rc, rc + 0.05, rr) * (1.0 - smoothstep(0.78, 0.9, rr));
  float freckle = smoothstep(0.8, 0.86, noise3(vec3(irl / R * 16.0, side * 13.0))) * step(pr + 0.06, rr);

  vec3 col = mix(vec3(1.0, 0.8, 0.4), vec3(0.95, 0.48, 0.13), smoothstep(0.0, 0.45, t));
  col = mix(col, vec3(0.58, 0.2, 0.06), smoothstep(0.45, 0.9, t));
  col *= 0.3 + 1.05 * fibre;
  float streak = smoothstep(0.55, 0.85, noise3(vec3(cw * 60.0, rr * 1.2 + side)));
  col *= 1.0 - 0.45 * streak * smoothstep(pr + 0.04, pr + 0.15, rr);
  col += vec3(1.0, 0.82, 0.5) * collar * 0.25;
  col = mix(col, vec3(0.12, 0.04, 0.012), crypt * 0.75);
  col = mix(col, vec3(0.25, 0.09, 0.03), freckle * 0.6);

  // Manga cue: a few fine radial ink lines through the iris.
  float rays = smoothstep(0.86, 0.97, noise3(vec3(cs * 26.0, side * 2.0))) * smoothstep(pr + 0.05, pr + 0.2, rr) * (1.0 - smoothstep(0.75, 0.9, rr));
  col *= 1.0 - rays * 0.5;

  float caustic = smoothstep(0.1, 0.9, dot(cs, -lightDir)) * smoothstep(0.35, 0.92, rr);
  col *= lit * (0.72 + 0.6 * caustic);

  // Ink rim around the iris, and the pupil with its ruff.
  col *= 1.0 - smoothstep(0.84, 0.96, rr) * 0.95;
  float ruff = pr + 0.03 * noise3(vec3(cs * 13.0, side * 4.0));
  col = mix(col, vec3(0.08, 0.025, 0.01) * lit, 1.0 - smoothstep(ruff, ruff + 0.035, rr));
  float pupil = 1.0 - smoothstep(pr - 0.012, pr + 0.005, rr);
  col = mix(col, vec3(0.0), pupil);

  // Embers: hollows and deep fibres glowing from within.
  float breath = 0.7 + 0.3 * noise3(vec3(cs * 2.0, uTime * 0.22 + rr * 2.0));
  col += EMBER * (crypt * 1.1 + pow(fibre, 3.0) * 0.45 + collar * 0.15) * breath
       * (1.0 - pupil) * smoothstep(pr, pr + 0.08, rr) * (0.6 + 0.5 * uMenace);

  mask = 1.0 - smoothstep(0.985, 1.012, rr);
  return col;
}

// ---------------------------------------------------------------- one eye

vec3 eye(vec2 q, float side) {
  float tilt = 0.06;
  q = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * q;
  float x = q.x;
  float y = q.y;
  if (x < -1.4 || x > 1.8 || y > 1.4 || y < -0.9) return vec3(0.0);

  float px = 1.5 / (uRes.y * uEyeSize);
  float e = 0.004;
  float U = upperLid(x);
  float L = lowerLid(x);
  float Us = (upperLid(x + e) - upperLid(x - e)) / (2.0 * e);
  float Ls = (lowerLid(x + e) - lowerLid(x - e)) / (2.0 * e);
  float fissure = smoothstep(-px, px, U - y) * smoothstep(-px, px, y - L);
  vec3 key = normalize(KEY * vec3(side, 1.0, 1.0));
  vec2 lightDir = normalize(key.xy);

  // Where the light finds the face; beyond it, void.
  float reach = exp(-(pow(x * 0.7, 2.0) + pow((y + 0.02) * 1.15, 2.0)) * 2.2);
  float brush = noise(q * 26.0);
  vec3 col = vec3(0.0);

  // ---- skin around the eye: a faint warm presence, carved with hatching
  float lidSkin = smoothstep(U, U + 0.05, y) * (1.0 - smoothstep(U + uCrease, U + uCrease + 0.12, y));
  float underSkin = (1.0 - smoothstep(L - 0.32, L - 0.02, y)) * smoothstep(L - 0.42, L - 0.3, y);
  float skin = (lidSkin * 0.09 + underSkin * 0.05 + 0.02) * reach * uSkin;
  float hatchA = 1.0 - smoothstep(0.08, 0.2, abs(fract(dot(q, vec2(0.71, 0.71)) * 58.0) - 0.5));
  float hatchB = 1.0 - smoothstep(0.08, 0.2, abs(fract(dot(q, vec2(-0.6, 0.8)) * 70.0) - 0.5));
  float browShadow = exp(-pow((y - (uBrowY - 0.16)) / 0.12, 2.0)) * (1.0 - smoothstep(0.5, 1.15, abs(x - 0.05)));
  float bag = exp(-pow((y - (L - 0.22)) / 0.06, 2.0)) * (1.0 - smoothstep(0.2, 0.85, abs(x - 0.1)));
  col += INK * skin * (0.6 + 0.4 * brush);
  col += INK * (hatchA * browShadow * 0.11 + hatchB * bag * 0.08) * reach * uSkin * (0.5 + 0.5 * brush);

  // ---- inside the eye
  if (fissure > 0.001) {
    vec2 cb = vec2(0.02, -0.05);
    float Rb = 1.32;
    vec2 db = q - cb;
    float z = sqrt(max(Rb * Rb - dot(db, db), 0.0));
    vec3 N = normalize(vec3(db, z));

    vec3 g = normalize(vec3(uLook.x * side, uLook.y, 1.0));
    vec2 c = cb + g.xy * Rb * 0.55;
    float Ri = 0.47;
    vec2 ir = q - c;
    vec2 gd = length(g.xy) > 1e-4 ? normalize(g.xy) : vec2(1.0, 0.0);
    float along = dot(ir, gd);
    vec2 irl = ir - gd * along + gd * along / max(g.z, 0.4);

    // The lid's shadow over the top of the eye (the classic drawn band).
    float lit = mix(0.14, 1.0, smoothstep(0.02, 0.26, U - y));
    lit *= mix(0.65, 1.0, smoothstep(0.0, 0.07, y - L));
    lit *= mix(0.55, 1.0, 1.0 - smoothstep(0.55, 1.0, abs(x)));

    // Sclera: warm, lit from within by the iris, veined at the corners.
    vec3 sclera = vec3(0.46, 0.35, 0.28);
    sclera += EMBER * exp(-max(length(irl) - Ri, 0.0) * 5.0) * 0.18;
    vec2 vr = q - c;
    float va = atan(vr.y, vr.x);
    float vein = 1.0 - abs(fbm(vec2(va * 3.0 + side * 9.0, log(length(vr) + 0.01) * 4.0)) * 2.0 - 1.0);
    vein = pow(clamp(vein, 0.0, 1.0), 14.0) * smoothstep(0.45, 0.95, abs(x)) * smoothstep(Ri, Ri + 0.15, length(vr));
    sclera = mix(sclera, vec3(0.62, 0.15, 0.12), vein * 0.7);
    float ndl = max(dot(N, key) * 0.55 + 0.45, 0.0);
    vec3 ball = sclera * ndl * lit;
    // Hatching in the lid's shadow band, as drawn.
    ball *= 1.0 - hatchA * (1.0 - smoothstep(0.02, 0.2, U - y)) * 0.35;

    float mask;
    vec3 iCol = iris(irl, Ri, side, lit, lightDir, mask);
    ball = mix(ball, iCol, mask);

    // Inner corner: the caruncle.
    vec2 cq = q - vec2(-0.91, -0.02);
    float caruncle = exp(-dot(cq * vec2(1.0, 1.6), cq * vec2(1.0, 1.6)) / 0.0035);
    ball = mix(ball, vec3(0.6, 0.3, 0.27) * (0.5 + 0.5 * lit), caruncle * 0.85);

    // Highlights: a big drawn catchlight, a small counter-light, the star.
    vec2 h = q - c - vec2(-0.15 * side, 0.12);
    vec2 hb = mat2(0.95, 0.31 * side, -0.31 * side, 0.95) * h;
    float catchlight = 1.0 - smoothstep(-0.006, 0.008, length(hb / vec2(0.075, 0.05)) - 1.0) * 1.0;
    ball = mix(ball, vec3(1.0, 0.97, 0.92), clamp(catchlight, 0.0, 1.0) * mask * 0.95);
    float small = 1.0 - smoothstep(0.014, 0.02, length(q - c - vec2(0.15 * side, -0.13)));
    ball = mix(ball, vec3(1.0, 0.95, 0.88), small * mask * 0.85);
    vec2 gq = q - c - vec2(0.05 * side, 0.22);
    float glint = exp(-length(gq) * 180.0)
                + (exp(-abs(gq.y) * 1100.0) * exp(-abs(gq.x) * 70.0) + exp(-abs(gq.x) * 1100.0) * exp(-abs(gq.y) * 70.0)) * 0.6;
    ball += vec3(1.0, 0.97, 0.92) * glint * mask;

    col = mix(col, ball, fissure);
  }

  // ---- the lash line: thin at the nose, heavy across the top, flicking out
  float wLine = (mix(0.004, 0.02, smoothstep(-1.0, 0.1, x)) + 0.018 * smoothstep(0.15, 0.85, x)) * (1.0 - smoothstep(0.98, 1.05, x));
  wLine *= 0.85 + 0.3 * brush;
  wLine *= mix(0.7, 1.0, uOpen);
  float lashLine = ink(graphDist(y, U + wLine * 0.6, Us), wLine, px) * smoothstep(-1.02, -0.92, x);

  // Wing: past the outer corner the line keeps going, up and out, tapering.
  float wx = x - 0.98;
  float wingY = upperLid(0.98) + 0.28 * wx + 0.9 * wx * wx * (0.4 + 0.6 * uOpen);
  float wingW = 0.03 * (1.0 - smoothstep(0.0, 0.26, wx));
  float wing = ink(graphDist(y, wingY, 0.28 + 1.8 * wx), wingW, px) * step(0.0, wx) * step(wx, 0.27);

  // Lash spikes: clumps off the outer two-thirds, curling up and out.
  float spikes = 0.0;
  float up = smoothstep(0.1, 0.55, uOpen);
  for (int i = 0; i < 12; i++) {
    float fi = float(i) / 11.0;
    float sx = mix(-0.1, 1.06, pow(fi, 0.8)) + (hash2(vec2(fi, side)) - 0.5) * 0.05;
    vec2 o = vec2(sx, upperLid(min(sx, 1.0)) + 0.025);
    float ang = mix(1.35, 0.3, fi) * mix(-0.6, 1.0, up);
    vec2 d = vec2(cos(ang), sin(ang));
    vec2 rel = q - o;
    float u = dot(rel, d);
    float v = dot(rel, vec2(-d.y, d.x));
    float len = mix(0.08, 0.2, fi) * (0.75 + 0.5 * hash2(vec2(fi + 4.0, side))) * mix(0.8, 1.0, up);
    float curve = 1.2 * u * u / len;
    float w = 0.017 * (1.0 - clamp(u / len, 0.0, 1.0));
    spikes = max(spikes, ink(abs(v + curve), w, px) * step(0.0, u) * step(u, len));
  }

  // Crease: a thin line above the lid, broken at both ends.
  float creaseY = upperOpen(x) + uCrease + 0.05 * (1.0 - uOpen);
  float creaseSpan = smoothstep(-0.65, -0.35, x) * (1.0 - smoothstep(0.7, 0.98, x));
  float crease = ink(graphDist(y, creaseY, Us), 0.006 * creaseSpan, px) * creaseSpan * (0.5 + 0.5 * uOpen);

  // Lower lid: a fine broken line along the outer part, with a few lashes.
  float lowSpan = smoothstep(-0.3, 0.0, x) * (1.0 - smoothstep(0.9, 1.0, x));
  float lowBreak = step(0.32, noise(vec2(x * 7.0, side * 3.0)));
  float lowLine = ink(graphDist(y, L - 0.012, Ls), 0.007 * lowSpan, px) * lowSpan * lowBreak * uOpen;
  float lowLashes = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float sx = mix(0.35, 0.92, fi / 4.0);
    vec2 o = vec2(sx, lowerLid(sx) - 0.015);
    vec2 d = normalize(vec2(0.45 + 0.4 * fi / 4.0, -1.0));
    vec2 rel = q - o;
    float u = dot(rel, d);
    float v = dot(rel, vec2(-d.y, d.x));
    float len = 0.04 + 0.02 * fi / 4.0;
    lowLashes = max(lowLashes, ink(abs(v), 0.006 * (1.0 - clamp(u / len, 0.0, 1.0)), px) * step(0.0, u) * step(u, len));
  }
  lowLashes *= uOpen;

  // Tear duct hook at the inner corner.
  vec2 tq = q - vec2(-1.0, -0.05);
  float duct = ink(abs(length(tq * vec2(1.0, 1.4)) - 0.05), 0.006, px) * step(tq.x, 0.0) * uOpen;

  // ---- the brow: a brush stroke, heavy at the head, tapering to the tail
  float bx = clamp((x + 0.95) / 2.0, 0.0, 1.0);
  float arch = sin(PI * pow(bx, 0.75));
  float browY = uBrowY + uBrowArch * 2.2 * arch + uBrowTilt * x * 0.45 - 0.06 * bx * bx;
  float browSlope = (browY - (uBrowY + uBrowArch * 2.2 * sin(PI * pow(max(bx - 0.01, 0.0), 0.75)) + uBrowTilt * (x - 0.02) * 0.45 - 0.06 * (bx - 0.01) * (bx - 0.01))) / 0.02;
  float head = smoothstep(0.0, 0.08, bx);
  float browW = mix(0.045, 0.006, pow(bx, 1.4)) * head * (0.85 + 0.3 * brush);
  float across = (y - browY) / max(browW, 0.001);
  float hair = 0.72 + 0.28 * smoothstep(0.3, 0.7, noise(vec2(x * 40.0 - across * 1.5, across * 3.0 + x * 9.0)));
  float brow = ink(graphDist(y, browY, browSlope), browW, px) * step(-0.95, x) * step(x, 1.05) * hair;
  vec2 gl = q - vec2(-1.18, 0.62);
  float frown = (ink(abs(gl.x + 0.02 * gl.y), 0.006, px) + ink(abs(gl.x + 0.07 - 0.04 * gl.y), 0.005, px))
              * (1.0 - smoothstep(0.05, 0.15, abs(gl.y))) * uMenace * 0.3;
  brow = max(brow, frown);

  float lines = max(max(max(lashLine, wing), max(spikes, crease)), max(max(lowLine, lowLashes), duct));
  vec3 lineCol = mix(INK, vec3(1.0, 0.7, 0.45), 0.25 + 0.25 * uMenace);
  col = mix(col, lineCol * (0.85 + 0.15 * brush), lines);
  col = mix(col, INK * (0.55 + 0.25 * brush) * mix(0.6, 1.0, uSkin), brow * 0.95);
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  p = p / uFrame.z + uFrame.xy;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1.0 : 1.0;
    vec2 q = (p - vec2(side * uEyeSep, uEyeY)) / uEyeSize;
    q.x *= side;
    col += eye(q, side);
  }
  gl_FragColor = vec4(col, 1.0);
}
`
