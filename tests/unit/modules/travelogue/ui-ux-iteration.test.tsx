import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  eventRouteBounds,
  standaloneTransitPath,
} from "@/lib/journeys/route-paths"
import type {
  JourneyEvent,
  JourneyMutation,
  JourneySnapshot,
} from "@/modules/data-model/contracts"
import { recordingApi, type RecordingApi } from "@/modules/travelogue/data/client"
import { publishDraft } from "@/modules/travelogue/drafts/publish"
import type { LocalDraft } from "@/modules/travelogue/drafts/storage"
import { createRecordingStore } from "@/modules/travelogue/state/recording-store"
import RecordingEditor from "@/modules/travelogue/ui/RecordingEditor"
import {
  MOBILE_COLLAPSED_SHEET_HEIGHT,
  mobileSheetHeight,
} from "@/modules/travelogue/ui/workbench/ResizableMapPanel"

const now = "2026-10-28T08:00:00Z"

function buildEvent(
  overrides: Partial<JourneyEvent> & { id: string }
): JourneyEvent {
  return {
    source: { userId: "owner", name: "作者", image: null },
    title: "默认标题",
    body: "",
    category: "VISIT",
    date: "2026-10-28",
    time: "09:30",
    timeZone: "Asia/Shanghai",
    location: null,
    photos: [],
    receipts: [],
    createdAt: now,
    updatedAt: now,
    canEdit: true,
    canRemove: true,
    ...overrides,
  }
}

function buildJourney(events: JourneyEvent[]): JourneySnapshot {
  return {
    id: "j-1",
    ownerId: "owner",
    role: "OWNER",
    revision: 1,
    title: "深秋江南漫行",
    description: "",
    status: "ACTIVE",
    visibility: "PRIVATE",
    createdAt: now,
    updatedAt: now,
    events,
  }
}

beforeEach(() => {
  vi.stubGlobal("innerWidth", 1280)
  vi.stubGlobal("innerHeight", 820)
  vi.stubGlobal("scrollTo", vi.fn())
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  })
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width: 768px"),
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
})

