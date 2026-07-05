import { beforeEach, describe, expect, it } from "vitest"
import { useMapStore } from "@/stores/mapStore"

describe("mapStore UI state", () => {
  beforeEach(() => {
    useMapStore.setState({
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

  it("switches map panels", () => {
    useMapStore.getState().setActiveMapPanel("saved")
    expect(useMapStore.getState().activeMapPanel).toBe("saved")
  })

  it("preserves the composer input outside map panel switching", () => {
    useMapStore.getState().setComposerInput("帮我把敦煌多留半天")
    useMapStore.getState().setActiveMapPanel("photo")
    expect(useMapStore.getState().composerInput).toBe("帮我把敦煌多留半天")
  })

  it("stores user and assistant chat messages", () => {
    useMapStore.getState().addUserMessage("规划新疆路线")
    useMapStore.getState().appendAssistantMessage("可以。")
    useMapStore.getState().appendAssistantMessage("先去乌鲁木齐。")

    expect(useMapStore.getState().chatMessages).toMatchObject([
      { role: "user", content: "规划新疆路线" },
      { role: "assistant", content: "可以。先去乌鲁木齐。" },
    ])
  })

  it("restores chat messages from the backend session", () => {
    useMapStore.getState().setChatMessages([
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

    expect(useMapStore.getState().chatMessages).toMatchObject([
      { id: "message-1", role: "user", content: "规划新疆路线" },
      { id: "message-2", role: "assistant", content: "已规划。" },
    ])
  })

  it("starts point location selection without exposing a workbench tool", () => {
    useMapStore.getState().startPointLocationSelection()
    expect(useMapStore.getState()).toMatchObject({
      locationSelectionMode: "point",
      isSelectingLocation: true,
      pointSelectionDraft: null,
    })
  })

  it("starts photo location selection from the photo panel", () => {
    const file = new File(["photo"], "photo.png", { type: "image/png" })
    useMapStore.getState().startPhotoLocationSelection(file, "data-url")
    expect(useMapStore.getState()).toMatchObject({
      pendingPhotoUpload: { file, imageDataUrl: "data-url" },
      pendingPhotoDataUrl: "data-url",
      locationSelectionMode: "photo",
      isSelectingLocation: true,
      activeMapPanel: "photo",
      pointSelectionDraft: null,
    })
  })

  it("clears active location selection state", () => {
    useMapStore.setState({
      pendingPhotoUpload: {
        file: new File(["photo"], "photo.png", { type: "image/png" }),
        imageDataUrl: "data-url",
      },
      pendingPhotoDataUrl: "data-url",
      pointSelectionDraft: { lat: 31.23, lng: 121.47 },
      isSelectingLocation: true,
      locationSelectionMode: "point",
    })

    useMapStore.getState().clearLocationSelection()

    expect(useMapStore.getState()).toMatchObject({
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

    useMapStore.setState({
      photoShares: [photo],
      selectedPhotoShare: photo,
      lightboxPhotoShare: photo,
    })

    useMapStore.getState().removePhotoShare("photo-1")

    expect(useMapStore.getState()).toMatchObject({
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

    useMapStore.getState().setSelectedPhotoShare(photo, { lat: 10, lng: 20 })
    useMapStore.getState().setSelectedLocationPoint(point, { lat: 30, lng: 40 })

    expect(useMapStore.getState()).toMatchObject({
      selectedLocationPoint: point,
      selectedLocationAnchor: { lat: 30, lng: 40 },
      selectedPhotoShare: null,
      selectedPhotoAnchor: null,
    })

    useMapStore.getState().setSelectedPhotoShare(photo, { lat: 50, lng: 60 })

    expect(useMapStore.getState()).toMatchObject({
      selectedLocationPoint: null,
      selectedLocationAnchor: null,
      selectedPhotoShare: photo,
      selectedPhotoAnchor: { lat: 50, lng: 60 },
    })
  })

  it("clears scattered info-window anchors when a cluster collapses", () => {
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

    useMapStore.setState({
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

    useMapStore.getState().collapseCluster()

    expect(useMapStore.getState()).toMatchObject({
      selectedLocationPoint: null,
      selectedLocationAnchor: null,
      selectedPhotoShare: null,
      selectedPhotoAnchor: null,
      anchorCluster: {
        isScattered: false,
        scatterCenter: null,
        scatteredAnchors: [],
      },
    })
  })
})
