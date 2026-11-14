import type { ReactNode } from "react"
import { act, render, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import JourneyLibraryScreen from "@/modules/travelogue/react/JourneyLibraryScreen"
const { list, remember } = vi.hoisted(() => ({
  list: vi.fn(),
  remember: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/modules/auth/adapters/better-auth", () => ({
  authClient: { useSession: () => ({ data: null }) },
  authApi: {},
}))
vi.mock("@/modules/travelogue/adapters/recording-http", () => ({
  recordingApi: { atlas: list },
}))
vi.mock("@/modules/travelogue/adapters/offline", () => ({
  prepareOfflineDrafts: async () => {},
}))
vi.mock("@/modules/travelogue/adapters/draft-indexeddb", () => ({
  draftStorage: {
    remember,
    context: async () => ({
      userId: "owner",
      journeys: [{ id: "saved", title: "缓存旅程" }],
    }),
    list: async () => [],
  },
}))
vi.mock("@/modules/travelogue/ui/library/JourneyLibrary", () => ({
  default: ({ draftEntry }: { draftEntry: ReactNode }) => <>{draftEntry}</>,
}))
it("does not overwrite cached draft targets while loading or after a failed directory load", async () => {
  let reject!: (cause: Error) => void
  list.mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail
    })
  )
  const view = render(<JourneyLibraryScreen userId="owner" />)
  await waitFor(() => expect(list).toHaveBeenCalledOnce())
  expect(remember).not.toHaveBeenCalled()
  await act(async () => reject(new Error("offline")))
  expect(remember).not.toHaveBeenCalled()
  view.unmount()
  list.mockResolvedValueOnce({
    journeys: [{ id: "fresh", title: "已加载旅程" }],
    photos: [],
  })
  render(<JourneyLibraryScreen userId="owner" />)
  await waitFor(() =>
    expect(remember).toHaveBeenCalledWith({
      userId: "owner",
      journeys: [{ id: "fresh", title: "已加载旅程" }],
    })
  )
})
