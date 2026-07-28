import { beforeEach, describe, expect, it } from "vitest"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

describe("workspace store UI state", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      map: null,
      mapReady: false,
      mapError: null,
      mapFocusRequest: null,
      composerInput: "",
      chatMessages: [],
      activeMapPanel: "none",
      pointSelectionDraft: null,
      locationSelectionMode: "none",
      pendingPhotoDataUrl: null,
      pendingPhotoUpload: null,
      isSelectingLocation: false,
      photoShares: [],
      selectedLocationPoint: null,
      selectedLocationAnchor: null,
      selectedPhotoShare: null,
      selectedPhotoAnchor: null,
      lightboxPhotoShare: null,
      anchorCluster: {
        isScattered: false,
        scatterCenter: null,
        scatteredAnchors: [],
      },
    })
  })

  it("tracks map readiness without exposing the SDK to workbench views", () => {
    const map = {} as AMap.Map
    useWorkspaceStore.getState().setMap(map)
    expect(useWorkspaceStore.getState()).toMatchObject({
      map,
      mapReady: true,
    })

    useWorkspaceStore.getState().setMap(null)
    expect(useWorkspaceStore.getState().mapReady).toBe(false)
  })

  it("publishes semantic map focus requests", () => {
    useWorkspaceStore.getState().requestMapFocus({
      type: "node",
      nodeId: "node-1",
      zoom: 12,
    })

    expect(useWorkspaceStore.getState().mapFocusRequest).toEqual({
      requestId: 1,
      target: {
        type: "node",
        nodeId: "node-1",
        zoom: 12,
      },
    })

    useWorkspaceStore.getState().clearMapFocusRequest(1)
    expect(useWorkspaceStore.getState().mapFocusRequest).toBeNull()
  })

  it("switches map panels", () => {
    useWorkspaceStore.getState().setActiveMapPanel("saved")
    expect(useWorkspaceStore.getState().activeMapPanel).toBe("saved")
  })

  it("preserves the composer input outside map panel switching", () => {
    useWorkspaceStore.getState().setComposerInput("帮我把敦煌多留半天")
    useWorkspaceStore.getState().setActiveMapPanel("photo")
    expect(useWorkspaceStore.getState().composerInput).toBe(
      "帮我把敦煌多留半天"
    )
  })

  it("stores user and assistant chat messages", () => {
    useWorkspaceStore.getState().addUserMessage("规划新疆路线")
    useWorkspaceStore.getState().appendAssistantMessage("可以。")
    useWorkspaceStore.getState().appendAssistantMessage("先去乌鲁木齐。")

    expect(useWorkspaceStore.getState().chatMessages).toMatchObject([
      { role: "user", content: "规划新疆路线" },
      { role: "assistant", content: "可以。先去乌鲁木齐。" },
    ])
  })

  it("restores chat messages from the backend session", () => {
    useWorkspaceStore.getState().setChatMessages([
      {
        id: "message-1",
        role: "user",
        content: "规划新疆路线",
        runId: null,
      },
      {
        id: "message-2",
        role: "assistant",
        content: "已规划。",
        runId: "run-1",
      },
    ])

    expect(useWorkspaceStore.getState().chatMessages).toMatchObject([
      { id: "message-1", role: "user", content: "规划新疆路线" },
      { id: "message-2", role: "assistant", content: "已规划。" },
    ])
  })

  it("starts point location selection without exposing a workbench tool", () => {
    useWorkspaceStore.getState().startPointLocationSelection()
    expect(useWorkspaceStore.getState()).toMatchObject({
      locationSelectionMode: "point",
      isSelectingLocation: true,
      pointSelectionDraft: null,
    })
  })

  it("starts photo location selection from the photo panel", () => {
    const file = new File(["photo"], "photo.png", { type: "image/png" })
    useWorkspaceStore.getState().startPhotoLocationSelection(file, "data-url")
    expect(useWorkspaceStore.getState()).toMatchObject({
      pendingPhotoUpload: { file, imageDataUrl: "data-url" },
      pendingPhotoDataUrl: "data-url",
      locationSelectionMode: "photo",
      isSelectingLocation: true,
      activeMapPanel: "photo",
      pointSelectionDraft: null,
    })
  })

  it("clears active location selection state", () => {
    useWorkspaceStore.setState({
      pendingPhotoUpload: {
        file: new File(["photo"], "photo.png", { type: "image/png" }),
        imageDataUrl: "data-url",
      },
      pendingPhotoDataUrl: "data-url",
      pointSelectionDraft: { lat: 31.23, lng: 121.47 },
      isSelectingLocation: true,
      locationSelectionMode: "point",
    })

    useWorkspaceStore.getState().clearLocationSelection()

    expect(useWorkspaceStore.getState()).toMatchObject({
      pendingPhotoUpload: null,
      pendingPhotoDataUrl: null,
      pointSelectionDraft: { lat: 31.23, lng: 121.47 },
      isSelectingLocation: false,
      locationSelectionMode: "none",
    })
  })

  it("clears selected and lightbox photo state when a photo is removed", () => {
    const photo = {
      id: "photo-1",
      ownerId: "user-1",
      ownerName: "User One",
      lat: 31.23,
      lng: 121.47,
      imageDataUrl: "data:image/png;base64,abc",
      caption: "日落",
      createdAt: 1,
      canDelete: true,
    }

    useWorkspaceStore.setState({
      photoShares: [photo],
      selectedPhotoShare: photo,
      lightboxPhotoShare: photo,
    })

    useWorkspaceStore.getState().removePhotoShare("photo-1")

    expect(useWorkspaceStore.getState()).toMatchObject({
      photoShares: [],
      selectedPhotoShare: null,
      lightboxPhotoShare: null,
    })
  })

  it("keeps route and photo info windows mutually exclusive", () => {
    const point = {
      id: "point-1",
      name: "测试点",
      lat: 31.23,
      lng: 121.47,
      order: 0,
      category: "PLACE" as const,
    }
    const photo = {
      id: "photo-1",
      ownerId: "user-1",
      ownerName: "User One",
      lat: 31.23,
      lng: 121.47,
      imageDataUrl: "data:image/png;base64,abc",
      caption: "日落",
      createdAt: 1,
      canDelete: true,
    }

    useWorkspaceStore
      .getState()
      .setSelectedPhotoShare(photo, { lat: 10, lng: 20 })
    useWorkspaceStore
      .getState()
      .setSelectedLocationPoint(point, { lat: 30, lng: 40 })

    expect(useWorkspaceStore.getState()).toMatchObject({
      selectedLocationPoint: point,
      selectedLocationAnchor: { lat: 30, lng: 40 },
      selectedPhotoShare: null,
      selectedPhotoAnchor: null,
    })

    useWorkspaceStore
      .getState()
      .setSelectedPhotoShare(photo, { lat: 50, lng: 60 })

    expect(useWorkspaceStore.getState()).toMatchObject({
      selectedLocationPoint: null,
      selectedLocationAnchor: null,
      selectedPhotoShare: photo,
      selectedPhotoAnchor: { lat: 50, lng: 60 },
    })
  })

  it("collapses map-owned cluster state without changing workspace selection", () => {
    const point = {
      id: "point-1",
      name: "测试点",
      lat: 31.23,
      lng: 121.47,
      order: 0,
      category: "PLACE" as const,
    }
    const photo = {
      id: "photo-1",
      ownerId: "user-1",
      ownerName: "User One",
      lat: 31.23,
      lng: 121.47,
      imageDataUrl: "data:image/png;base64,abc",
      caption: "日落",
      createdAt: 1,
      canDelete: true,
    }

    useWorkspaceStore.setState({
      selectedLocationPoint: point,
      selectedLocationAnchor: { lat: 10, lng: 20 },
      selectedPhotoShare: photo,
      selectedPhotoAnchor: { lat: 30, lng: 40 },
      anchorCluster: {
        isScattered: true,
        scatterCenter: { x: 12, y: 24 },
        scatteredAnchors: [
          {
            id: "route-point-1",
            type: "route",
            originalPixel: { x: 12, y: 24 },
            scatterOffset: { x: 4, y: -8 },
          },
        ],
      },
    })

    useWorkspaceStore.getState().collapseCluster()

    expect(useWorkspaceStore.getState()).toMatchObject({
      selectedLocationPoint: point,
      selectedLocationAnchor: { lat: 10, lng: 20 },
      selectedPhotoShare: photo,
      selectedPhotoAnchor: { lat: 30, lng: 40 },
      anchorCluster: {
        isScattered: false,
        scatterCenter: null,
        scatteredAnchors: [],
      },
    })
  })
})
