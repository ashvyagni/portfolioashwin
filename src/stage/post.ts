import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

// Bloom so light behaves like light (iris, star, photon ring), then a finish
// pass: faint lens fringing towards the edges, vignette, and film grain that
// lives in the light rather than in the void — black stays black.
//
// Colours are authored display-referred, so there is no output colour
// conversion at the end.

const finish = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uZoom: { value: 0 },
    uFlash: { value: 0 },
    uEncode: { value: 0 },
    uPaper: { value: 0 },
    uInvert: { value: 0 },
    uShake: { value: new THREE.Vector2() },
    uBars: { value: 0 },
    uDim: { value: 0 },
    uSketch: { value: 0 },
    uDraw: { value: 1 },
    uColour: { value: 0 },
    uSeed: { value: new THREE.Vector3(0.5, 0.5, 0) },
    uSeed2: { value: new THREE.Vector3(0.5, 0.5, 0) },
    uDespair: { value: 0 },
    uEnlight: { value: 0 },
    uBlood: { value: 0 },
    uBurst: { value: 0 },
    uEye: { value: 0 },
    uEyeAt: { value: new THREE.Vector3(0.5, 0.5, 0.2) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uZoom;     // radial zoom blur: the feeling of speed
    uniform float uFlash;    // a white-out, to hide a cut
    uniform float uEncode;   // 1 when the scene is lit physically (linear light) and needs gamma
    uniform float uPaper;    // how much the image should read as printed on old paper
    uniform float uInvert;   // an anime impact frame: the image inverted into red and black
    uniform vec2 uShake;     // the camera shaken, in uv
    uniform float uBars;     // letterbox bars, as a fraction of the height each
    uniform float uDim;      // the world dimmed behind the story
    // The sketch world (the act): the render read as a drawing on paper, the
    // paint laid into it where and as far as the story has got.
    uniform float uSketch;   // 1 in the act
    uniform float uDraw;     // how much of the drawing exists yet: pencil first, then ink, then hatching
    uniform float uColour;   // paint across the whole frame (0 … 1)
    uniform vec3 uSeed;      // paint spreading from a point (uv xy, radius z in heights)
    uniform vec3 uSeed2;     // … and a second
    uniform float uDespair;  // the palette drained to bruise and slate, the ink heavy
    uniform float uEnlight;  // the palette lifted to gold and light
    uniform float uBlood;    // red stains seeping in and fading: hard thoughts
    uniform float uBurst;    // an impact frame: the drawing struck into red and black
    uniform float uEye;      // the eye, in the water (0 … 1: drawn, open, gone)
    uniform vec3 uEyeAt;     // where (uv) and how big (z, in heights)
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    float lumAt(vec2 p) {
      vec3 c = texture2D(tDiffuse, p).rgb;
      c = mix(c, pow(max(c, 0.0), vec3(1.0 / 2.2)), uEncode);
      return dot(c, vec3(0.3, 0.59, 0.11));
    }


    float fbm(vec2 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
      return s;
    }

    // Sobel on luminance at a given reach (in pixels), with the boil applied.
    float edgeAt(vec2 p, float reach) {
      vec2 px = reach / uRes;
      float tl = lumAt(p + px * vec2(-1.0, 1.0)), tm = lumAt(p + px * vec2(0.0, 1.0)), tr = lumAt(p + px * vec2(1.0, 1.0));
      float ml = lumAt(p + px * vec2(-1.0, 0.0)), mr = lumAt(p + px * vec2(1.0, 0.0));
      float bl = lumAt(p + px * vec2(-1.0, -1.0)), bm = lumAt(p + px * vec2(0.0, -1.0)), br = lumAt(p + px * vec2(1.0, -1.0));
      float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
      float gy = (tl + 2.0 * tm + tr) - (bl + 2.0 * bm + br);
      float e = smoothstep(0.08, 0.32, length(vec2(gx, gy)));
      // Specular glints stay bare paper, as an illustrator leaves them; ringed
      // in ink they read as drawn eyes.
      float peak = max(max(max(tl, tm), max(tr, ml)), max(max(mr, bl), max(bm, br)));
      return e * (1.0 - smoothstep(0.8, 0.95, peak));
    }

    // A wash of paint spreading from a point, its edge ragged like wet paper.
    float washFrom(vec2 uv, vec3 seed, float aspect) {
      if (seed.z <= 0.0) return 0.0;
      vec2 d = (uv - seed.xy) * vec2(aspect, 1.0);
      float ragged = (fbm(uv * vec2(6.0 * aspect, 6.0) + seed.xy * 3.0) - 0.5) * 0.55 * seed.z + (noise(uv * 60.0) - 0.5) * 0.03;
      return 1.0 - smoothstep(seed.z - 0.06, seed.z, length(d) + ragged);
    }

    // Red stains for the hard thoughts: each one seeps in, spreads, darkens
    // at its tide-line, runs, and fades — and another comes somewhere else.
    vec4 blood(vec2 uv, float aspect) {
      float amount = 0.0;
      float rim = 0.0;
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float cycle = uTime / 3.4 + fi * 0.37;
        float n = floor(cycle);
        float life = fract(cycle);
        vec2 at = vec2(hash(vec2(n, fi * 7.1)), hash(vec2(fi * 3.3, n + 1.7)));
        at = 0.12 + at * 0.76;
        float grow = smoothstep(0.0, 0.45, life);
        float fade = 1.0 - smoothstep(0.62, 1.0, life);
        float size = (0.025 + 0.06 * hash(vec2(n + 4.0, fi))) * (0.35 + 0.65 * grow);
        vec2 d = (uv - at) * vec2(aspect, 1.0);
        // It runs: a drip down from it, as paint on an upright page.
        float drip = smoothstep(0.006, 0.0, abs(d.x + (noise(vec2(uv.y * 30.0, fi)) - 0.5) * 0.01)) * step(d.y, 0.0) * smoothstep(-size * 4.0 * grow, 0.0, d.y);
        float r = length(d) + (fbm(d * 9.0 + fi * 13.0 + n) - 0.5) * size * 0.9;
        float stain = 1.0 - smoothstep(size * 0.85, size, r);
        // Spatter around it.
        float spat = step(0.97, hash(floor(uv * uRes / 3.0) + n)) * (1.0 - smoothstep(size, size * 2.6, length(d)));
        float k = max(max(stain, drip * 0.85), spat) * fade;
        amount = max(amount, k);
        rim = max(rim, smoothstep(size * 0.6, size * 0.95, r) * stain * fade);
      }
      return vec4(amount * uBlood, rim * uBlood, 0.0, 0.0);
    }

    // The eye in the water: an anime eye drawn in ink, its iris red, rippled
    // by the rings the drop sent out — seen for a moment, then gone.
    vec4 eyeInWater(vec2 uv, float aspect) {
      vec2 p = (uv - uEyeAt.xy) * vec2(aspect, 1.0) / uEyeAt.z;
      float r = length(p);
      p += p / max(r, 1e-3) * sin(r * 16.0 - uTime * 5.0) * 0.025;
      p.y *= 1.12;
      // Opens, holds, closes: uEye 0 → 0.3 drawn shut, 0.3 → 0.5 opening, → 1 dissolving.
      float open = smoothstep(0.25, 0.48, uEye) * (1.0 - smoothstep(0.78, 0.92, uEye));
      float x = clamp(p.x, -1.0, 1.0);
      // Shut, the lid is a soft curve bowed downwards; it lifts into the almond.
      float up = mix(-0.1 * pow(1.0 - x * x, 0.8), 0.46 * pow(1.0 - x * x, 0.75), open) - 0.02;
      float lo = mix(-0.11 * pow(1.0 - x * x, 0.8), -0.3 * pow(1.0 - x * x, 0.9), open) - 0.02;
      float inside = step(abs(p.x), 1.0) * smoothstep(lo - 0.01, lo + 0.01, p.y) * (1.0 - smoothstep(up - 0.01, up + 0.01, p.y));
      float w = 0.022 + 0.04 * smoothstep(-0.6, 1.0, p.x);
      w = mix(0.01, w, open);
      // While shut it is drawn in, a single pen stroke left to right.
      float pen = step(p.x, mix(-1.1, 1.1, smoothstep(0.0, 0.22, uEye)));
      float upperLine = (1.0 - smoothstep(w * 0.5, w, abs(p.y - up))) * step(abs(p.x), 1.08) * pen;
      float lowerLine = (1.0 - smoothstep(0.008, 0.018, abs(p.y - lo))) * step(abs(p.x), 0.92) * 0.8;
      // Lashes off the outer corner.
      float lash = 0.0;
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec2 base = vec2(0.55 + fi * 0.15, 0.46 * pow(max(1.0 - pow(0.55 + fi * 0.15, 2.0), 0.0), 0.75) * open);
        vec2 dir = normalize(vec2(0.6 + fi * 0.25, 0.8));
        vec2 q = p - base;
        float along = dot(q, dir);
        lash = max(lash, (1.0 - smoothstep(0.006, 0.016, abs(dot(q, vec2(-dir.y, dir.x))))) * step(0.0, along) * step(along, 0.1 + fi * 0.03) * open);
      }
      vec2 ic = p - vec2(0.02, 0.02);
      float ir = length(ic);
      float iris = 1.0 - smoothstep(0.32, 0.335, ir);
      float ring = (1.0 - smoothstep(0.0, 0.02, abs(ir - 0.325)));
      float pupil = 1.0 - smoothstep(0.11, 0.125, ir);
      float striae = 0.5 + 0.5 * sin(atan(ic.y, ic.x) * 26.0 + noise(ic * 30.0) * 3.0);
      float shade = smoothstep(up - 0.25, up, p.y);
      float glint = (1.0 - smoothstep(0.035, 0.05, length(p - vec2(-0.1, 0.13)))) + (1.0 - smoothstep(0.015, 0.025, length(p - vec2(0.12, -0.1))));
      // How much shows: drawn in from the lid line, then everything ebbing at the end.
      float shown = smoothstep(0.0, 0.25, uEye) * (1.0 - smoothstep(0.85, 1.0, uEye));
      float fadeOut = 1.0 - smoothstep(0.9, 1.6, r);
      float ink = max(max(upperLine, lowerLine), lash) + ring * iris * inside * open + pupil * inside * open;
      float red = iris * inside * open * (0.55 + 0.45 * striae) * (1.0 - 0.6 * shade);
      return vec4(clamp(ink, 0.0, 1.0), red, glint * inside * open, shown * fadeOut);
    }

    vec3 sketch(vec2 uv, vec3 col) {
      float aspect = uRes.x / uRes.y;
      vec2 fc = gl_FragCoord.xy;
      // The line boils, on twos, like a hand-drawn cel redrawn each frame.
      float step8 = floor(uTime * 8.0);
      vec2 boil = (vec2(noise(uv * 7.0 + step8 * 3.1), noise(uv * 7.0 + 31.0 + step8 * 1.7)) - 0.5) * (1.4 + 1.4 * uDespair) / uRes;
      float lineFine = edgeAt(uv + boil, 1.0);
      float lineBold = edgeAt(uv + boil * 1.6, 2.2);
      // A second, lighter pencil pass a hair off the first: the sketch under the ink.
      float pencil = edgeAt(uv + vec2(1.6, -1.1) / uRes + boil * 2.0, 1.4);
      float lum = dot(col, vec3(0.3, 0.59, 0.11));
      float darkness = 1.0 - smoothstep(0.04, 0.45, lum);

      // Strokes arrive in the order an artist lays them: construction pencil,
      // the ink line over it, then the hatching.
      float order = fbm(uv * vec2(2.5 * aspect, 2.5)) * 0.75 + (1.0 - uv.y) * 0.15 + hash(floor(fc / 6.0)) * 0.1;
      float pencilOn = smoothstep(order * 0.55, order * 0.55 + 0.08, uDraw);
      float inkOn = smoothstep(0.3 + order * 0.6, 0.38 + order * 0.6, uDraw);
      float hatchOn = smoothstep(0.75, 1.0, uDraw);

      vec2 hc = fc + (vec2(noise(fc * 0.03), noise(fc * 0.03 + 7.0)) - 0.5) * 4.0;
      float s1 = abs(fract((hc.x + hc.y) / 7.0) - 0.5) * 2.0;
      float s2 = abs(fract((hc.x - hc.y) / 8.0) - 0.5) * 2.0;
      float s3 = abs(fract(hc.y / 5.0) - 0.5) * 2.0;
      float heavy = 1.0 + 0.6 * uDespair;
      float hatch = (1.0 - smoothstep(0.0, 0.12 + darkness * 0.5, s1)) * smoothstep(0.3, 0.65, darkness * heavy)
                  + (1.0 - smoothstep(0.0, 0.1 + darkness * 0.35, s2)) * smoothstep(0.6, 0.9, darkness * heavy)
                  + (1.0 - smoothstep(0.0, 0.2, s3)) * smoothstep(0.8, 1.0, darkness * heavy) * uDespair;

      // The page: warm laid paper; in despair it cools to slate.
      float fibre = noise(fc * vec2(0.9, 0.12)) * 0.5 + noise(fc * 0.35) * 0.3 + noise(fc * 0.04) * 0.2;
      vec3 paper = mix(vec3(0.95, 0.91, 0.83), vec3(0.78, 0.79, 0.81), uDespair * 0.85);
      paper = mix(paper, vec3(1.0, 0.95, 0.84), uEnlight * 0.6);
      paper *= 0.93 + 0.08 * fibre;
      vec3 inkCol = mix(vec3(0.13, 0.08, 0.06), vec3(0.05, 0.05, 0.08), uDespair);
      inkCol = mix(inkCol, vec3(0.3, 0.17, 0.08), uEnlight * 0.5);
      vec3 graphite = vec3(0.45, 0.43, 0.42);

      // The paint: the render, graded to the story's mood, given a soft cel
      // step (an anime gradient, shaded in bands), pigment granulating in the
      // paper's tooth.
      vec3 pig = col;
      float pl = dot(pig, vec3(0.3, 0.59, 0.11));
      vec3 bruise = mix(vec3(0.16, 0.17, 0.28), vec3(0.62, 0.64, 0.72), smoothstep(0.0, 0.8, pl));
      pig = mix(pig, bruise * (0.6 + 0.6 * pl), uDespair * 0.85);
      vec3 gold = pow(max(pig, 0.0), vec3(0.85)) * vec3(1.1, 1.0, 0.82);
      pig = mix(pig, gold + vec3(0.06, 0.04, 0.0), uEnlight * 0.7);
      float band = floor(pl * 5.0 + 0.5) / 5.0;
      pig *= mix(1.0, (band + 0.08) / max(pl + 0.08, 0.05), 0.35);
      float gran = 0.9 + 0.18 * noise(fc * 0.7) + 0.06 * noise(fc * 0.08);
      // Watercolour is a stain in the paper, not a coat over it: even the
      // darkest water lets the page show through.
      vec3 painted = paper * (0.3 + 0.7 * clamp(pig * 1.08, 0.0, 1.0)) * gran;

      // Where the paint has reached.
      float spread = noise(uv * vec2(5.0 * aspect, 5.0) + 3.0) * 0.5 + noise(uv * 23.0) * 0.12;
      float global = smoothstep(spread * 0.9, spread * 0.9 + 0.1, uColour * 1.08);
      float wet = max(global, max(washFrom(uv, uSeed, aspect), washFrom(uv, uSeed2, aspect)));
      // A tide-line where the wash stopped, darker pigment pooled at its edge.
      float tide = smoothstep(0.55, 0.95, wet) * (1.0 - smoothstep(0.95, 1.0, wet));
      painted *= 1.0 - 0.18 * tide;

      vec3 c = mix(paper, painted, wet);
      // Graphite under everything, ink over, hatching in the shadows (lighter under paint).
      c = mix(c, graphite, clamp(pencil * 0.35 * pencilOn * (1.0 - 0.7 * wet), 0.0, 1.0));
      float line = clamp(max(lineFine * 0.95, lineBold * 0.7) * inkOn, 0.0, 1.0);
      c = mix(c, inkCol, line * (1.0 - 0.3 * wet));
      c = mix(c, inkCol, clamp(hatch, 0.0, 1.0) * 0.3 * hatchOn * (1.0 - 0.55 * wet));

      // Hard thoughts.
      if (uBlood > 0.001) {
        vec4 b = blood(uv, aspect);
        vec3 stain = mix(vec3(0.62, 0.06, 0.05), vec3(0.32, 0.02, 0.03), b.y);
        c = mix(c, c * stain * 1.5, clamp(b.x, 0.0, 1.0) * 0.7);
      }
      // The eye in the water.
      if (uEye > 0.001) {
        vec4 e = eyeInWater(uv, aspect);
        vec3 withEye = mix(c, vec3(0.62, 0.05, 0.06) * (0.6 + 0.4 * c), clamp(e.y, 0.0, 1.0) * 0.9);
        withEye = mix(withEye, vec3(0.05, 0.03, 0.04), e.x);
        withEye = mix(withEye, vec3(1.0, 0.97, 0.92), e.z);
        c = mix(c, withEye, e.w);
      }
      // An impact frame: struck to red and black, as the cutscene's were.
      if (uBurst > 0.001) {
        float l = dot(min(c, 1.0), vec3(0.3, 0.59, 0.11));
        vec3 struck = mix(vec3(0.04, 0.02, 0.02), vec3(0.62, 0.04, 0.04), smoothstep(0.25, 0.6, l));
        struck = mix(struck, vec3(0.96, 0.92, 0.86), smoothstep(0.75, 0.95, l) * 0.6 + line * 0.9);
        c = mix(c, struck, uBurst);
      }
      return c;
    }

    void main() {
      vec2 uv = vUv + uShake;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec2 fringe = c * r2 * 0.01;
      fringe *= 1.0 + 6.0 * length(uShake) * 40.0;
      vec3 col = vec3(
        texture2D(tDiffuse, uv - fringe).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv + fringe).b
      );
      if (uZoom > 0.001) {
        vec3 acc = col;
        // Eight taps, jittered per pixel so the steps blend into one smear.
        float j = hash(vUv * uRes) - 0.5;
        for (int i = 1; i < 8; i++) {
          float k = 1.0 - uZoom * 0.09 * (float(i) + j) / 7.0;
          acc += texture2D(tDiffuse, 0.5 + (uv - 0.5) * k).rgb;
        }
        col = acc / 8.0;
      }
      col = mix(col, pow(max(col, 0.0), vec3(1.0 / 2.2)), uEncode);

      if (uSketch > 0.001) col = mix(col, sketch(uv, col), uSketch);
      // Paper: a laid texture and fibres fixed to the screen, like a print, and
      // the edges browned rather than darkened.
      if (uPaper > 0.001) {
        vec2 px = vUv * uRes;
        float fibre = noise(px * vec2(0.9, 0.12)) * 0.5 + noise(px * 0.35) * 0.3 + noise(px * 0.04) * 0.2;
        float laid = 0.5 + 0.5 * sin(px.y * 0.9);
        float paper = 0.94 + 0.08 * fibre + 0.012 * laid;
        col *= mix(1.0, paper, uPaper);
        col = mix(col, col * vec3(1.0, 0.86, 0.66), uPaper * smoothstep(0.1, 0.5, r2) * 0.6);
      }
      col *= 1.0 - 0.32 * smoothstep(0.08, 0.5, r2) * (1.0 - uPaper * 0.45);
      col = mix(col, vec3(1.0, 0.94, 0.86), uFlash);
      if (uInvert > 0.001) {
        float l = dot(min(col, 1.0), vec3(0.3, 0.59, 0.11));
        vec3 impact = mix(vec3(0.95, 0.9, 0.84), vec3(0.55, 0.02, 0.02), smoothstep(0.08, 0.5, l));
        impact = mix(impact, vec3(0.02), smoothstep(0.55, 0.9, l));
        col = mix(col, impact, uInvert);
      }
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      float grain = hash(vUv * uRes + fract(uTime * 13.7) * 91.0) - 0.5;
      col += grain * (0.012 + 0.07 * sqrt(clamp(luma, 0.0, 1.0)));
      col *= 1.0 - uDim * (0.72 + 0.2 * smoothstep(0.1, 0.5, r2));
      col *= step(uBars, vUv.y) * step(vUv.y, 1.0 - uBars);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
}

