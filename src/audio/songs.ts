// The song past the rift. One of two, chosen at random each visit — a luck
// charm — each starting on its drop, so the beat lands as you come through.
// Each has a palette: the gradient that moves with it, and the forge's accent.
//
// These are commercial recordings the site does not hold a licence for;
// to swap one, replace the file in public/music and its entry here.

export type Song = {
  id: string
  src: string
  from: number // seconds: where the beat drops
  title: string
  credit: string
  palette: [string, string, string] // deep, mid, light
  accent: string
}

export const SONGS: Song[] = [
  { id: 'bajesh', src: '/music/bajesh.m4a', from: 28.4, title: 'Red Bull 64 Bars', credit: 'Bajesh Vishay', palette: ['#3A0614', '#E2361C', '#FFB547'], accent: '#FF5A2B' },
  { id: 'dolare', src: '/music/dolare.m4a', from: 10.9, title: 'Dola Re Dola', credit: 'Devdas (2002)', palette: ['#06302F', '#2FBF9A', '#E6FFF5'], accent: '#6FF0C0' },
]

export function pickSong(): Song {
  // `?song=dolare` (or bajesh) pins it; otherwise, the luck of the draw.
  const asked = new URLSearchParams(location.search).get('song')
  return SONGS.find((s) => s.id === asked) ?? SONGS[Math.floor(Math.random() * SONGS.length)]
}

// How loud the song is now, in three bands (0 … 1), smoothed.
export function createLevels() {
  const levels = { bass: 0, mid: 0, high: 0 }
  let data: Uint8Array<ArrayBuffer> | null = null
  return {
    levels,
    read(analyser: AnalyserNode | null, time: number) {
      if (!analyser) {
        // No sound (or silence chosen): a slow breath instead.
        levels.bass = 0.35 + 0.25 * Math.sin(time * 1.1)
        levels.mid = 0.3 + 0.2 * Math.sin(time * 0.7 + 1)
        levels.high = 0.2 + 0.15 * Math.sin(time * 1.9 + 2)
        return levels
      }
      data ??= new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      const band = (a: number, b: number) => {
        let s = 0
        for (let i = a; i < b; i++) s += data![i]
        return s / ((b - a) * 255)
      }
      const ease = (prev: number, next: number) => prev + (next - prev) * (next > prev ? 0.5 : 0.12)
      levels.bass = ease(levels.bass, band(1, 6))
      levels.mid = ease(levels.mid, band(8, 40))
      levels.high = ease(levels.high, band(60, 140))
      return levels
    },
  }
}
