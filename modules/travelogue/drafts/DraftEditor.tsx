"use client"

import { useRef, useState } from "react"
import type { EventLocation } from "@/modules/data-model/contracts"
import { Button } from "@/components/kumo/components/button/button"
import EventComposer from "../ui/workbench/EventComposer"
import { Modal, useConfirmation } from "../ui/workbench/Modal"
import { operationId } from "../data/operation-id"
import { draftStorage, type DraftJourney, type LocalDraft } from "./storage"
import { draftError, draftInputError, publishDraft } from "./publish"

export default function DraftEditor({
  initial,
  journeys,
  onClose,
  onSaved,
  onPickLocation,
}: {
  initial: LocalDraft
  journeys: DraftJourney[]
  onClose: () => void
  onSaved: (journeyId: string, eventId: string) => void | Promise<void>
  onPickLocation?: (
    location: EventLocation | null
  ) => Promise<EventLocation | null | undefined>
}) {
  const [draft, setDraft] = useState(initial)
  const latest = useRef(initial)
  const writes = useRef<Promise<unknown>>(Promise.resolve())
  const [status, setStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [picking, setPicking] = useState(false)
  const { ask, confirmation } = useConfirmation()
  const committed = Boolean(draft.eventId || draft.pending)

  function update(next: LocalDraft) {
    next = { ...next, updatedAt: new Date().toISOString() }
    latest.current = next
    setDraft(next)
    setStatus("正在保存到本机…")
    setError(null)
    writes.current = writes.current
      .catch(() => {})
      .then(async () => {
        await draftStorage.put(next)
        if (latest.current === next) setStatus("已存本机")
      })
    void writes.current.catch((cause) => {
      setStatus("未存入本机")
      setError(`本机保存失败：${draftError(cause)}`)
    })
  }
  async function beforeClose() {
    if (lock.current) return false
    try {
      await writes.current
      return true
    } catch (cause) {
      setError(`本机保存失败，请保留此页面：${draftError(cause)}`)
      return false
    }
  }
  async function publish() {
    if (lock.current) return
    const invalid = draftInputError(latest.current)
    if (invalid) return setError(invalid)
    lock.current = true
    setBusy(true)
    setError(null)
    let persisted = false
    try {
      await writes.current.catch(() => {})
      await draftStorage.put(latest.current)
      persisted = true
      const result = await publishDraft(draft.id, draft.userId)
      await onSaved(result.journeyId, result.eventId)
    } catch (cause) {
      const stored =
        persisted && (await draftStorage.get(draft.id).catch(() => undefined))
      if (stored) {
        latest.current = stored
        setDraft(stored)
      }
      setError(draftError(cause))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <>
      {!picking && (
        <Modal
          title="本机草稿"
          hideTitle
          hideClose
          onClose={onClose}
          beforeClose={beforeClose}
          className="journal-composer w-[560px]! max-w-[calc(100vw-32px)]! p-0! max-sm:top-0! max-sm:left-0! max-sm:h-dvh! max-sm:max-h-dvh! max-sm:w-screen! max-sm:max-w-none! max-sm:translate-none! max-sm:transform-none! max-sm:rounded-none! max-sm:pt-[env(safe-area-inset-top)]! max-sm:pb-[env(safe-area-inset-bottom)]!"
          backdropClassName="bg-ink-20!"
        >
          {(close) => (
            <>
              <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-2 bg-white px-6 md:px-9">
                <Button variant="ghost" disabled={busy} onClick={close}>
                  返回
                </Button>
                <Button
                  variant="primary"
                  loading={busy}
                  onClick={() => void publish()}
                >
                  {draft.pending
                    ? "确认提交结果"
                    : draft.eventId
                      ? "继续上传照片"
                      : "加入游记"}
                </Button>
              </header>
              <div className="space-y-2 px-6 pt-2 md:px-9">
                <p role="status" className="text-xs text-walnut">
                  {busy ? "正在提交…" : status || "仅存本机"}
                </p>
                <label className="block text-sm text-walnut">
                  目标游记
                  <select
                    aria-label="目标游记"
                    value={draft.journey.id}
                    disabled={busy}
                    className="mt-1 block min-h-10 w-full rounded-lg border border-ink-10 bg-white px-3 text-ink"
                    onChange={async (event) => {
                      const journey = journeys.find(
                        (item) => item.id === event.target.value
                      )!
                      if (
                        committed &&
                        !(await ask(
                          "原游记可能已保存这条记录。改选后会在另一篇游记新建记录。",
                          {
                            title: "改存到其他游记？",
                            cancelLabel: "保留原目标",
                            confirmLabel: "改存",
                          }
                        ))
                      )
                        return
                      update({
                        ...draft,
                        journey,
                        eventId: undefined,
                        pending: undefined,
                        complete: undefined,
                      })
                    }}
                  >
                    {!journeys.some((item) => item.id === draft.journey.id) && (
                      <option value={draft.journey.id}>
                        {draft.journey.title}
                      </option>
                    )}
                    {journeys.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                {committed && (
                  <p className="text-xs text-walnut">
                    提交进度已保留，确认完成后即可打开正式记录。
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-sm text-coral">
                    {error}{" "}
                    <a href="/" className="underline">
                      登录
                    </a>
                  </p>
                )}
              </div>
              <EventComposer
                draft={draft.content}
                files={draft.photos.map((photo) => photo.file)}
                photos={[]}
                uploads={[]}
                busy={busy || committed}
                canPickLocation={Boolean(onPickLocation)}
                onChange={(content) => update({ ...draft, content })}
                onFiles={(files) =>
                  update({
                    ...draft,
                    photos: files.map(
                      (file) =>
                        draft.photos.find((photo) => photo.file === file) || {
                          id: operationId(),
                          file,
                        }
                    ),
                  })
                }
                onPickLocation={async () => {
                  setPicking(true)
                  try {
                    const location = await onPickLocation!(
                      draft.content.location
                    )
                    if (location !== undefined)
                      update({
                        ...latest.current,
                        content: { ...latest.current.content, location },
                      })
                  } finally {
                    setPicking(false)
                  }
                }}
              />
            </>
          )}
        </Modal>
      )}
      {confirmation}
    </>
  )
}