describe("workbench UI/UX iteration", () => {
  it("renders portrait VISIT, horizontal MEAL/STAY with full-bleed cover, and titleless TRANSIT with same-row note + expense pill", async () => {
    const journey = buildJourney([
      buildEvent({
        id: "e-visit",
        category: "VISIT",
        title: "虎跑梦泉",
        date: "2026-10-28",
        photos: [
          {
            assetId: "p-1",
            url: "/visit.jpg",
            caption: "不应渲染的图片说明",
            location: null,
            canEdit: true,
            isCover: true,
            source: { userId: "owner", name: "作者", image: null },
          },
        ],
      }),
      buildEvent({
        id: "e-meal",
        category: "MEAL",
        title: "湖畔桂花茶食",
        date: "2026-10-28",
        photos: [
          {
            assetId: "p-2",
            url: "/meal.jpg",
            caption: "另一段说明",
            location: null,
            canEdit: true,
            isCover: true,
            source: { userId: "owner", name: "作者", image: null },
          },
        ],
      }),
      buildEvent({
        id: "e-stay",
        category: "STAY",
        title: "满觉陇山居",
        date: "2026-10-29",
      }),
      buildEvent({
        id: "e-transit",
        category: "TRANSIT",
        title: "旧标题不应显示",
        body: "靠窗座位看山雾散开",
        date: "2026-10-29",
        time: "08:15",
        startAt: "2026-10-29T08:15:00+08:00",
        endAt: "2026-10-29T08:40:00+08:00",
        transit: {
          fromName: "龙井村口",
          toName: "灵隐总站",
          transportMode: "BUS",
          line: "7路",
          durationText: "25 分钟",
          routeState: "EMPTY",
        },
        receipts: [
          {
            id: "r-bus",
            assetId: "a-bus",
            url: "/bus.png",
            merchant: "杭州公交",
            date: "2026-10-29",
            currency: "CNY",
            total: "4.00",
            items: [],
            source: { userId: "owner", name: "作者", image: null },
            canEdit: true,
          },
        ],
      }),
    ])

    const store = createRecordingStore("j-1", {
      ...recordingApi,
      get: async () => structuredClone(journey),
    })
    await store.getState().load()

    const { container } = render(
      <RecordingEditor
        userId="owner"
        store={store}
        onBack={() => {}}
        mapPreview={<div>地图</div>}
      />
    )

    // Photo captions are completely stripped from cards
    expect(screen.queryByText("不应渲染的图片说明")).not.toBeInTheDocument()
    expect(screen.queryByText("另一段说明")).not.toBeInTheDocument()

    const visitCard = container.querySelector('[data-record-id="e-visit"]')!
    const mealCard = container.querySelector('[data-record-id="e-meal"]')!
    const stayCard = container.querySelector('[data-record-id="e-stay"]')!
    const transitCard = container.querySelector(
      '[data-record-id="e-transit"]'
    ) as HTMLElement

    expect(visitCard).toHaveClass("journal-card-portrait")
    expect(visitCard).not.toHaveClass("journal-card-horizontal")

    expect(mealCard).toHaveClass("journal-card-horizontal")
    expect(mealCard.querySelector(".journal-card-cover")).not.toBeNull()
    expect(within(mealCard as HTMLElement).getByText("用餐")).toBeInTheDocument()

    expect(stayCard).toHaveClass("journal-card-horizontal")

    // Transit card: light-blue class, zero heading title, mode+line badge, top-right edit & expand, same-row note + expense pill
    expect(transitCard).toHaveClass("journal-card-transit")
    expect(transitCard.querySelector("h2, h3")).toBeNull()
    expect(screen.queryByText("旧标题不应显示")).not.toBeInTheDocument()
    expect(within(transitCard).getByText("公交 · 7路")).toBeInTheDocument()
    expect(
      within(transitCard).getByRole("button", { name: /编辑/ })
    ).toBeInTheDocument()
    expect(
      within(transitCard).getByRole("button", {
        name: "展开龙井村口到灵隐总站的详情",
      })
    ).toBeInTheDocument()

    const bottomRow = transitCard.querySelector(".journal-transit-bottom")!
    expect(bottomRow).not.toBeNull()
    expect(
      within(bottomRow as HTMLElement).getByText("靠窗座位看山雾散开")
    ).toBeInTheDocument()
    const expensePill = within(bottomRow as HTMLElement).getByRole("button", {
      name: "展开杭州公交开销明细",
    })
    expect(expensePill).toHaveTextContent("CNY 4.00")

    // Symmetric date dividers: every date divider after the first has a gap-slot immediately before and after
    const dividers = container.querySelectorAll(".journal-date-divider")
    expect(dividers).toHaveLength(2)
    expect(dividers[1]!.previousElementSibling).toHaveClass("journal-gap-slot")
    expect(dividers[1]!.nextElementSibling).toHaveClass("journal-gap-slot")

    // Every gap slot unconditionally provides both 插入记录 and 插入交通 buttons
    const gapSlots = container.querySelectorAll(".journal-gap-slot")
    expect(gapSlots.length).toBeGreaterThanOrEqual(5)
    for (const slot of gapSlots) {
      expect(
        within(slot as HTMLElement).getByRole("button", {
          name: "在此处插入记录",
        })
      ).toBeInTheDocument()
      expect(
        within(slot as HTMLElement).getByRole("button", {
          name: "在此处插入交通",
        })
      ).toBeInTheDocument()
    }

    // Expanding a TRANSIT card opens the read-only subpage without any transport mode switcher
    fireEvent.click(
      within(transitCard).getByRole("button", {
        name: "展开龙井村口到灵隐总站的详情",
      })
    )
    const detailSubpage = container.querySelector(
      ".journal-subpage.journal-event-details"
    ) as HTMLElement
    expect(detailSubpage).not.toBeNull()
    expect(within(detailSubpage).getByText("公交 · 7路")).toBeInTheDocument()
    expect(
      within(detailSubpage).getByText("靠窗座位看山雾散开")
    ).toBeInTheDocument()
    expect(
      within(detailSubpage).getByRole("button", { name: "上一条记录" })
    ).toBeEnabled()
    expect(
      within(detailSubpage).getByRole("button", { name: "下一条记录" })
    ).toBeDisabled()
  })

  it("computes standalone transit schematic route path and honors positional afterEventId in publishDraft", async () => {
    const standalone = buildEvent({
      id: "t-standalone",
      category: "TRANSIT",
      title: "",
      transit: {
        fromName: "杭州东站",
        toName: "上海虹桥站",
        transportMode: "TRAIN",
        routeState: "EMPTY",
        fromLocation: {
          name: "杭州东站",
          address: null,
          coordinates: {
            lat: 30.2908,
            lng: 120.2127,
            coordinateSystem: "WGS84",
          },
        },
        toLocation: {
          name: "上海虹桥站",
          address: null,
          coordinates: {
            lat: 31.1941,
            lng: 121.3189,
            coordinateSystem: "WGS84",
          },
        },
      },
    })
    expect(standaloneTransitPath(standalone)).toHaveLength(2)
    expect(eventRouteBounds(standalone)).toHaveLength(2)

    const initialJourney = buildJourney([
      buildEvent({ id: "first", title: "第一站" }),
      buildEvent({ id: "second", title: "第二站" }),
    ])
    const commands: JourneyMutation["command"][] = []
    let storedDraft: LocalDraft | undefined = {
      id: "draft-mid",
      userId: "owner",
      journey: { id: "j-1", title: "深秋江南漫行" },
      afterEventId: "first",
      updatedAt: now,
      photos: [],
      content: {
        category: "TRANSIT",
        title: "应被清空",
        body: "高铁上喝咖啡",
        date: "2026-10-28",
        time: "10:00",
        startAt: "2026-10-28T10:00:00+08:00",
        endAt: "2026-10-28T10:48:00+08:00",
        timeZone: "Asia/Shanghai",
        location: null,
        transit: {
          fromName: "杭州东站",
          toName: "上海虹桥站",
          transportMode: "TRAIN",
          line: "G7304",
          durationText: "48 分钟",
        },
      },
    }

    const customApi: RecordingApi = {
      ...recordingApi,
      account: async () => ({ userId: "owner", name: "作者", email: "a@b.c" }),
      get: async () => structuredClone(initialJourney),
      command: async (_id: string, mutation: JourneyMutation) => {
        commands.push(mutation.command)
        return {
          eventId: "inserted-transit",
          replayed: false,
          journey: buildJourney([
            initialJourney.events[0]!,
            buildEvent({
              id: "inserted-transit",
              category: "TRANSIT",
              title: "",
              body: "高铁上喝咖啡",
              transit: {
                fromName: "杭州东站",
                toName: "上海虹桥站",
                transportMode: "TRAIN",
                line: "G7304",
                durationText: "48 分钟",
                routeState: "EMPTY",
              },
            }),
            initialJourney.events[1]!,
          ]),
        }
      },
    }

    await publishDraft("draft-mid", "owner", customApi, {
      get: async () => storedDraft,
      put: async (next: LocalDraft) => {
        storedDraft = next
      },
      remove: async () => {
        storedDraft = undefined
      },
    } as never)

    expect(commands[0]).toMatchObject({
      name: "event.add",
      afterEventId: "first",
      content: {
        category: "TRANSIT",
        title: "",
        transit: {
          fromName: "杭州东站",
          toName: "上海虹桥站",
          transportMode: "TRAIN",
          line: "G7304",
          durationText: "48 分钟",
        },
      },
    })
  })

  it("snaps mobile continuous drawer to pure 34px handle bar when collapsed", () => {
    expect(mobileSheetHeight(800, 0.65)).toBe(520)
    expect(mobileSheetHeight(800, 1)).toBe(800)
    expect(mobileSheetHeight(800, 0)).toBe(MOBILE_COLLAPSED_SHEET_HEIGHT)
    expect(MOBILE_COLLAPSED_SHEET_HEIGHT).toBe(34)
  })
})
