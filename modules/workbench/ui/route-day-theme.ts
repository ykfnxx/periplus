export interface RouteDayTone {
  id: string
  marker: string
  line: string
  soft: string
  text: string
  tabIdle: string
  tabSelected: string
}

const DAY_TONES: RouteDayTone[] = [
  {
    id: "orange",
    marker: "bg-marker-orange",
    line: "bg-marker-orange/75",
    soft: "bg-marker-orange/18",
    text: "text-ink",
    tabIdle: "bg-marker-orange/18 text-ink hover:bg-marker-orange/30",
    tabSelected: "bg-marker-orange text-ink",
  },
  {
    id: "mint",
    marker: "bg-marker-mint",
    line: "bg-marker-mint/75",
    soft: "bg-marker-mint/18",
    text: "text-ink",
    tabIdle: "bg-marker-mint/18 text-ink hover:bg-marker-mint/30",
    tabSelected: "bg-marker-mint text-ink",
  },
  {
    id: "yellow",
    marker: "bg-marker-yellow",
    line: "bg-marker-yellow/80",
    soft: "bg-marker-yellow/20",
    text: "text-ink",
    tabIdle: "bg-marker-yellow/20 text-ink hover:bg-marker-yellow/35",
    tabSelected: "bg-marker-yellow text-ink",
  },
  {
    id: "violet",
    marker: "bg-marker-violet",
    line: "bg-marker-violet/75",
    soft: "bg-marker-violet/18",
    text: "text-ink",
    tabIdle: "bg-marker-violet/18 text-ink hover:bg-marker-violet/30",
    tabSelected: "bg-marker-violet text-soft-white",
  },
  {
    id: "coral",
    marker: "bg-marker-coral",
    line: "bg-marker-coral/75",
    soft: "bg-marker-coral/18",
    text: "text-ink",
    tabIdle: "bg-marker-coral/18 text-ink hover:bg-marker-coral/30",
    tabSelected: "bg-marker-coral text-ink",
  },
  {
    id: "sky",
    marker: "bg-marker-sky",
    line: "bg-marker-sky/75",
    soft: "bg-marker-sky/18",
    text: "text-ink",
    tabIdle: "bg-marker-sky/18 text-ink hover:bg-marker-sky/30",
    tabSelected: "bg-marker-sky text-soft-white",
  },
  {
    id: "lime",
    marker: "bg-marker-lime",
    line: "bg-marker-lime/75",
    soft: "bg-marker-lime/18",
    text: "text-ink",
    tabIdle: "bg-marker-lime/18 text-ink hover:bg-marker-lime/30",
    tabSelected: "bg-marker-lime text-soft-white",
  },
  {
    id: "pink",
    marker: "bg-marker-pink",
    line: "bg-marker-pink/75",
    soft: "bg-marker-pink/18",
    text: "text-ink",
    tabIdle: "bg-marker-pink/18 text-ink hover:bg-marker-pink/30",
    tabSelected: "bg-marker-pink text-soft-white",
  },
  {
    id: "indigo",
    marker: "bg-marker-indigo",
    line: "bg-marker-indigo/75",
    soft: "bg-marker-indigo/18",
    text: "text-ink",
    tabIdle: "bg-marker-indigo/18 text-ink hover:bg-marker-indigo/30",
    tabSelected: "bg-marker-indigo text-soft-white",
  },
  {
    id: "turquoise",
    marker: "bg-marker-turquoise",
    line: "bg-marker-turquoise/75",
    soft: "bg-marker-turquoise/18",
    text: "text-ink",
    tabIdle: "bg-marker-turquoise/18 text-ink hover:bg-marker-turquoise/30",
    tabSelected: "bg-marker-turquoise text-soft-white",
  },
]

const UNSCHEDULED_TONE: RouteDayTone = {
  id: "unscheduled",
  marker: "bg-teak",
  line: "bg-teak/30",
  soft: "bg-ink-10",
  text: "text-teak",
  tabIdle: "bg-ink-10 text-teak hover:bg-ink-15",
  tabSelected: "bg-teak text-soft-white",
}

export function routeDayTone(colorIndex: number | null) {
  if (colorIndex === null) return UNSCHEDULED_TONE
  return DAY_TONES[colorIndex % DAY_TONES.length]!
}
