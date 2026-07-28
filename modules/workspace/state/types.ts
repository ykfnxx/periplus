import type { StateCreator } from "zustand"
import type { LngLatTuple } from "@/lib/routes/edge-geometry"
import type { RoutePlanBundle, RoutePlanFailure } from "@/lib/routes/planning"
import type { RouteViewLevel } from "@/lib/routes/active-path"
import type { DraftRoute, PathNode } from "@/types/route"
import type { PhotoShare } from "@/types/photo"
import type {
  MapFocusRequest,
  MapFocusTarget,
} from "@/modules/workspace/contracts"

export type MapType = "standard" | "satellite" | "terrain"
export type LocationSelectionMode = "none" | "photo" | "point" | "upload-photo"
export type DraftSaveState = "idle" | "saving" | "success" | "error"
export type ActiveMapPanel = "none" | "photo" | "saved" | "settings"
export type ChatMessageRole = "user" | "assistant"
export type AgentMode = "auto" | "suggest"
export type WorkbenchTab = "preview" | "chat"
export type AgentSender = (type: string, payload?: unknown) => void
export type AnchorType = "route" | "photo"

export interface ScatteredAnchor {
  id: string
  type: AnchorType
  originalPixel: { x: number; y: number }
  scatterOffset: { x: number; y: number }
}

export interface AnchorClusterState {
  isScattered: boolean
  scatterCenter: { x: number; y: number } | null
  scatteredAnchors: ScatteredAnchor[]
}

export interface PointSelectionDraft {
  lat: number
  lng: number
}

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  content: string
  runId?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface PendingSuggestion {
  id: string
  title: string
  summary: string
  toolCallCount: number
  draftRevision: number
  createdAt: string
  updatedAt: string
}

export interface PendingPhotoUpload {
  file: File
  imageDataUrl: string
}

export interface MapAnchor {
  lat: number
  lng: number
}

export interface UploadPhoto {
  id: string
  file: File
  previewUrl: string
  lat?: number
  lng?: number
  caption?: string
  hasGPS: boolean
}

export interface MapRuntimeSlice {
  map: AMap.Map | null
  setMap: (map: AMap.Map | null) => void
  mapReady: boolean
  mapError: string | null
  setMapError: (error: string | null) => void
  mapFocusRequest: MapFocusRequest | null
  requestMapFocus: (target: MapFocusTarget) => void
  clearMapFocusRequest: (requestId: number) => void
  mapType: MapType
  setMapType: (type: MapType) => void
}

export interface DraftSlice {
  draftRoute: DraftRoute | null
  setDraftRoute: (route: DraftRoute | null) => void
  edgeGeometries: Record<string, LngLatTuple[]>
  mergeEdgeGeometries: (entries: Record<string, LngLatTuple[]>) => void
  markRoutePlansPlanning: (edgeIds: string[]) => void
  applyRoutePlanBundles: (bundles: RoutePlanBundle[]) => void
  markRoutePlanFailures: (failures: RoutePlanFailure[]) => void
  selectRoutePlan: (edgeId: string, planId: string) => void
  isDraftLocked: boolean
  setDraftLocked: (isDraftLocked: boolean) => void
  draftSaveState: DraftSaveState
  setDraftSaveState: (draftSaveState: DraftSaveState) => void
}

export interface AgentSlice {
  agentMode: AgentMode
  setAgentMode: (agentMode: AgentMode) => void
  pendingSuggestions: PendingSuggestion[]
  setPendingSuggestions: (pendingSuggestions: PendingSuggestion[]) => void
  chatMessages: ChatMessage[]
  addUserMessage: (content: string) => void
  appendAssistantMessage: (content: string) => void
  setChatMessages: (chatMessages: ChatMessage[]) => void
  clearChatMessages: () => void
  sendAgentEvent: AgentSender | null
  setAgentSender: (sendAgentEvent: AgentSender | null) => void
}

export interface WorkspaceUiSlice {
  viewLevel: RouteViewLevel
  activeRouteNodeId: string | null
  enterCityView: (routeNodeId: string) => void
  returnToOverview: () => void
  selectedEdgeId: string | null
  setSelectedEdgeId: (edgeId: string | null) => void
  selectedLocationPoint: PathNode | null
  selectedLocationAnchor: MapAnchor | null
  setSelectedLocationPoint: (point: PathNode | null, anchor?: MapAnchor) => void
  activeMapPanel: ActiveMapPanel
  setActiveMapPanel: (panel: ActiveMapPanel) => void
  workbenchTab: WorkbenchTab
  setWorkbenchTab: (workbenchTab: WorkbenchTab) => void
  composerInput: string
  setComposerInput: (input: string) => void
}

export interface PhotoSlice {
  pointSelectionDraft: PointSelectionDraft | null
  setPointSelectionDraft: (draft: PointSelectionDraft | null) => void
  locationSelectionMode: LocationSelectionMode
  startPhotoLocationSelection: (file: File, imageDataUrl: string) => void
  startPointLocationSelection: () => void
  clearLocationSelection: () => void
  photoShares: PhotoShare[]
  setPhotoShares: (photos: PhotoShare[]) => void
  addPhotoShare: (photo: PhotoShare) => void
  upsertPhotoShare: (photo: PhotoShare) => void
  removePhotoShare: (id: string) => void
  updatePhotoShareCaption: (id: string, caption: string) => void
  selectedPhotoShare: PhotoShare | null
  selectedPhotoAnchor: MapAnchor | null
  setSelectedPhotoShare: (photo: PhotoShare | null, anchor?: MapAnchor) => void
  lightboxPhotoShare: PhotoShare | null
  setLightboxPhotoShare: (photo: PhotoShare | null) => void
  pendingPhotoUpload: PendingPhotoUpload | null
  pendingPhotoDataUrl: string | null
  uploadLocationSelectionPhotoId: string | null
  isSelectingLocation: boolean
  anchorCluster: AnchorClusterState
  setAnchorCluster: (cluster: AnchorClusterState) => void
  expandCluster: (
    center: { x: number; y: number },
    anchors: ScatteredAnchor[]
  ) => void
  collapseCluster: () => void
  uploadModalOpen: boolean
  setUploadModalOpen: (open: boolean) => void
  uploadStep: 1 | 2 | 3
  setUploadStep: (step: 1 | 2 | 3) => void
  uploadPhotos: UploadPhoto[]
  setUploadPhotos: (
    photos: UploadPhoto[] | ((prev: UploadPhoto[]) => UploadPhoto[])
  ) => void
  addUploadPhoto: (photo: UploadPhoto) => void
  updateUploadPhoto: (id: string, updates: Partial<UploadPhoto>) => void
  startUploadPhotoLocationSelection: (photoId: string) => void
  clearUploadState: () => void
}

export interface WorkspaceState
  extends
    MapRuntimeSlice,
    DraftSlice,
    AgentSlice,
    WorkspaceUiSlice,
    PhotoSlice {}

export type WorkspaceSlice<TSlice> = StateCreator<
  WorkspaceState,
  [],
  [],
  TSlice
>
