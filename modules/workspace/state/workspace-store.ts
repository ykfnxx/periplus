import { create } from "zustand"
import { createAgentSlice } from "./slices/agent-slice"
import { createWorkspaceDocumentSlice } from "./slices/workspace-document-slice"
import { createMapRuntimeSlice } from "./slices/map-runtime-slice"
import { createPhotoSlice } from "./slices/photo-slice"
import { createWorkspaceUiSlice } from "./slices/workspace-ui-slice"
import type { WorkspaceState } from "./types"

export const useWorkspaceStore = create<WorkspaceState>((...args) => ({
  ...createMapRuntimeSlice(...args),
  ...createWorkspaceDocumentSlice(...args),
  ...createAgentSlice(...args),
  ...createWorkspaceUiSlice(...args),
  ...createPhotoSlice(...args),
}))
