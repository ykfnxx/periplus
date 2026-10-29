export interface ViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export type MapFocusTarget =
  | { type: "event"; eventId: string; zoom: number }
  | { type: "transit"; eventId: string; maxZoom: number }
  | { type: "active-journey"; maxZoom: number }

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
  | {
      type: "map.event-selected"
      eventId: string
      anchor?: MapCoordinate
    }
  | { type: "map.event-hovered"; eventId: string }
  | { type: "map.event-hover-cleared"; eventId: string }
  | { type: "map.transit-selected"; eventId: string }
