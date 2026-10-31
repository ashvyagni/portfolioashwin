// The Curiosity chapter (जिज्ञासा), told by the pothi: what is inked on its
// leaf in Sanskrit, and what its projection says in English, in Ashwin's
// own voice.
//
// DRAFT COPY: written from what Ashwin has said about himself, for him to
// correct before it goes live. The Sanskrit is simple prose and should be
// checked by a fluent reader too.

export type Leaf = {
  num: string
  title: string // Sanskrit heading
  gloss: string // transliteration · meaning
  sanskrit: string[]
  english: string[]
}

export const LEAVES: Leaf[] = [
  {
    num: '१',
    title: 'परिचयः',
    gloss: 'Paricayaḥ · Introduction',
    sanskrit: ['अहम् अश्विनः।', 'सङ्गणकविज्ञानस्य छात्रः अस्मि —', 'कृत्रिमबुद्धिं यन्त्राधिगमं च पठामि।'],
    english: ["I'm Ashwin.", 'A computer science student at VIT Vellore,', 'specialising in AI and machine learning.'],
  },
  {
    num: '२',
    title: 'जिज्ञासा',
    gloss: 'Jijñāsā · Curiosity',
    sanskrit: ['यन्त्रबुद्धिः, दृष्टिः, अनुकरणम्, कला च —', 'एतेषु मम मनः रमते।'],
    english: ['I explore AI/ML research, computer vision', 'and photogrammetry, Rust systems,', 'simulations, graphics and games.'],
  },
  {
    num: '३',
    title: 'निर्माणम्',
    gloss: 'Nirmāṇam · Building',
    sanskrit: ['विचारान् कृतिषु परिणमयामि।', 'काश्चित् उपयोगिन्यः, काश्चित् प्रयोगाः,', 'काश्चित् अतीव महत्त्वाकाङ्क्षिण्यः।'],
    english: ['I keep turning random ideas into projects.', 'Some useful, some experimental,', 'some way too ambitious.'],
  },
  {
    num: '४',
    title: 'सङ्कल्पः',
    gloss: 'Saṅkalpaḥ · Resolve',
    sanskrit: ['पश्यन्ति, चिन्तयन्ति, सृजन्ति च —', 'तादृशानि यन्त्राणि रचयितुम् इच्छामि।'],
    english: ['I want to build systems that see,', 'reason and simulate — and carry them', 'from a research idea to something people use.'],
  },
  {
    num: '५',
    title: 'कथा',
    gloss: 'Kathā · Story',
    sanskrit: ['चलच्चित्रं लेखनं च —', 'कथाः अपि मम कर्म।'],
    english: ['Outside code: filmmaking and writing.', 'Every project is also a story.'],
  },
]
