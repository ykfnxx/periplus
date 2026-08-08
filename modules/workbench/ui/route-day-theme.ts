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
