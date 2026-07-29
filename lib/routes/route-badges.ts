import type { RouteLngLat } from "@/types/route"

export interface RouteBadgeCandidate {
  edgeId: string
  position: RouteLngLat
  isSelected: boolean
  priority: number
}

export interface RouteBadgePlacement extends RouteBadgeCandidate {
  pixel: { x: number; y: number }
}

export function resolveRouteBadgeCollisions(
  candidates: RouteBadgeCandidate[],
  project: (position: RouteLngLat) => { x: number; y: number },
  minimumGap = { x: 132, y: 42 }
) {
  const ordered = candidates.toSorted((left, right) => {
    if (left.isSelected !== right.isSelected) return left.isSelected ? -1 : 1
    return right.priority - left.priority
  })
  const placements: RouteBadgePlacement[] = []

  for (const candidate of ordered) {
    const pixel = project(candidate.position)
    const collides = placements.some(
      (placement) =>
        Math.abs(placement.pixel.x - pixel.x) < minimumGap.x &&
        Math.abs(placement.pixel.y - pixel.y) < minimumGap.y
    )
    if (collides) continue
    placements.push({ ...candidate, pixel })
  }

  return placements
}
