import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { JourneySnapshot } from "@/modules/data-model/contracts"
import {
  recordingApi,
  RecordingApiError,
} from "@/modules/travelogue/data/client"
import { createRecordingStore } from "@/modules/travelogue/state/recording-store"
import RecordingEditor from "@/modules/travelogue/ui/RecordingEditor"
import ReceiptImport from "@/modules/travelogue/ui/workbench/ReceiptImport"
import EventEditor from "@/modules/travelogue/ui/workbench/EventEditor"

const fields = {
  merchant: "茶馆",
  date: null,
  total: "92.00",
  currency: "CNY",
  items: [],
}
const now = "2026-10-28T08:00:00Z"
function savedJourney(): JourneySnapshot {
  return {
    id: "journey",
    ownerId: "owner",
    role: "MEMBER",
    revision: 1,
    title: "杭州慢游",
    description: "",
    status: "ACTIVE",
    visibility: "PRIVATE",
    createdAt: now,
    updatedAt: now,
    events: [
      {
        id: "event",
        source: { userId: "friend", name: "阿宁", image: null },
        title: "喝茶",
        body: "",
        category: "VISIT",
        date: "2026-10-28",
        time: null,
        timeZone: null,
        location: null,
        photos: [],
        createdAt: now,
        updatedAt: now,
        canEdit: true,
        canRemove: true,
        receipts: [
          {
            ...fields,
            id: "link-1",
            assetId: "original",
            url: "/receipt.png",
            source: { userId: "friend", name: "阿宁", image: null },
            canEdit: true,
          },
        ],
      },
    ],
  }
}

beforeEach(() => {
  vi.stubGlobal("innerWidth", 390)
  vi.stubGlobal("scrollTo", vi.fn())
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  })
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
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
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL() {
        return "blob:receipt"
      }
      static revokeObjectURL() {}
    }
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
})

