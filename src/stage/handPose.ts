import * as THREE from 'three'
import type { HandPose } from './handModel'

export const HAND_MODEL = '/models/hand-left.glb'

// Left hand, turned to the side. Index raised; middle finger wrapped over it
// with its tip hooking out past the index; ring finger curled into a hook,
// pinky curled tight; thumb up and out. Angles in radians; tuned in /?lab=hand.
export const HAND_POSE: HandPose = {
  'index-finger-phalanx-proximal': { curl: 0.2, spread: 0.08 },
  'index-finger-phalanx-intermediate': { curl: 0.05 },
  'index-finger-phalanx-distal': { curl: 0.05 },
  'middle-finger-phalanx-proximal': { curl: 0.05, spread: -0.45 },
  'middle-finger-phalanx-intermediate': { curl: 0.95, spread: -0.15 },
  'middle-finger-phalanx-distal': { curl: 0.55 },
  'ring-finger-metacarpal': { curl: 0.08 },
  'ring-finger-phalanx-proximal': { curl: 0.7 },
  'ring-finger-phalanx-intermediate': { curl: 1.65 },
  'ring-finger-phalanx-distal': { curl: 0.8 },
  'pinky-finger-metacarpal': { curl: 0.2 },
  'pinky-finger-phalanx-proximal': { curl: 1.5 },
  'pinky-finger-phalanx-intermediate': { curl: 1.7 },
  'pinky-finger-phalanx-distal': { curl: 1.0 },
  'thumb-metacarpal': { spread: 0.05, curl: 0.05, twist: 0.7 },
  'thumb-phalanx-proximal': { curl: 0.08 },
  'thumb-phalanx-distal': { curl: 0.25 },
}

// Side-on from the thumb side, slightly from below, leaning a touch left.
export const HAND_VIEW = new THREE.Euler(-0.12, -Math.PI / 2 - 0.95, Math.PI - 0.2, 'YXZ')

// Where the hand starts once the dust has gathered: open, soft, every finger a
// little curled, nothing straight.
export const RELAXED_POSE: HandPose = {
  'index-finger-phalanx-proximal': { curl: 0.22, spread: -0.04 },
  'index-finger-phalanx-intermediate': { curl: 0.24 },
  'index-finger-phalanx-distal': { curl: 0.12 },
  'middle-finger-phalanx-proximal': { curl: 0.26 },
  'middle-finger-phalanx-intermediate': { curl: 0.3 },
  'middle-finger-phalanx-distal': { curl: 0.14 },
  'ring-finger-metacarpal': { curl: 0.04 },
  'ring-finger-phalanx-proximal': { curl: 0.32, spread: 0.04 },
  'ring-finger-phalanx-intermediate': { curl: 0.36 },
  'ring-finger-phalanx-distal': { curl: 0.16 },
  'pinky-finger-metacarpal': { curl: 0.08 },
  'pinky-finger-phalanx-proximal': { curl: 0.38, spread: 0.1 },
  'pinky-finger-phalanx-intermediate': { curl: 0.42 },
  'pinky-finger-phalanx-distal': { curl: 0.2 },
  'thumb-metacarpal': { spread: 0.1, curl: 0.0, twist: 0.4 },
  'thumb-phalanx-proximal': { curl: 0.12 },
  'thumb-phalanx-distal': { curl: 0.15 },
}

// When each finger moves into the sign, as a fraction of the gesture:
// pinky and ring fold first, the index rises, the middle crosses over it,
// the thumb settles last.
export const FINGER_DELAY: Record<string, number> = {
  pinky: 0,
  ring: 0.06,
  index: 0.14,
  middle: 0.24,
  thumb: 0.3,
  wrist: 0,
}
