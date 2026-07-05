"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import {
  calculateAnchorClusters,
  calculateScatterOffsets,
  createAnchorItems,
  isActiveCluster,
  SCATTER_RADIUS,
  type AnchorItem,
  type ClusterGroup,
} from "@/lib/map/anchor-clusters"
import { getActivePathView } from "@/lib/routes/active-path"
import { useMapStore, type PhotoShare } from "@/stores/mapStore"
import { periplusColors, routeMarkerColors } from "@/lib/ui/map-theme"

// 动画时长
const ANIMATION_DURATION = 300

type RouteNodeMeta = Record<string, { index: number; color: string }>

function shouldUseDarkMarkerText(color: string) {
  return color === periplusColors.mustard || color === periplusColors.bluegray
}

function createRouteIcon(
  anchor: AnchorItem,
  routeNodeMeta: RouteNodeMeta,
  variant: "marker" | "preview"
) {
  const meta = routeNodeMeta[anchor.id]
  const color = meta?.color || periplusColors.russet
  const label = meta ? `${meta.index}` : anchor.sourceId

  const content = document.createElement("div")
  content.textContent = label
  content.style.background = color

  if (variant === "marker") {
    content.className = `periplus-map-marker ${
      shouldUseDarkMarkerText(color) ? "periplus-map-marker--mustard" : ""
    }`
    return content
  }

  content.className =
    "periplus-overlap-anchor-icon periplus-overlap-anchor-icon--route"
  content.style.color = shouldUseDarkMarkerText(color)
    ? periplusColors.ink
    : periplusColors.white
  return content
}

function createPhotoIcon(
  anchor: AnchorItem,
  photoShares: PhotoShare[],
  variant: "marker" | "preview"
) {
  const photo = photoShares.find((p) => `photo-${p.id}` === anchor.id)
  const content = document.createElement("div")
  content.className =
    variant === "marker"
      ? "periplus-photo-marker"
      : "periplus-overlap-anchor-icon periplus-overlap-anchor-icon--photo"

  const imageUrl = photo?.imageDataUrl || anchor.imageDataUrl
  if (imageUrl) {
    const image = document.createElement("img")
    image.src = imageUrl
    image.alt = ""
    image.style.cssText = "width:100%;height:100%;object-fit:cover;"
    content.append(image)
  }

  return content
}

function createAnchorIcon(
  anchor: AnchorItem,
  routeNodeMeta: RouteNodeMeta,
  photoShares: PhotoShare[],
  variant: "marker" | "preview"
) {
  return anchor.type === "route"
    ? createRouteIcon(anchor, routeNodeMeta, variant)
    : createPhotoIcon(anchor, photoShares, variant)
}

function createClusterIcon(
  cluster: ClusterGroup,
  routeNodeMeta: RouteNodeMeta,
  photoShares: PhotoShare[],
  dimmed = false
) {
  const content = document.createElement("div")
  content.className = `periplus-overlap-cluster${
    dimmed ? " periplus-overlap-cluster--dimmed" : ""
  }`

  cluster.anchors.slice(0, 2).forEach((anchor, index) => {
    const icon = createAnchorIcon(
      anchor,
      routeNodeMeta,
      photoShares,
      "preview"
    )
    icon.classList.add(`periplus-overlap-anchor-icon--${index + 1}`)
    content.append(icon)
  })

  if (cluster.anchors.length > 2) {
    const count = document.createElement("div")
    count.className = "periplus-overlap-cluster__count"
    count.textContent = `+${cluster.anchors.length - 2}`
    content.append(count)
  }

  return content
}

function projectAnchor(map: AMap.Map, anchor: AnchorItem) {
  const pixel = map.lngLatToContainer(new AMap.LngLat(anchor.lng, anchor.lat))
  return { x: pixel.getX(), y: pixel.getY() }
}

function pixelToLngLat(map: AMap.Map, pixel: { x: number; y: number }) {
  return map.containerToLngLat(new AMap.Pixel(pixel.x, pixel.y))
}