export type SketchState = {
  draw: number
  colour: number
  seed: THREE.Vector3
  seed2: THREE.Vector3
  despair: number
  enlight: number
  blood: number
  burst: number
  eye: number
  eyeAt: THREE.Vector3
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 0.82)
  composer.addPass(bloom)
  const finishPass = new ShaderPass(finish)
  composer.addPass(finishPass)

  return {
    setSize(width: number, height: number, buffer: THREE.Vector2) {
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(width, height)
      bloom.resolution.set(width, height)
      finishPass.uniforms.uRes.value.copy(buffer)
    },
    // Which scene the lens is pointed at.
    setView(view: THREE.Scene, eye: THREE.Camera, linear = false) {
      renderPass.scene = view
      renderPass.camera = eye
      finishPass.uniforms.uEncode.value = linear ? 1 : 0
    },
    setZoomBlur(amount: number) {
      finishPass.uniforms.uZoom.value = amount
    },
    // The act is lit brighter than the void; its bloom keeps to the true highlights.
    setBloom(strength: number, threshold: number) {
      // UnrealBloomPass reads these only in its constructor; set its uniforms too.
      bloom.strength = strength
      bloom.threshold = threshold
      ;(bloom as unknown as { compositeMaterial: THREE.ShaderMaterial }).compositeMaterial.uniforms.bloomStrength.value = strength
      ;(bloom as unknown as { highPassUniforms: Record<string, THREE.IUniform> }).highPassUniforms.luminosityThreshold.value = threshold
    },
    // The sketch world: how it is drawn and painted, from the act each frame.
    setSketch(s: SketchState | null) {
      const u = finishPass.uniforms
      u.uSketch.value = s ? 1 : 0
      if (!s) return
      u.uDraw.value = s.draw
      u.uColour.value = s.colour
      u.uSeed.value.copy(s.seed)
      u.uSeed2.value.copy(s.seed2)
      u.uDespair.value = s.despair
      u.uEnlight.value = s.enlight
      u.uBlood.value = s.blood
      u.uBurst.value = s.burst
      u.uEye.value = s.eye
      u.uEyeAt.value.copy(s.eyeAt)
    },
    setPaper(amount: number) {
      finishPass.uniforms.uPaper.value = amount
    },
    flash: finishPass.uniforms.uFlash,
    uniforms: finishPass.uniforms,
    passes: composer.passes,
    render(time: number) {
      finishPass.uniforms.uTime.value = time
      composer.render()
    },
    dispose() {
      composer.dispose()
    },
  }
}
