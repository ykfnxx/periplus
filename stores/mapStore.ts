import { create } from "zustand"
import type { Route, RouteNode } from "@/types/route"

export type MapType = "standard" | "satellite" | "terrain"
export type LocationSelectionMode = "none" | "photo" | "point"
export type DraftSaveState = "idle" | "saving" | "success" | "error"
export type ActiveMapPanel = "none" | "photo" | "saved" | "settings"
export type ChatMessageRole = "user" | "assistant"
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

export interface PendingPhotoUpload {
  file: File
  imageDataUrl: string
}

export interface PhotoShare {
  id: string
  ownerId: string
  ownerName: string
  lat: number
  lng: number
  imageDataUrl: string
  caption: string
  createdAt: number
  updatedAt?: number
  canDelete: boolean
}

export interface MapAnchor {
  lat: number
  lng: number
}

interface MapState {
  map: AMap.Map | null
  setMap: (map: AMap.Map | null) => void
  currentRoute: Route | null
  setCurrentRoute: (route: Route | null) => void
  isDraftLocked: boolean
  setDraftLocked: (isDraftLocked: boolean) => void
  draftSaveState: DraftSaveState
  setDraftSaveState: (draftSaveState: DraftSaveState) => void
  chatMessages: ChatMessage[]
  addUserMessage: (content: string) => void
  appendAssistantMessage: (content: string) => void
  setChatMessages: (chatMessages: ChatMessage[]) => void
  clearChatMessages: () => void
  sendAgentEvent: AgentSender | null
  setAgentSender: (sendAgentEvent: AgentSender | null) => void
  selectedLocationPoint: RouteNode | null
  selectedLocationAnchor: MapAnchor | null
  setSelectedLocationPoint: (
    point: RouteNode | null,
    anchor?: MapAnchor
  ) => void
  mapType: MapType
  setMapType: (type: MapType) => void
  activeMapPanel: ActiveMapPanel
  setActiveMapPanel: (panel: ActiveMapPanel) => void
  composerInput: string
  setComposerInput: (input: string) => void
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
  isSelectingLocation: boolean
  anchorCluster: AnchorClusterState
  setAnchorCluster: (cluster: AnchorClusterState) => void
  expandCluster: (
    center: { x: number; y: number },
    anchors: ScatteredAnchor[]
  ) => void
  collapseCluster: () => void
}

function createChatMessage(
  role: ChatMessageRole,
  content: string
): ChatMessage {
  return { id: `message-${Date.now()}-${Math.random()}`, role, content }
}

