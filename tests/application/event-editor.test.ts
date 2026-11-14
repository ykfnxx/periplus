import { expect, it, vi } from "vitest"
import type {
  JourneySnapshot,
  JourneyMutation,
  JourneyMutationResult,
} from "@/modules/data-model/contracts"
import type { RecordingApi } from "@/modules/travelogue/ports"
import { createRecordingStore } from "@/modules/travelogue/application/recording-session"
import { createEventEditor } from "@/modules/travelogue/application/event-editor"
import { eventContent } from "@/modules/travelogue/model/event-draft"
const timestamp = "2026-11-14T00:00:00Z"
const initial: JourneySnapshot = {
  id: "journey",
  ownerId: "owner",
  role: "OWNER",
  revision: 1,
  title: "杭州",
  description: "",
  status: "ACTIVE",
  visibility: "PRIVATE",
  createdAt: timestamp,
  updatedAt: timestamp,
  events: [
    {
      id: "event",
      title: "午餐",
      body: "原文",
      category: "VISIT",
      date: "2026-11-14",
      time: null,
      timeZone: "Asia/Shanghai",
      location: null,
      photos: [],
      receipts: [],
      canEdit: true,
      canRemove: true,
      source: { userId: "owner", name: "Owner", image: null },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
}
it("confirms a lost save response with one revision, queues files once, and rotates keys for later edits", async () => {
  let remote = structuredClone(initial)
  const receipts = new Map<string, JourneyMutationResult>()
  const command = vi.fn(async (_: string, input: JourneyMutation) => {
    const receipt = receipts.get(input.idempotencyKey)
    if (receipt) return receipt
    if (input.command.name !== "event.update")
      throw new Error("unexpected command")
    remote = {
      ...remote,
      revision: remote.revision + 1,
      events: [
        {
          ...remote.events[0],
          title: input.command.patch.title ?? remote.events[0].title,
          body: input.command.patch.body ?? remote.events[0].body,
        },
      ],
    }
    const result = { journey: remote, replayed: false }
    receipts.set(input.idempotencyKey, result)
    if (receipts.size === 1) throw new Error("response lost")
    return result
  })
  const store = createRecordingStore("journey", {
    get: async () => remote,
    command,
    weather: async () => ({
      journeyId: "journey",
      revision: remote.revision,
      events: [],
    }),
  } as unknown as RecordingApi)
  await store.getState().load()
  const addFiles = vi.fn()
  store.setState({ addFiles })
  const editor = createEventEditor(
    store,
    "event",
    eventContent(initial.events[0])
  )
  editor.change({ ...editor.getState().draft, body: "修改正文" })
  editor.files([new File(["image"], "photo.jpg")])
  await editor.save()
  expect(editor.getState().pending).toBe(true)
  expect(remote.revision).toBe(2)
  expect(addFiles).not.toHaveBeenCalled()
  // Reading the journey cannot discard an uncertain command.
  await store.getState().load()
  expect(store.getState().pendingMutationKey).toBeTruthy()
  editor.change({ ...editor.getState().draft, title: "确认期间的新输入" })
  await editor.confirmPending()
  expect(remote.events[0].title).toBe("午餐")
  expect(editor.getState().draft.title).toBe("确认期间的新输入")
  expect(command).toHaveBeenCalledTimes(2)
  expect(command.mock.calls[1][1]).toEqual(command.mock.calls[0][1])
  expect(remote.revision).toBe(2)
  expect(addFiles).toHaveBeenCalledOnce()
  expect(editor.getState().pending).toBe(false)
  expect(editor.getState().files).toEqual([])
  editor.change({ ...editor.getState().draft, title: "晚餐" })
  await editor.save()
  expect(command).toHaveBeenCalledTimes(3)
  expect(command.mock.calls[2][1].idempotencyKey).not.toBe(
    command.mock.calls[0][1].idempotencyKey
  )
  expect(remote.revision).toBe(3)
  expect(remote.events[0].body).toBe("修改正文")
  expect(remote.events[0].title).toBe("晚餐")
})
it("rebases edited fields while retaining fresh server fields and selected files", () => {
  const store = createRecordingStore("journey", {} as RecordingApi)
  const editor = createEventEditor(
    store,
    "event",
    eventContent(initial.events[0])
  )
  const file = new File(["image"], "photo.jpg")
  editor.change({ ...editor.getState().draft, body: "本地正文" })
  editor.files([file])
  editor.reload({
    ...initial,
    revision: 2,
    events: [{ ...initial.events[0], title: "新标题" }],
  })
  expect(editor.getState().draft).toMatchObject({
    title: "新标题",
    body: "本地正文",
  })
  expect(editor.getState().saved.body).toBe("原文")
  expect(editor.getState().files).toEqual([file])
})

it("does not mistake another queued operation's uncertain response for this editor's save", async () => {
  const command = vi
    .fn()
    .mockRejectedValueOnce(new Error("response lost"))
    .mockRejectedValueOnce(new Error("still offline"))
    .mockResolvedValueOnce({
      journey: { ...initial, revision: 2 },
      replayed: true,
    })
    .mockResolvedValueOnce({
      journey: {
        ...initial,
        revision: 3,
        events: [{ ...initial.events[0], body: "本次修改" }],
      },
      replayed: false,
    })
  const store = createRecordingStore("journey", {
    get: async () => initial,
    command,
    weather: async () => ({ journeyId: "journey", revision: 1, events: [] }),
  } as unknown as RecordingApi)
  await store.getState().load()
  await expect(
    store
      .getState()
      .mutate(
        { name: "journey.update", patch: { description: "另一项修改" } },
        "other-intent"
      )
  ).rejects.toThrow()
  const editor = createEventEditor(
    store,
    "event",
    eventContent(initial.events[0])
  )
  editor.change({ ...editor.getState().draft, body: "本次修改" })
  await editor.save()
  expect(editor.getState().pending).toBe(false)
  await editor.save()
  expect(command).toHaveBeenCalledTimes(4)
  expect(command.mock.calls[2][1].idempotencyKey).toBe("other-intent")
  expect(command.mock.calls[3][1].command).toEqual({
    name: "event.update",
    eventId: "event",
    patch: { body: "本次修改" },
  })
  expect(editor.getState().saved.body).toBe("本次修改")
})
