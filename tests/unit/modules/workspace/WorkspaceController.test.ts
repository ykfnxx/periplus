import { beforeEach, describe, expect, it } from "vitest"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

const draftRoute = {
  id: "draft-route-1",
  name: "杭州周末",
  nodes: [
    {
      id: "node-1",
      name: "杭州",
      lat: 30.2741,
      lng: 120.1551,
      order: 0,
      category: "CITY" as const,
    },
  ],
  edges: [],
  subPlans: [],
}

describe("WorkspaceController map intents", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      draftRoute,
      viewLevel: "overview",
      activeRouteNodeId: null,
      activeMapPanel: "none",
      selectedEdgeId: null,
      selectedLocationPoint: null,
      selectedLocationAnchor: null,
      selectedPhotoShare: null,
      selectedPhotoAnchor: null,
      lightboxPhotoShare: null,
      pointSelectionDraft: null,
      isSelectingLocation: false,
      locationSelectionMode: "none",
      anchorCluster: {
        isScattered: false,
        scatterCenter: null,
        scatteredAnchors: [],
      },
    })
  })

  it("turns a waypoint click into workspace navigation", () => {
    dispatchMapIntent({
      type: "map.waypoint-selected",
      waypointId: "node-1",
    })

    expect(useWorkspaceStore.getState()).toMatchObject({
      viewLevel: "city",
      activeRouteNodeId: "node-1",
    })
  })

  it("turns map edge clicks into a toggleable selection", () => {
    dispatchMapIntent({ type: "map.edge-selected", edgeId: "edge-1" })
    expect(useWorkspaceStore.getState().selectedEdgeId).toBe("edge-1")

    dispatchMapIntent({ type: "map.edge-selected", edgeId: "edge-1" })
    expect(useWorkspaceStore.getState().selectedEdgeId).toBeNull()
  })

  it("applies location picks according to the active workspace mode", () => {
    useWorkspaceStore.setState({
      isSelectingLocation: true,
      locationSelectionMode: "point",
    })

    dispatchMapIntent({
      type: "map.location-picked",
      coordinate: { lat: 30.25, lng: 120.16 },
    })

    expect(useWorkspaceStore.getState()).toMatchObject({
      pointSelectionDraft: { lat: 30.25, lng: 120.16 },
      isSelectingLocation: false,
      locationSelectionMode: "none",
    })
  })

  it("clears screen selection when the map background is clicked", () => {
    useWorkspaceStore.setState({
      activeMapPanel: "saved",
      selectedEdgeId: "edge-1",
      selectedLocationPoint: draftRoute.nodes[0],
      anchorCluster: {
        isScattered: true,
        scatterCenter: { x: 10, y: 20 },
        scatteredAnchors: [],
      },
    })

    dispatchMapIntent({ type: "map.background-clicked" })

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeMapPanel: "none",
      selectedEdgeId: null,
      selectedLocationPoint: null,
      anchorCluster: {
        isScattered: false,
        scatterCenter: null,
        scatteredAnchors: [],
      },
    })
  })
})
