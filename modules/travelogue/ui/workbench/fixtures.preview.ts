import type {
  JourneyEvent,
  JourneySnapshot,
} from "@/modules/data-model/contracts"
export const previewImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#dfe6e3"/><path d="M0 330L200 130L420 370L600 180L800 320V500H0" fill="#4a7c59"/><circle cx="600" cy="90" r="45" fill="#d4a574"/></svg>')}`
export const previewEvent: JourneyEvent = {
  id: "preview-event",
  title: "西湖漫步",
  body: "雨后沿湖散步，在长椅上停了一会儿。",
  category: "VISIT",
  date: "2026-11-14",
  time: "10:00",
  timeZone: "Asia/Shanghai",
  location: {
    name: "西湖",
    address: "杭州",
    city: "杭州",
    coordinates: { lng: 120.15, lat: 30.25, coordinateSystem: "WGS84" },
  },
  source: { userId: "preview-user", name: "预览作者", image: null },
  photos: [
    {
      assetId: "preview-photo",
      url: previewImage,
      caption: "湖畔",
      location: null,
      isCover: true,
      canEdit: true,
      source: { userId: "preview-user", name: "预览作者", image: null },
    },
  ],
  receipts: [],
  canEdit: true,
  canRemove: true,
  createdAt: "2026-11-14T02:00:00Z",
  updatedAt: "2026-11-14T02:00:00Z",
}
export const previewJourney: JourneySnapshot = {
  id: "preview-journey",
  ownerId: "preview-user",
  role: "OWNER",
  revision: 12,
  title: "杭州三日游",
  description: "慢慢走过城市",
  status: "ACTIVE",
  visibility: "PRIVATE",
  events: [previewEvent],
  createdAt: previewEvent.createdAt,
  updatedAt: previewEvent.updatedAt,
}
export type PreviewVariant = "ready" | "empty" | "busy" | "error" | "conflict"
