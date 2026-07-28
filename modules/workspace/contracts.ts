export interface ViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export type MapFocusTarget =
  | { type: "node"; nodeId: string; zoom: number }
  | { type: "edge"; edgeId: string; maxZoom: number }
  | { type: "active-route"; maxZoom: number }

export interface MapFocusRequest {
  requestId: number
  target: MapFocusTarget
}

export interface MapCoordinate {
  lat: number
  lng: number
}

export type MapIntent =
  | { type: "map.background-clicked" }
  | { type: "map.location-picked"; coordinate: MapCoordinate }
  | {
      type: "map.waypoint-selected"
      waypointId: string
      anchor?: MapCoordinate
    }
  | { type: "map.waypoint-hovered"; waypointId: string }
  | { type: "map.waypoint-hover-cleared"; waypointId: string }
  | { type: "map.photo-selected"; photoId: string }
  | { type: "map.edge-selected"; edgeId: string }