export const useMapStore = create<MapState>((set) => ({
  map: null,
  setMap: (map) => set({ map }),
  currentRoute: null,
  setCurrentRoute: (currentRoute) => set({ currentRoute }),
  isDraftLocked: false,
  setDraftLocked: (isDraftLocked) => set({ isDraftLocked }),
  draftSaveState: "idle",
  setDraftSaveState: (draftSaveState) => set({ draftSaveState }),
  chatMessages: [],
  addUserMessage: (content) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        createChatMessage("user", content),
      ].slice(-80),
    })),
  appendAssistantMessage: (content) =>
    set((state) => ({
      chatMessages:
        state.chatMessages.at(-1)?.role === "assistant"
          ? state.chatMessages.map((message, index) =>
              index === state.chatMessages.length - 1
                ? { ...message, content: message.content + content }
                : message
            )
          : [
              ...state.chatMessages,
              createChatMessage("assistant", content),
            ].slice(-80),
    })),
  setChatMessages: (chatMessages) => set({ chatMessages }),
  clearChatMessages: () => set({ chatMessages: [] }),
  sendAgentEvent: null,
  setAgentSender: (sendAgentEvent) => set({ sendAgentEvent }),
  selectedLocationPoint: null,
  selectedLocationAnchor: null,
  setSelectedLocationPoint: (selectedLocationPoint, anchor) =>
    set({
      selectedLocationPoint,
      selectedLocationAnchor: anchor ?? null,
      ...(selectedLocationPoint
        ? { selectedPhotoShare: null, selectedPhotoAnchor: null }
        : {}),
    }),
  mapType: "standard",
  setMapType: (mapType) => set({ mapType }),
  activeMapPanel: "none",
  setActiveMapPanel: (activeMapPanel) => set({ activeMapPanel }),
  composerInput: "",
  setComposerInput: (composerInput) => set({ composerInput }),
  pointSelectionDraft: null,
  setPointSelectionDraft: (pointSelectionDraft) => set({ pointSelectionDraft }),
  locationSelectionMode: "none",
  startPhotoLocationSelection: (file, imageDataUrl) =>
    set({
      pendingPhotoUpload: { file, imageDataUrl },
      pendingPhotoDataUrl: imageDataUrl,
      isSelectingLocation: true,
      locationSelectionMode: "photo",
      activeMapPanel: "photo",
      pointSelectionDraft: null,
    }),
  startPointLocationSelection: () =>
    set({
      pendingPhotoUpload: null,
      pendingPhotoDataUrl: null,
      pointSelectionDraft: null,
      isSelectingLocation: true,
      locationSelectionMode: "point",
    }),
  clearLocationSelection: () =>
    set({
      pendingPhotoUpload: null,
      pendingPhotoDataUrl: null,
      isSelectingLocation: false,
      locationSelectionMode: "none",
    }),
  photoShares: [],
  setPhotoShares: (photoShares) => set({ photoShares }),
  addPhotoShare: (photo) =>
    set((state) => ({
      photoShares: [photo, ...state.photoShares],
    })),
  upsertPhotoShare: (photo) =>
    set((state) => ({
      photoShares: state.photoShares.some(
        (existing) => existing.id === photo.id
      )
        ? state.photoShares.map((existing) =>
            existing.id === photo.id ? photo : existing
          )
        : [photo, ...state.photoShares],
      selectedPhotoShare:
        state.selectedPhotoShare?.id === photo.id
          ? photo
          : state.selectedPhotoShare,
      lightboxPhotoShare:
        state.lightboxPhotoShare?.id === photo.id
          ? photo
          : state.lightboxPhotoShare,
    })),
  removePhotoShare: (id) =>
    set((state) => {
      const newShares = state.photoShares.filter((p) => p.id !== id)
      const newSelected =
        state.selectedPhotoShare?.id === id ? null : state.selectedPhotoShare
      const newLightbox =
        state.lightboxPhotoShare?.id === id ? null : state.lightboxPhotoShare
      return {
        photoShares: newShares,
        selectedPhotoShare: newSelected,
        lightboxPhotoShare: newLightbox,
      }
    }),
  updatePhotoShareCaption: (id, caption) =>
    set((state) => {
      const newShares = state.photoShares.map((p) =>
        p.id === id ? { ...p, caption } : p
      )
      const newSelected =
        state.selectedPhotoShare?.id === id
          ? { ...state.selectedPhotoShare, caption }
          : state.selectedPhotoShare
      return { photoShares: newShares, selectedPhotoShare: newSelected }
    }),
  selectedPhotoShare: null,
  selectedPhotoAnchor: null,
  setSelectedPhotoShare: (selectedPhotoShare, anchor) =>
    set({
      selectedPhotoShare,
      selectedPhotoAnchor: anchor ?? null,
      ...(selectedPhotoShare
        ? { selectedLocationPoint: null, selectedLocationAnchor: null }
        : {}),
    }),
  lightboxPhotoShare: null,
  setLightboxPhotoShare: (lightboxPhotoShare) => set({ lightboxPhotoShare }),
  pendingPhotoUpload: null,
  pendingPhotoDataUrl: null,
  isSelectingLocation: false,
  anchorCluster: {
    isScattered: false,
    scatterCenter: null,
    scatteredAnchors: [],
  },
  setAnchorCluster: (anchorCluster) => set({ anchorCluster }),
  expandCluster: (center, anchors) =>
    set({
      anchorCluster: {
        isScattered: true,
        scatterCenter: center,
        scatteredAnchors: anchors,
      },
    }),
  collapseCluster: () =>
    set({
      anchorCluster: {
        isScattered: false,
        scatterCenter: null,
        scatteredAnchors: [],
      },
      selectedLocationPoint: null,
      selectedLocationAnchor: null,
      selectedPhotoShare: null,
      selectedPhotoAnchor: null,
    }),
}))