function lngLatToAnchor(lngLat: AMap.LngLat) {
  return {
    lat: lngLat.getLat(),
    lng: lngLat.getLng(),
  }
}

export default function OverlapCluster() {
  const map = useMapStore((s) => s.map)
  const currentRoute = useMapStore((s) => s.currentRoute)
  const viewLevel = useMapStore((s) => s.viewLevel)
  const activeRouteNodeId = useMapStore((s) => s.activeRouteNodeId)
  const photoShares = useMapStore((s) => s.photoShares)
  const anchorCluster = useMapStore((s) => s.anchorCluster)
  const expandCluster = useMapStore((s) => s.expandCluster)
  const collapseCluster = useMapStore((s) => s.collapseCluster)
  const selectedLocationPoint = useMapStore((state) => state.selectedLocationPoint)
  const setSelectedLocationPoint = useMapStore(
    (s) => s.setSelectedLocationPoint
  )
  const setLightboxPhotoShare = useMapStore((s) => s.setLightboxPhotoShare)
  const enterCityView = useMapStore((s) => s.enterCityView)

  const [clusters, setClusters] = useState<ClusterGroup[]>([])
  const clusterMarkersRef = useRef<AMap.Marker[]>([])
  const scatteredMarkersRef = useRef<AMap.Marker[]>([])
  const dimmedClusterMarkersRef = useRef<AMap.Marker[]>([])
  const scatterLinesRef = useRef<AMap.Polyline[]>([])
  const isMapDraggingRef = useRef(false)
  const routeNodeMetaRef = useRef<{
    [id: string]: { index: number; color: string }
  }>({})

  const recalculateClusters = useCallback(() => {
    if (!map) return

    const view = getActivePathView(currentRoute, viewLevel, activeRouteNodeId)
    const routeNodes =
      view.nodes.map((node) => ({
        id: node.id,
        lat: node.lat,
        lng: node.lng,
        order: node.order,
        name: node.name,
      }))

    const photos = photoShares.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      imageDataUrl: p.imageDataUrl,
    }))

    const anchors = createAnchorItems(routeNodes, photos)
    const newClusters = calculateAnchorClusters(anchors, (anchor) =>
      projectAnchor(map, anchor)
    )
    setClusters(newClusters)
  }, [map, currentRoute, viewLevel, activeRouteNodeId, photoShares])

  // 预计算 route node 元数据
  const updateRouteNodeMeta = useCallback(() => {
    const meta: RouteNodeMeta = {}
    if (currentRoute) {
      const view = getActivePathView(currentRoute, viewLevel, activeRouteNodeId)
      const sortedNodes = [...view.nodes].sort(
        (a, b) => a.order - b.order
      )
      sortedNodes.forEach((node, index) => {
        meta[`route-${node.id}`] = {
          index: index + 1,
          color: routeMarkerColors[index % routeMarkerColors.length],
        }
      })
    }
    routeNodeMetaRef.current = meta
  }, [currentRoute, viewLevel, activeRouteNodeId])

  // 创建/更新重叠态 AMap Marker
  useEffect(() => {
    if (!map) return

    // 清理旧 marker
    clusterMarkersRef.current.forEach((m) => map.remove(m))
    clusterMarkersRef.current = []

    updateRouteNodeMeta()
    const markers: AMap.Marker[] = []
    const activeAnchorIds = new Set(
      anchorCluster.scatteredAnchors.map((anchor) => anchor.id)
    )

    clusters.forEach((cluster) => {
      if (
        anchorCluster.isScattered &&
        isActiveCluster(cluster, activeAnchorIds)
      ) {
        return
      }

      const content = createClusterIcon(
        cluster,
        routeNodeMetaRef.current,
        photoShares
      )

      const marker = new AMap.Marker({
        content,
        position: pixelToLngLat(map, cluster.center),
        offset: new AMap.Pixel(-22, -22),
        zIndex: 200,
      })

      marker.on("click", (e) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(e as any).stopPropagation?.()
        const offsets = calculateScatterOffsets(
          cluster.anchors.length,
          SCATTER_RADIUS
        )

        const scatteredAnchors = cluster.anchors.map((anchor, i) => ({
          id: anchor.id,
          type: anchor.type,
          originalPixel: cluster.center,
          scatterOffset: offsets[i],
        }))

        expandCluster(cluster.center, scatteredAnchors)
      })

      markers.push(marker)
    })

    map.add(markers)
    clusterMarkersRef.current = markers

    return () => {
      markers.forEach((m) => map.remove(m))
      clusterMarkersRef.current = []
    }
  }, [
    map,
    clusters,
    photoShares,
    anchorCluster.isScattered,
    anchorCluster.scatteredAnchors,
    expandCluster,
    updateRouteNodeMeta,
  ])

  // 散开态：创建弹开的 AMap Marker + 渐暗的原地重叠图标
  useEffect(() => {
    if (!map || !anchorCluster.isScattered || !anchorCluster.scatterCenter)
      return

    updateRouteNodeMeta()

    // 清理旧 marker
    scatteredMarkersRef.current.forEach((m) => map.remove(m))
    scatteredMarkersRef.current = []
    dimmedClusterMarkersRef.current.forEach((m) => map.remove(m))
    dimmedClusterMarkersRef.current = []
    scatterLinesRef.current.forEach((line) => map.remove(line))
    scatterLinesRef.current = []

    const markers: AMap.Marker[] = []
    const dimmedMarkers: AMap.Marker[] = []
    const lines: AMap.Polyline[] = []

    // 1. 在原地创建渐暗的重叠图标
    const activeCluster = clusters.find((c) => {
      const firstAnchor = anchorCluster.scatteredAnchors[0]
      return c.anchors.some((a) => a.id === firstAnchor.id)
    })

    if (activeCluster) {
      const dimmedContent = createClusterIcon(
        activeCluster,
        routeNodeMetaRef.current,
        photoShares,
        true
      )

      const dimmedMarker = new AMap.Marker({
        content: dimmedContent,
        position: pixelToLngLat(map, activeCluster.center),
        offset: new AMap.Pixel(-22, -22),
        zIndex: 150,
      })

      dimmedMarker.on("click", (e) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(e as any).stopPropagation?.()
        collapseCluster()
      })

      dimmedMarkers.push(dimmedMarker)
    }

    // 2. 创建弹开的候选 marker。偏移采用不规则 spiderfy 分布，避免机械圆环。
    anchorCluster.scatteredAnchors.forEach((anchor) => {
      const markerPixel = {
        x: anchor.originalPixel.x + anchor.scatterOffset.x,
        y: anchor.originalPixel.y + anchor.scatterOffset.y,
      }
      const originLngLat = pixelToLngLat(map, anchor.originalPixel)
      const scatteredLngLat = map.containerToLngLat(
        new AMap.Pixel(markerPixel.x, markerPixel.y)
      )
      const clusterAnchor = activeCluster?.anchors.find(
        (item) => item.id === anchor.id
      )
      const content = createAnchorIcon(
        clusterAnchor ?? {
          id: anchor.id,
          sourceId: anchor.id.replace(`${anchor.type}-`, ""),
          type: anchor.type,
          lat: 0,
          lng: 0,
        },
        routeNodeMetaRef.current,
        photoShares,
        "marker"
      )
      content.style.animation = `scatterPop ${ANIMATION_DURATION}ms ease-out`

      const line = new AMap.Polyline({
        path: [originLngLat, scatteredLngLat],
        borderWeight: 2,
        isOutline: true,
        lineCap: "round",
        lineJoin: "round",
        outlineColor: periplusColors.softWhite,
        strokeColor: periplusColors.ink,
        strokeDasharray: [6, 5],
        strokeOpacity: 0.58,
        strokeStyle: "dashed",
        strokeWeight: 2.5,
        zIndex: 280,
      })
      lines.push(line)

      const marker = new AMap.Marker({
        content,
        position: scatteredLngLat,
        offset:
          anchor.type === "photo"
            ? new AMap.Pixel(-24, -24)
            : new AMap.Pixel(-14, -14),
        zIndex: 300,
      })

      marker.on("click", (e) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(e as any).stopPropagation?.()
        // 不再收起，只选中，并传递弹出位置的像素坐标
        if (anchor.type === "route") {
          const view = getActivePathView(
            currentRoute,
            viewLevel,
            activeRouteNodeId
          )
          const point = view.nodes.find(
            (p) => `route-${p.id}` === anchor.id
          )
          if (point) {
            if (view.level === "overview") {
              enterCityView(point.id)
              return
            }
            if (selectedLocationPoint?.id === point.id) {
              setSelectedLocationPoint(null)
              return
            }
            setSelectedLocationPoint(point, lngLatToAnchor(scatteredLngLat))
          }
        } else {
          const photo = photoShares.find((p) => `photo-${p.id}` === anchor.id)
          if (photo) {
            setLightboxPhotoShare(photo)
          }
        }
      })

      markers.push(marker)
    })

    map.add(dimmedMarkers)
    map.add(lines)
    map.add(markers)
    dimmedClusterMarkersRef.current = dimmedMarkers
    scatterLinesRef.current = lines
    scatteredMarkersRef.current = markers

    return () => {
      dimmedMarkers.forEach((m) => map.remove(m))
      lines.forEach((line) => map.remove(line))
      markers.forEach((m) => map.remove(m))
      dimmedClusterMarkersRef.current = []
      scatterLinesRef.current = []
      scatteredMarkersRef.current = []
    }
  }, [
    map,
    anchorCluster,
    clusters,
    photoShares,
    currentRoute,
    viewLevel,
    activeRouteNodeId,
    collapseCluster,
    enterCityView,
    setSelectedLocationPoint,
    updateRouteNodeMeta,
  ])

  // 地图事件监听：zoom/pan 时重新计算聚类
  useEffect(() => {
    if (!map) return

    let debounceTimer: ReturnType<typeof setTimeout>
    const handleMapChange = () => {
      if (isMapDraggingRef.current) return
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        recalculateClusters()
        if (anchorCluster.isScattered) {
          collapseCluster()
        }
      }, 100)
    }
    const handleDragStart = () => {
      isMapDraggingRef.current = true
      clearTimeout(debounceTimer)
    }
    const handleDragEnd = () => {
      isMapDraggingRef.current = false
      recalculateClusters()
      if (anchorCluster.isScattered) {
        collapseCluster()
      }
    }

    map.on("dragstart", handleDragStart)
    map.on("dragend", handleDragEnd)
    map.on("zoomchange", handleMapChange)
    map.on("mapmove", handleMapChange)

    recalculateClusters()

    return () => {
      map.off("dragstart", handleDragStart)
      map.off("dragend", handleDragEnd)
      map.off("zoomchange", handleMapChange)
      map.off("mapmove", handleMapChange)
      clearTimeout(debounceTimer)
    }
  }, [map, recalculateClusters, anchorCluster.isScattered, collapseCluster])

  // 数据变化时重新计算
  useEffect(() => {
    recalculateClusters()
  }, [currentRoute, photoShares, recalculateClusters])

  // 点击地图空白处收起散开态
  useEffect(() => {
    if (!map || !anchorCluster.isScattered) return

    const handleMapClick = () => {
      collapseCluster()
    }

    map.on("click", handleMapClick)
    return () => {
      map.off("click", handleMapClick)
    }
  }, [map, anchorCluster.isScattered, collapseCluster])

  // 组件卸载时清理所有 marker
  useEffect(() => {
    return () => {
      if (!map) return
      clusterMarkersRef.current.forEach((m) => map.remove(m))
      scatteredMarkersRef.current.forEach((m) => map.remove(m))
      dimmedClusterMarkersRef.current.forEach((m) => map.remove(m))
      scatterLinesRef.current.forEach((line) => map.remove(line))
      clusterMarkersRef.current = []
      scatteredMarkersRef.current = []
      dimmedClusterMarkersRef.current = []
      scatterLinesRef.current = []
    }
  }, [map])

  return null
}
