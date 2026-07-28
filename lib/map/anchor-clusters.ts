import type { AnchorType } from "@/modules/workspace/state/types"

export interface AnchorRouteNode {
  id: string
  lat: number
  lng: number
  order: number
  name: string
}

export interface AnchorPhotoShare {
  id: string
  lat: number
  lng: number
  imageDataUrl: string
}

export interface AnchorItem {
  id: string
  sourceId: string
  type: AnchorType
  lat: number
  lng: number
  order?: number
  name?: string
  imageDataUrl?: string
}

export interface ClusterGroup {
  center: { x: number; y: number }
  anchors: AnchorItem[]
}

interface PixelAnchorItem extends AnchorItem {
  pixel: { x: number; y: number }
}

export const CLUSTER_PIXEL_DISTANCE_THRESHOLD = 20
export const SCATTER_RADIUS = 58

function getPixelDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)
}

export function createAnchorItems(
  routeNodes: AnchorRouteNode[],
  photoShares: AnchorPhotoShare[]
): AnchorItem[] {
  return [
    ...routeNodes.map((node) => ({
      id: `route-${node.id}`,
      sourceId: node.id,
      type: "route" as const,
      lat: node.lat,
      lng: node.lng,
      order: node.order,
      name: node.name,
    })),
    ...photoShares.map((photo) => ({
      id: `photo-${photo.id}`,
      sourceId: photo.id,
      type: "photo" as const,
      lat: photo.lat,
      lng: photo.lng,
      imageDataUrl: photo.imageDataUrl,
    })),
  ]
}

export function calculateAnchorClusters(
  anchors: AnchorItem[],
  projectAnchor: (anchor: AnchorItem) => { x: number; y: number },
  threshold = CLUSTER_PIXEL_DISTANCE_THRESHOLD
): ClusterGroup[] {
  const pixelAnchors: PixelAnchorItem[] = anchors.map((anchor) => ({
    ...anchor,
    pixel: projectAnchor(anchor),
  }))
  const visited = new Set<string>()
  const clusters: ClusterGroup[] = []

  for (const anchor of pixelAnchors) {
    if (visited.has(anchor.id)) continue

    const cluster: PixelAnchorItem[] = []
    const queue = [anchor]
    visited.add(anchor.id)
    cluster.push(anchor)

    for (const current of queue) {
      for (const other of pixelAnchors) {
        if (visited.has(other.id)) continue
        if (getPixelDistance(current.pixel, other.pixel) < threshold) {
          visited.add(other.id)
          cluster.push(other)
          queue.push(other)
        }
      }
    }

    if (cluster.length > 1) {
      const centerX =
        cluster.reduce((sum, item) => sum + item.pixel.x, 0) / cluster.length
      const centerY =
        cluster.reduce((sum, item) => sum + item.pixel.y, 0) / cluster.length
      clusters.push({
        center: { x: centerX, y: centerY },
        anchors: cluster.map(({ pixel: _pixel, ...item }) => item),
      })
    }
  }

  return clusters
}

export function collectClusteredSourceIds(
  clusters: ClusterGroup[],
  type: AnchorType
) {
  return new Set(
    clusters.flatMap((cluster) =>
      cluster.anchors
        .filter((anchor) => anchor.type === type)
        .map((anchor) => anchor.sourceId)
    )
  )
}

export function isActiveCluster(
  cluster: ClusterGroup,
  activeAnchorIds: Set<string>
) {
  return cluster.anchors.some((anchor) => activeAnchorIds.has(anchor.id))
}

export function calculateScatterOffsets(
  count: number,
  radius = SCATTER_RADIUS
): { x: number; y: number }[] {
  const scale = radius / SCATTER_RADIUS
  const patterns: Record<number, { x: number; y: number }[]> = {
    1: [{ x: 0, y: -radius }],
    2: [
      { x: -24 * scale, y: -52 * scale },
      { x: 48 * scale, y: 26 * scale },
    ],
    3: [
      { x: -10 * scale, y: -58 * scale },
      { x: 56 * scale, y: -14 * scale },
      { x: -46 * scale, y: 42 * scale },
    ],
    4: [
      { x: -18 * scale, y: -58 * scale },
      { x: 58 * scale, y: -20 * scale },
      { x: 38 * scale, y: 48 * scale },
      { x: -54 * scale, y: 30 * scale },
    ],
    5: [
      { x: -14 * scale, y: -60 * scale },
      { x: 54 * scale, y: -32 * scale },
      { x: 62 * scale, y: 30 * scale },
      { x: -4 * scale, y: 66 * scale },
      { x: -62 * scale, y: 12 * scale },
    ],
  }

  if (patterns[count]) return patterns[count]

  const offsets: { x: number; y: number }[] = []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const ringRadius = radius * (0.82 + Math.floor(i / 6) * 0.32)
    const angle = -Math.PI / 2 + i * goldenAngle + (i % 2 === 0 ? 0.18 : -0.1)
    offsets.push({
      x: Math.cos(angle) * ringRadius,
      y: Math.sin(angle) * ringRadius,
    })
  }
  return offsets
}
