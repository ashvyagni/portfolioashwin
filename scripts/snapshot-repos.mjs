// Before each build: a snapshot of the public repositories, served with the
// site so the forge has its list even when GitHub's API is rate-limited.
// The page still asks GitHub live first; this is only the fallback.
import { writeFile, readFile } from 'node:fs/promises'

const USER = 'ashvyagni'
const out = new URL('../public/repos.json', import.meta.url)

try {
  const res = await fetch(`https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ashforge-build' },
  })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const repos = (await res.json()).map((r) => ({
    name: r.name,
    description: r.description,
    language: r.language,
    stargazers_count: r.stargazers_count,
    pushed_at: r.pushed_at,
    created_at: r.created_at,
    html_url: r.html_url,
    homepage: r.homepage,
    fork: r.fork,
    topics: r.topics,
    default_branch: r.default_branch,
  }))
  await writeFile(out, JSON.stringify(repos))
  console.log(`snapshot: ${repos.length} repositories`)
} catch (err) {
  const kept = await readFile(out, 'utf8').then(() => 'keeping the last snapshot', () => 'no snapshot yet')
  console.warn(`snapshot skipped (${err.message}); ${kept}`)
}
