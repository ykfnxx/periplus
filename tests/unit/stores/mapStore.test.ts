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
      isSelectingLocation: false,
      photoShares: [],
      selectedPhotoShare: null,
      lightboxPhotoShare: null,
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
    useMapStore.getState().startPhotoLocationSelection("data-url")
    expect(useMapStore.getState()).toMatchObject({
      pendingPhotoDataUrl: "data-url",
      locationSelectionMode: "photo",
      isSelectingLocation: true,
      activeMapPanel: "photo",
      pointSelectionDraft: null,
    })
  })

  it("clears active location selection state", () => {
    useMapStore.setState({
      pendingPhotoDataUrl: "data-url",
      pointSelectionDraft: { lat: 31.23, lng: 121.47 },
      isSelectingLocation: true,
      locationSelectionMode: "point",
    })

    useMapStore.getState().clearLocationSelection()

    expect(useMapStore.getState()).toMatchObject({
      pendingPhotoDataUrl: null,
      pointSelectionDraft: { lat: 31.23, lng: 121.47 },
      isSelectingLocation: false,
      locationSelectionMode: "none",
    })
  })

  it("clears selected and lightbox photo state when a photo is removed", () => {
    const photo = {
      id: "photo-1",
      lat: 31.23,
      lng: 121.47,
      imageDataUrl: "data:image/png;base64,abc",
      caption: "日落",
      createdAt: 1,
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
})