describe("receipt recovery", () => {
  it("saves manually confirmed fields when OCR remains unavailable, retaining the uploaded original", async () => {
    const upload = vi.fn().mockResolvedValue("uploaded-original")
    const recognize = vi.fn().mockRejectedValue(new Error("识别暂时不可用。"))
    const save = vi.fn().mockResolvedValue("event")
    const onSaved = vi.fn()
    render(
      <ReceiptImport
        events={[]}
        upload={upload}
        recognize={recognize}
        save={save}
        onClose={() => {}}
        onSaved={onSaved}
      />
    )
    // The modal is portalled, so select the actual camera/gallery input in the document.
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["image"], "receipt.png", { type: "image/png" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "识别" }))
    const merchant = await screen.findByLabelText("店名")
    expect(merchant).toHaveValue("")
    expect(screen.getByRole("alert")).toHaveTextContent("手动填写")
    fireEvent.change(merchant, { target: { value: "手填早餐" } })
    fireEvent.change(screen.getByLabelText("总额"), {
      target: { value: "18.50" },
    })
    fireEvent.click(screen.getByRole("button", { name: "加入" }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("event"))
    expect(save.mock.calls[0][0]).toMatchObject({
      assetId: "uploaded-original",
      values: { merchant: "手填早餐", total: "18.50" },
    })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(recognize).toHaveBeenCalledWith("uploaded-original")
  })

  it("retries recognition with the same asset without uploading it again", async () => {
    const upload = vi.fn().mockResolvedValue("uploaded-original")
    const recognize = vi
      .fn()
      .mockRejectedValueOnce(new Error("识别暂时不可用。"))
      .mockResolvedValueOnce({
        merchant: "茶馆",
        date: "",
        currency: "CNY",
        total: "92.00",
        items: [],
      })
    render(
      <ReceiptImport
        events={[]}
        upload={upload}
        recognize={recognize}
        save={vi.fn()}
        onClose={() => {}}
        onSaved={() => {}}
      />
    )
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["image"], "receipt.png", { type: "image/png" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "识别" }))
    await screen.findByLabelText("店名")
    fireEvent.click(screen.getByRole("button", { name: "重新识别" }))
    await waitFor(() =>
      expect(screen.getByLabelText("店名")).toHaveValue("茶馆")
    )
    expect(upload).toHaveBeenCalledTimes(1)
    expect(recognize.mock.calls).toEqual([
      ["uploaded-original"],
      ["uploaded-original"],
    ])
  })

  it.each([false, true])(
    "keeps the detail and draft across receipt-link replacement (conflict: %s)",
    async (conflict) => {
      let persisted = savedJourney()
      let conflictPending = conflict
      const command = vi.fn<typeof recordingApi.command>(
        async (_id, mutation) => {
          if (mutation.command.name !== "receipt.update")
            throw new Error("Unexpected command")
          const current = persisted.events[0].receipts![0]
          if (conflictPending) {
            conflictPending = false
            persisted = structuredClone(persisted)
            persisted.events[0].receipts![0] = {
              ...current,
              id: "remote-link",
              total: "95.00",
            }
            persisted.revision++
            throw new RecordingApiError(
              "同行者已修改",
              409,
              "REVISION_CONFLICT"
            )
          }
          expect(mutation.expectedRevision).toBe(persisted.revision)
          expect(mutation.command.receiptId).toBe(current.id)
          persisted = structuredClone(persisted)
          persisted.events[0].receipts![0] = {
            ...current,
            ...mutation.command.fields,
            id: `link-${persisted.revision + 1}`,
          }
          persisted.revision++
          return { journey: structuredClone(persisted), replayed: false }
        }
      )
      const store = createRecordingStore("journey", {
        ...recordingApi,
        get: async () => structuredClone(persisted),
        command,
      })
      await store.getState().load()
      render(
        <RecordingEditor
          store={store}
          onBack={() => {}}
          mapPreview={<div>地图</div>}
        />
      )
      fireEvent.click(
        screen.getByRole("button", { name: "查看茶馆的账单详情" })
      )
      const detail = within(screen.getByRole("dialog", { name: "账单详情" }))
      fireEvent.click(detail.getByRole("button", { name: "编辑账单" }))
      fireEvent.change(detail.getByLabelText("店名"), {
        target: { value: "我的核对内容" },
      })
      fireEvent.change(detail.getByLabelText("总额"), {
        target: { value: "99.90" },
      })
      fireEvent.click(detail.getByRole("button", { name: "保存账单" }))
      if (conflict) {
        await detail.findByRole("button", { name: "读取最新记录" })
        await act(async () => {
          fireEvent.click(detail.getByRole("button", { name: "读取最新记录" }))
        })
        expect(detail.getByLabelText("店名")).toHaveValue("我的核对内容")
        expect(detail.getByLabelText("总额")).toHaveValue("99.90")
        expect(detail.queryByRole("alert")).not.toBeInTheDocument()
        fireEvent.click(detail.getByRole("button", { name: "保存账单" }))
      }
      await detail.findByRole("button", { name: "编辑账单" })
      expect(
        screen.getByRole("dialog", { name: "账单详情" })
      ).toBeInTheDocument()
      expect(detail.getByText("CNY 99.90")).toBeInTheDocument()
      fireEvent.click(detail.getByRole("button", { name: "编辑账单" }))
      fireEvent.change(detail.getByLabelText("总额"), {
        target: { value: "100.25" },
      })
      fireEvent.click(detail.getByRole("button", { name: "保存账单" }))
      await detail.findByRole("button", { name: "编辑账单" })
      expect(detail.getByText("CNY 100.25")).toBeInTheDocument()
      expect(persisted.events[0].receipts![0].merchant).toBe("我的核对内容")
      expect(command).toHaveBeenCalledTimes(conflict ? 3 : 2)
    }
  )
})

