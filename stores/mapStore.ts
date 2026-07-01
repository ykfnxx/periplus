import { create } from "zustand"
import type { Route, RoutePoint } from "@/types/route"

export type MapType = "standard" | "satellite" | "terrain"
export type LocationSelectionMode = "none" | "photo" | "point"
export type DraftSaveState = "idle" | "saving" | "success" | "error"
export type ActiveMapPanel = "none" | "photo" | "saved" | "settings"
export type ChatMessageRole = "user" | "assistant"
export type AgentSender = (type: string, payload?: unknown) => void

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

export interface PhotoShare {
  id: string
  lat: number
  lng: number
  imageDataUrl: string
  caption: string
  createdAt: number
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
  selectedLocationPoint: RoutePoint | null
  setSelectedLocationPoint: (point: RoutePoint | null) => void
  mapType: MapType
  setMapType: (type: MapType) => void
  activeMapPanel: ActiveMapPanel
  setActiveMapPanel: (panel: ActiveMapPanel) => void
  composerInput: string
  setComposerInput: (input: string) => void
  pointSelectionDraft: PointSelectionDraft | null
  setPointSelectionDraft: (draft: PointSelectionDraft | null) => void
  locationSelectionMode: LocationSelectionMode
  startPhotoLocationSelection: (imageDataUrl: string) => void
  startPointLocationSelection: () => void
  clearLocationSelection: () => void
  photoShares: PhotoShare[]
  addPhotoShare: (photo: Omit<PhotoShare, "id" | "createdAt">) => void
  removePhotoShare: (id: string) => void
  updatePhotoShareCaption: (id: string, caption: string) => void
  selectedPhotoShare: PhotoShare | null
  setSelectedPhotoShare: (photo: PhotoShare | null) => void
  pendingPhotoDataUrl: string | null
  isSelectingLocation: boolean
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
  setSelectedLocationPoint: (selectedLocationPoint) =>
    set({ selectedLocationPoint }),
  mapType: "standard",
  setMapType: (mapType) => set({ mapType }),
  activeMapPanel: "none",
  setActiveMapPanel: (activeMapPanel) => set({ activeMapPanel }),
  composerInput: "",
  setComposerInput: (composerInput) => set({ composerInput }),
  pointSelectionDraft: null,
  setPointSelectionDraft: (pointSelectionDraft) => set({ pointSelectionDraft }),
  locationSelectionMode: "none",
  startPhotoLocationSelection: (imageDataUrl) =>
    set({
      pendingPhotoDataUrl: imageDataUrl,
      isSelectingLocation: true,
      locationSelectionMode: "photo",
      activeMapPanel: "photo",
      pointSelectionDraft: null,
    }),
  startPointLocationSelection: () =>
    set({
      pendingPhotoDataUrl: null,
      pointSelectionDraft: null,
      isSelectingLocation: true,
      locationSelectionMode: "point",
    }),
  clearLocationSelection: () =>
    set({
      pendingPhotoDataUrl: null,
      isSelectingLocation: false,
      locationSelectionMode: "none",
    }),
  photoShares: [],
  addPhotoShare: (photo) =>
    set((state) => ({
      photoShares: [
        ...state.photoShares,
        { ...photo, id: `photo-${Date.now()}`, createdAt: Date.now() },
      ],
    })),
  removePhotoShare: (id) =>
    set((state) => {
      const newShares = state.photoShares.filter((p) => p.id !== id)
      const newSelected =
        state.selectedPhotoShare?.id === id ? null : state.selectedPhotoShare
      return { photoShares: newShares, selectedPhotoShare: newSelected }
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
  setSelectedPhotoShare: (selectedPhotoShare) => set({ selectedPhotoShare }),
  pendingPhotoDataUrl: null,
  isSelectingLocation: false,
}))
