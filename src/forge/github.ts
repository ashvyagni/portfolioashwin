import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { CONTACT } from '../content/forge'

// Every public repository, straight from GitHub: a new one appears in the
// forge the moment it is pushed. If the API will not answer (it allows sixty
// unauthenticated requests an hour per visitor), the snapshot taken at build
// time stands in. Each project's description is its README.

export type Repo = {
  name: string
  description: string | null
  language: string | null
  stargazers_count: number
  pushed_at: string
  created_at: string
  html_url: string
  homepage: string | null
  fork: boolean
  topics: string[]
  default_branch: string
  // From the snapshot: the README's path, null if there is none.
  readme?: string | null
}

const USER = CONTACT.githubUser
let reposPromise: Promise<Repo[]> | null = null

export function loadRepos(): Promise<Repo[]> {
  reposPromise ??= (async () => {
    let list: Repo[] | null = null
    try {
      const res = await fetch(`https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`, { headers: { Accept: 'application/vnd.github+json' } })
      if (res.ok) list = await res.json()
    } catch {
      // offline, or blocked: fall through to the snapshot
    }
    if (!list) {
      const res = await fetch('/repos.json')
      list = res.ok ? await res.json() : []
    }
    // His own work first (forks after), most recently worked on first; the
    // profile README repository is not a project.
    return list!
      .filter((r) => r.name.toLowerCase() !== USER.toLowerCase())
      .sort((a, b) => Number(a.fork) - Number(b.fork) || +new Date(b.pushed_at) - +new Date(a.pushed_at))
  })()
  return reposPromise
}

const readmes = new Map<string, Promise<string | null>>()
// What the snapshot knows about each README, by repository name.
let knownReadmes: Promise<Map<string, string | null>> | null = null
const readmeOf = (name: string) => {
  knownReadmes ??= fetch('/repos.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((list: Repo[]) => new Map(list.filter((r) => r.readme !== undefined).map((r) => [r.name, r.readme ?? null])))
    .catch(() => new Map())
  return knownReadmes.then((m) => (m.has(name) ? m.get(name)! : undefined))
}

// The README as safe HTML, its relative links and images pointed at the repository.
export function loadReadme(repo: Repo): Promise<string | null> {
  if (!readmes.has(repo.name)) {
    readmes.set(
      repo.name,
      (async () => {
        const branch = repo.default_branch || 'HEAD'
        const raw = `https://raw.githubusercontent.com/${USER}/${repo.name}/${branch}/`
        const known = repo.readme !== undefined ? repo.readme : await readmeOf(repo.name)
        if (known === null) return null
        for (const file of known ? [known] : ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README']) {
          try {
            const res = await fetch(raw + file)
            if (!res.ok) continue
            const md = await res.text()
            const html = await marked.parse(md, { gfm: true, async: true })
            const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input'], FORBID_ATTR: ['style'] })
            const doc = new DOMParser().parseFromString(clean, 'text/html')
            doc.querySelectorAll('img[src]').forEach((img) => {
              const src = img.getAttribute('src')!
              if (!/^(https?:|data:)/.test(src)) img.setAttribute('src', new URL(src.replace(/^\.?\//, ''), raw).href)
              img.setAttribute('loading', 'lazy')
            })
            doc.querySelectorAll('a[href]').forEach((a) => {
              const href = a.getAttribute('href')!
              if (href.startsWith('#')) return
              if (!/^(https?:|mailto:)/.test(href)) a.setAttribute('href', `${repo.html_url}/blob/${branch}/${href.replace(/^\.?\//, '')}`)
              a.setAttribute('target', '_blank')
              a.setAttribute('rel', 'noopener noreferrer')
            })
            return doc.body.innerHTML
          } catch {
            // try the next spelling
          }
        }
        return null
      })(),
    )
  }
  return readmes.get(repo.name)!
}