describe("event draft conflict recovery", () => {
  it("keeps edits made while a slow reread is pending and saves against the new revision", async () => {
    let persisted = savedJourney()
    let resolveReload!: (journey: JourneySnapshot) => void
    const reload = new Promise<JourneySnapshot>((resolve) => {
      resolveReload = resolve
    })
    let reads = 0
    const command = vi.fn<typeof recordingApi.command>(
      async (_id, mutation) => {
        if (mutation.expectedRevision !== persisted.revision)
          throw new RecordingApiError("同行者已修改", 409, "REVISION_CONFLICT")
        if (mutation.command.name !== "event.update")
          throw new Error("Unexpected command")
        Object.assign(persisted.events[0], mutation.command.patch)
        persisted.revision++
        return { journey: structuredClone(persisted), replayed: false }
      }
    )
    const store = createRecordingStore("journey", {
      ...recordingApi,
      get: async () => (reads++ ? reload : structuredClone(persisted)),
      command,
    })
    await store.getState().load()
    render(
      <RecordingEditor
        store={store}
        onBack={() => {}}
        mapPreview={<div>地图</div>}
      />
    )
    fireEvent.contextMenu(screen.getByRole("article", { name: "喝茶" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: /^编辑$/ }))
    fireEvent.change(screen.getByLabelText("记录正文"), {
      target: { value: "重读之前的草稿" },
    })
    persisted = structuredClone(persisted)
    persisted.events[0].body = "同行者的正文"
    persisted.events[0].date = "2026-10-29"
    persisted.revision++
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    fireEvent.click(await screen.findByRole("button", { name: "读取最新记录" }))
    expect(store.getState().loading).toBe(true)
    expect(screen.getByLabelText("记录正文")).toBeEnabled()
    fireEvent.change(screen.getByLabelText("记录正文"), {
      target: { value: "重读等待期间继续写下的正文" },
    })
    await act(async () => resolveReload(structuredClone(persisted)))
    expect(screen.getByLabelText("记录正文")).toHaveValue(
      "重读等待期间继续写下的正文"
    )
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() => expect(persisted.revision).toBe(3))
    expect(persisted.events[0].date).toBe("2026-10-29")
    expect(command.mock.calls.at(-1)![1]).toMatchObject({
      expectedRevision: 2,
      command: {
        name: "event.update",
        eventId: "event",
        patch: { body: "重读等待期间继续写下的正文" },
      },
    })
  })

  it("clears the obsolete warning and saves preserved input after two consecutive conflicts", async () => {
    let persisted = savedJourney()
    const command = vi.fn<typeof recordingApi.command>(
      async (_id, mutation) => {
        if (mutation.expectedRevision !== persisted.revision)
          throw new RecordingApiError("同行者已修改", 409, "REVISION_CONFLICT")
        if (mutation.command.name !== "event.update")
          throw new Error("Unexpected command")
        Object.assign(persisted.events[0], mutation.command.patch)
        persisted.revision++
        return { journey: structuredClone(persisted), replayed: false }
      }
    )
    const store = createRecordingStore("journey", {
      ...recordingApi,
      get: async () => structuredClone(persisted),
      command,
    })
    await store.getState().load()
    const onSaved = vi.fn()
    render(
      <EventEditor
        store={store}
        request={{ eventId: "event", afterEventId: null }}
        onClose={() => {}}
        onSaved={onSaved}
        onPickLocation={async () => undefined}
      />
    )
    for (let turn = 1; turn <= 2; turn++) {
      const body = `第 ${turn} 轮保留的本人草稿`
      fireEvent.change(screen.getByLabelText("记录正文"), {
        target: { value: body },
      })
      // Another page commits before this editor; its snapshot stays stale until reread.
      persisted = structuredClone(persisted)
      persisted.events[0].body = `同行者第 ${turn} 轮修改`
      persisted.events[0].date = `2026-10-${28 + turn}`
      persisted.events[0].planning = { durationMinutes: turn * 30 }
      persisted.revision++
      fireEvent.click(screen.getByRole("button", { name: "保存" }))
      const reload = await screen.findByRole("button", { name: "读取最新记录" })
      await act(async () => {
        fireEvent.click(reload)
      })
      expect(screen.getByLabelText("记录正文")).toHaveValue(body)
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "保存" }))
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(turn))
      expect(persisted.events[0].body).toBe(body)
      expect(persisted.events[0].date).toBe(`2026-10-${28 + turn}`)
      expect(persisted.events[0].planning?.durationMinutes).toBe(turn * 30)
      expect(command.mock.calls.at(-1)![1].command).toEqual({
        name: "event.update",
        eventId: "event",
        patch: { body },
      })
      expect(screen.getByRole("status")).toHaveTextContent("已保存")
    }
    expect(command).toHaveBeenCalledTimes(4)
  })
})

describe("read-only unified Journey", () => {
  it("keeps events and bills readable while hiding write controls", async () => {
    const persisted = savedJourney()
    const store = createRecordingStore(persisted.id, {
      ...recordingApi,
      get: async () => persisted,
    })
    await store.getState().load()
    render(
      <RecordingEditor
        store={store}
        readOnly
        onBack={() => {}}
        mapPreview={<div>地图</div>}
      />
    )
    expect(
      screen.queryByRole("button", { name: "记一笔" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "编辑喝茶" })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "查看茶馆的账单详情" }))
    await screen.findByRole("dialog", { name: "账单详情" })
    expect(
      screen.queryByRole("button", { name: "编辑账单" })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByRole("dialog", { name: "账单详情" })).getByText(
        "CNY 92.00"
      )
    ).toBeInTheDocument()
  })
})
