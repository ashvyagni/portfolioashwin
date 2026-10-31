// Phase two: the descent, the tree, the forge.
//
// MILESTONES are things that are on the record — a repository's own
// description or topic, a DOI, a college. Nothing here is invented: add real
// awards, talks or papers as they happen, and they take their place on the
// spiral (newest at the top).

export type Milestone = { year: string; title: string; note: string; link?: string }

export const MILESTONES: Milestone[] = [
  { year: '2026', title: 'Cosmogon', note: 'a space renderer in Rust — archived on Zenodo', link: 'https://doi.org/10.5281/zenodo.23397691' },
  { year: '2026', title: 'MirrorBound', note: 'built at Vinhack', link: 'https://github.com/ashvyagni/MirrorBound' },
  { year: '2026', title: 'X-Trace', note: 'an adaptive city-supervisor AI, built for a hackathon', link: 'https://github.com/ashvyagni/X-Trace' },
  { year: '2026', title: 'CivSYS', note: 'with team Brogrammers at Code2Create 7.0', link: 'https://github.com/ashvyagni/CivSYS' },
  { year: '2026', title: 'wall-e', note: 'a Vinnovate project', link: 'https://github.com/ashvyagni/wall-e-' },
  { year: '2026', title: 'Chaos Chess', note: 'a chess engine in Rust, built to ensue chaos', link: 'https://github.com/ashvyagni/chaoschess' },
  { year: 'now', title: 'VIT Vellore', note: 'B.Tech, Computer Science (AI & ML)' },
]

// The tree of wisdom: each branch a domain, each leaf something worked with.
// No levels, no percentages — just what grows where.
export type Branch = { name: string; hi: string; leaves: string[] }

export const TREE: Branch[] = [
  { name: 'Languages', hi: 'भाषा', leaves: ['Python', 'Rust', 'C++', 'C', 'C#', 'Java', 'TypeScript', 'JavaScript', 'Swift', 'SQL', 'Bash'] },
  { name: 'AI / ML', hi: 'मेधा', leaves: ['PyTorch', 'TensorFlow', 'scikit-learn', 'NumPy', 'Pandas', 'OpenCV', 'Ollama', 'Llama 3', 'Faster-Whisper', 'RL research'] },
  { name: 'Vision & space', hi: 'दृष्टि', leaves: ['COLMAP', 'photogrammetry', 'SfM', 'multi-view reconstruction', 'glTF', 'digital twins'] },
  { name: 'Graphics', hi: 'चित्र', leaves: ['Three.js', 'WebGL', 'OpenGL', 'PlayCanvas', 'Blender', 'Unity'] },
  { name: 'Web', hi: 'जाल', leaves: ['React', 'Next.js', 'Vite', 'Node.js', 'Tailwind', 'React Flow', 'Framer'] },
  { name: 'Backend', hi: 'आधार', leaves: ['FastAPI', 'Flask', 'Streamlit', 'Electron', 'React Native', 'Firebase', 'Supabase', 'Prisma'] },
  { name: 'Data', hi: 'ज्ञान', leaves: ['PostgreSQL', 'MongoDB', 'NetworkX', 'Python AST', 'ts-morph', 'graph models'] },
  { name: 'Games & systems', hi: 'क्रीडा', leaves: ['Rust', 'Unity', 'UCI', 'chess engines', 'simulations', 'Godot'] },
  { name: 'DevOps', hi: 'सेतु', leaves: ['Docker', 'Git', 'GitHub Actions', 'Vercel', 'Netlify', 'Fastlane'] },
  { name: 'Testing', hi: 'परीक्षा', leaves: ['Playwright', 'TDD', 'browser automation', 'API testing'] },
  { name: 'Making', hi: 'कला', leaves: ['Figma', 'Photoshop', 'Premiere Pro', 'After Effects', 'FFmpeg', 'Blender'] },
]

export const CONTACT = {
  email: 'ashwindandotiya@gmail.com',
  github: 'https://github.com/ashvyagni',
  githubUser: 'ashvyagni',
}
