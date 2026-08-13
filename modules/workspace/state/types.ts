import type { StateCreator } from "zustand"
import type { JourneyViewLevel } from "@/lib/journeys/projections"
import type {
  TargetJourneyEvent,
  TargetWorkspaceMessage,
  TargetWorkspaceDocument,
} from "@/modules/data-model/contracts"
import type { PhotoShare } from "@/types/photo"
import type {
  MapFocusRequest,
  MapFocusTarget,
  ViewportInsets,
} from "@/modules/workspace/contracts"

export type MapType = "standard" | "satellite" | "terrain"
export type LocationSelectionMode = "none" | "photo" | "point" | "upload-photo"
export type ActiveMapPanel = "none" | "photo" | "saved" | "settings"
export type ChatMessageRole = "user" | "assistant"
export type WorkbenchTab = "preview" | "chat"
export type MobileSheetSnap = "collapsed" | "half" | "expanded"
export type AgentSender = (type: string, payload?: unknown) => void
export type AnchorType = "event" | "photo"
export type AgentRunStage =
  | "UNDERSTANDING"
  | "VERIFYING_PLACES"
  | "CHECKING_ROUTE"
  | "COMMITTING"

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
  blocks?: TargetWorkspaceMessage["blocks"]
  runId?: string | null
  createdAt?: string
  updatedAt?: string
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

export interface WorkspaceDocumentSlice {
  workspaceDocument: TargetWorkspaceDocument | null
  applyWorkspaceDocument: (document: TargetWorkspaceDocument | null) => boolean
  journeyCommitPresentation: JourneyCommitPresentation | null
  applyJourneyCommit: (
    document: TargetWorkspaceDocument,
    summary: string,
    changedEventIds: string[]
  ) => boolean
  clearJourneyCommitPresentation: (revision: number) => void
}

export interface JourneyCommitPresentation {
  revision: number
  summary: string
  changedEventIds: string[]
}

export interface AgentSlice {
  chatMessages: ChatMessage[]
  addUserMessage: (content: string) => void
  appendAssistantMessage: (content: string) => void
  setChatMessages: (chatMessages: ChatMessage[]) => void
  clearChatMessages: () => void
  sendAgentEvent: AgentSender | null
  setAgentSender: (sendAgentEvent: AgentSender | null) => void
  agentRunStage: AgentRunStage | null
  setAgentRunStage: (stage: AgentRunStage | null) => void
}

export interface WorkspaceUiSlice {
  viewLevel: JourneyViewLevel
  activeSectionEventId: string | null
  enterSectionView: (sectionEventId: string) => void
  returnToParentScope: () => void
  returnToOverview: () => void
  hoveredEventId: string | null
  setHoveredEventId: (eventId: string | null) => void
  mapViewportInsets: ViewportInsets
  setMapViewportInsets: (insets: ViewportInsets) => void
  selectedTransitEventId: string | null
  setSelectedTransitEventId: (eventId: string | null) => void
  selectedLocationEvent: Extract<
    TargetJourneyEvent,
    { type: "VISIT" | "STAY" | "MEAL" | "ACTIVITY" }
  > | null
  selectedLocationAnchor: MapAnchor | null
  setSelectedLocationEvent: (
    event: Extract<
      TargetJourneyEvent,
      { type: "VISIT" | "STAY" | "MEAL" | "ACTIVITY" }
    > | null,
    anchor?: MapAnchor
  ) => void
  activeMapPanel: ActiveMapPanel
  setActiveMapPanel: (panel: ActiveMapPanel) => void
  workbenchTab: WorkbenchTab
  setWorkbenchTab: (workbenchTab: WorkbenchTab) => void
  mobileSheetSnap: MobileSheetSnap
  setMobileSheetSnap: (snap: MobileSheetSnap) => void
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
    WorkspaceDocumentSlice,
    AgentSlice,
    WorkspaceUiSlice,
    PhotoSlice {}

export type WorkspaceSlice<TSlice> = StateCreator<
  WorkspaceState,
  [],
  [],
  TSlice
>
