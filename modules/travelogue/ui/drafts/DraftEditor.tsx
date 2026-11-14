"use client"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Modal, useConfirmation } from "@/components/ui/Modal"
import EventComposer from "../events/EventComposer"
import type { DraftJourney, LocalDraft } from "../../model/local-draft"
export default function DraftEditor({
  draft,
  journeys,
  error,
  status,
  busy,
  picking,
  inline,
  onClose,
  closeInline,
  beforeClose,
  publish,
  update,
  onFiles,
  canPick,
  pick,
  pickEndpoint,
}: {
  draft: LocalDraft
  journeys: DraftJourney[]
  error: string | null
  status: string
  busy: boolean
  picking: boolean
  inline: boolean
  onClose: () => void
  closeInline: () => Promise<void>
  beforeClose: () => Promise<boolean>
  publish: () => Promise<void>
  update: (draft: LocalDraft) => void
  onFiles: (files: File[]) => void
  canPick: boolean
  pick: () => Promise<void>
  pickEndpoint: (which: "from" | "to") => Promise<void>
}) {
  const { ask, confirmation } = useConfirmation()
  const committed = Boolean(draft.eventId || draft.pending)
  const content = (
    <>
      <header className="journal-subpage-header sticky top-0 z-10">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void closeInline()}
        >
          <ArrowLeft size={16} />
          返回
        </Button>
        <div className="flex items-center gap-2">
          <span role="status" className="text-xs text-journal-muted">
            {busy ? "正在提交…" : status || "草稿"}
          </span>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            onClick={() => void publish()}
          >
            {draft.pending
              ? "确认提交结果"
              : draft.eventId
                ? "继续上传照片"
                : "加入游记"}
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {(!inline || journeys.length > 1 || error) && (
          <div className="space-y-2 px-4 pt-3">
            {(!inline || journeys.length > 1) && (
              <label className="block text-xs font-medium text-journal-muted">
                目标游记
                <select
                  aria-label="目标游记"
                  value={draft.journey.id}
                  disabled={busy}
                  className="mt-1 block min-h-10 w-full rounded-xl border border-journal-line bg-journal-card px-3 text-sm text-journal-ink"
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
            )}
            {error && (
              <p role="alert" className="text-sm text-coral">
                {error}{" "}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full navigation rechecks authentication outside the offline shell. */}
                <a href="/" className="underline">
                  登录
                </a>
              </p>
            )}
          </div>
        )}
        <EventComposer
          draft={draft.content}
          files={draft.photos.map((photo) => photo.file)}
          photos={[]}
          uploads={[]}
          busy={busy || committed}
          filesBusy={busy || Boolean(draft.pending)}
          canPickLocation={canPick}
          onChange={(content) => update({ ...draft, content })}
          onFiles={onFiles}
          onPickTransitLocation={
            canPick ? (which) => void pickEndpoint(which) : undefined
          }
          onPickLocation={pick}
        />
      </div>
    </>
  )

  if (inline)
    return (
      <section
        className="journal-subpage journal-composer"
        aria-label="添加记录"
      >
        {content}
        {confirmation}
      </section>
    )

  return (
    <>
      {!picking && (
        <Modal
          title="本机草稿"
          hideTitle
          hideClose
          onClose={onClose}
          beforeClose={beforeClose}
          className="journal-composer flex max-h-[min(760px,calc(100dvh-48px))]! w-[540px]! max-w-[calc(100vw-32px)]! flex-col! overflow-hidden! p-0! max-sm:top-0! max-sm:left-0! max-sm:h-dvh! max-sm:max-h-dvh! max-sm:w-screen! max-sm:max-w-none! max-sm:translate-none! max-sm:transform-none! max-sm:rounded-none! max-sm:pt-[env(safe-area-inset-top)]! max-sm:pb-[env(safe-area-inset-bottom)]!"
          backdropClassName="bg-ink-20!"
        >
          {() => content}
        </Modal>
      )}
      {confirmation}
    </>
  )
}
