import type { StateCreator } from "zustand"
import type {
  TargetWorkspaceMessage,
  TargetWorkspaceDocument,
} from "@/modules/data-model/contracts"
import type {
  MapFocusRequest,
  MapFocusTarget,
  ViewportInsets,
} from "@/modules/workspace/contracts"

export type MapType = "standard" | "satellite" | "terrain"
export type ActiveMapPanel = "none" | "settings"
export type ChatMessageRole = "user" | "assistant"
export type WorkbenchTab = "preview" | "chat"
export type MobileSheetSnap = "collapsed" | "half" | "expanded"
export type AgentSender = (type: string, payload?: unknown) => void
export type AgentRunStage =
  | "UNDERSTANDING"
  | "VERIFYING_PLACES"
  | "CHECKING_ROUTE"
  | "COMMITTING"

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  content: string
  blocks?: TargetWorkspaceMessage["blocks"]
  runId?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface MapAnchor {
  lat: number
  lng: number
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
  hoveredEventId: string | null
  setHoveredEventId: (eventId: string | null) => void
  mapViewportInsets: ViewportInsets
  setMapViewportInsets: (insets: ViewportInsets) => void
  selectedEventId: string | null
  selectedEventAnchor: MapAnchor | null
  selectEvent: (eventId: string | null, anchor?: MapAnchor) => void
  activeMapPanel: ActiveMapPanel
  setActiveMapPanel: (panel: ActiveMapPanel) => void
  workbenchTab: WorkbenchTab
  setWorkbenchTab: (workbenchTab: WorkbenchTab) => void
  mobileSheetSnap: MobileSheetSnap
  setMobileSheetSnap: (snap: MobileSheetSnap) => void
  composerInput: string
  setComposerInput: (input: string) => void
}

export interface WorkspaceState
  extends
    MapRuntimeSlice,
    WorkspaceDocumentSlice,
    AgentSlice,
    WorkspaceUiSlice {}

export type WorkspaceSlice<TSlice> = StateCreator<
  WorkspaceState,
  [],
  [],
  TSlice
>
