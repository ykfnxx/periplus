import { create } from "zustand"
import { createAgentSlice } from "./slices/agent-slice"
import { createDraftSlice } from "./slices/draft-slice"
import { createMapRuntimeSlice } from "./slices/map-runtime-slice"
import { createPhotoSlice } from "./slices/photo-slice"
import { createWorkspaceUiSlice } from "./slices/workspace-ui-slice"
import type { WorkspaceState } from "./types"

export const useWorkspaceStore = create<WorkspaceState>((...args) => ({
  ...createMapRuntimeSlice(...args),
  ...createDraftSlice(...args),
  ...createAgentSlice(...args),
  ...createWorkspaceUiSlice(...args),
  ...createPhotoSlice(...args),
}))
