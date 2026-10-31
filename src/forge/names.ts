import type { Repo } from './github'

// How a repository is named and labelled in the forge. The labels come from
// each repository's own description or topics — nothing is claimed that the
// repo does not say. Anything new on GitHub falls back to a cleaned-up name
// and its language.

const CURATED: Record<string, { name: string; label: string }> = {
  cosmogon: { name: 'Cosmogon', label: 'Space renderer · Rust' },
  chaoschess: { name: 'Chaos Chess', label: 'Chess engine · Rust' },
  CivSYS: { name: 'CivSYS', label: 'Simulation · Team · Code2Create' },
  'X-Trace': { name: 'X-Trace', label: 'City-supervisor AI · Hackathon' },
  MirrorBound: { name: 'MirrorBound', label: 'Vinhack' },
  Axiom: { name: 'Axiom', label: 'Research model' },
  AIM: { name: 'AIM', label: 'Research model' },
  ContextOS: { name: 'ContextOS', label: 'TypeScript' },
  'Semiconductor-Imagery-LLM': { name: 'Semiconductor Imagery', label: 'Image models · Python' },
  Vantage: { name: 'Vantage', label: 'Geolocation from EXIF · TypeScript' },
  'Model-H-Hub': { name: 'Model H Hub', label: 'Multi-LLM playground' },
  'PromptPress---AI-WEBSITE-BUILDER': { name: 'PromptPress', label: 'Prompt to website' },
  'civ-rl': { name: 'Civ RL', label: 'Multi-agent simulation' },
  Vowed: { name: 'Vowed', label: 'Game · Godot' },
  Crammed: { name: 'Crammed', label: 'Exam prep site' },
  Exodus: { name: 'Exodus', label: 'Minecraft plugin' },
  HealPlus: { name: 'HealPlus', label: 'Minecraft plugin · Java' },
  'PS5X---AnyPS5-Emulator': { name: 'PS5X', label: 'Emulator' },
  portfolioashwin: { name: 'This portfolio', label: 'React · Three.js' },
  'wall-e-': { name: 'WALL-E', label: 'Vinnovate · Python' },
  echorunner: { name: 'Echo Runner', label: 'Python' },
  'adaptive-rpg-game': { name: 'Adaptive RPG', label: 'Game · Python' },
}

export function prettyName(slug: string) {
  if (CURATED[slug]) return CURATED[slug].name
  const words = slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
  return words.map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
}

export function labelOf(repo: Repo) {
  const curated = CURATED[repo.name]?.label
  const base = curated ?? repo.language ?? 'Mixed'
  return `${base}${repo.fork ? ' · Fork' : curated ? '' : ' · From GitHub'}`
}
