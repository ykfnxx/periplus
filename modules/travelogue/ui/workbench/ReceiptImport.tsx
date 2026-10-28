"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Camera, ImagePlus } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Select } from "@/components/kumo/components/select/select"
import ReceiptForm, { type ReceiptFormValues } from "./ReceiptForm"
import { Modal, useConfirmation } from "./Modal"
import { operationId } from "../../data/operation-id"

export type ReceiptReview = {
  assetId: string
  values: ReceiptFormValues
}

export default function ReceiptImport({
  events,
  initialEventId,
  revisionNotice,
  recognize,
  save,
  onClose,
  onSaved,
}: {
  initialEventId?: string | null
  revisionNotice?: ReactNode
  events: { id: string; title: string }[]
  recognize: (file: File, uploadId: string) => Promise<ReceiptReview>
  save: (
    review: ReceiptReview,
    eventId: string | null,
    saveKey: string
  ) => Promise<string>
  onClose: () => void
  onSaved: (eventId: string) => void
}) {
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploadId, setUploadId] = useState(operationId)
  const [saveKey, setSaveKey] = useState(operationId)
  const [preview, setPreview] = useState<string | null>(null)
  const [review, setReview] = useState<ReceiptReview | null>(null)
  const [target, setTarget] = useState(initialEventId || "new")
  const [busy, setBusy] = useState<"recognizing" | "saving" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { ask, confirmation } = useConfirmation()
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])
  async function choose(next: File | undefined) {
    if (!next) return
    if (
      review &&
      !(await ask("当前核对内容将被替换。", {
        title: "重新选择账单？",
        cancelLabel: "继续核对",
        confirmLabel: "重新选择",
      }))
    )
      return
    setFile(next)
    setPreview(URL.createObjectURL(next))
    setUploadId(operationId())
    setSaveKey(operationId())
    setReview(null)
    setError(null)
  }
  async function submit() {
    if (!file || busy) return
    setError(null)
    if (!review) {
      setBusy("recognizing")
      try {
        setReview(await recognize(file, uploadId))
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "账单识别失败，请重试。"
        )
      } finally {
        setBusy(null)
      }
      return
    }
    setBusy("saving")
    try {
      const eventId = await save(
        review,
        target === "new" ? null : target,
        saveKey
      )
      onSaved(eventId)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "保存失败，核对内容已保留，请重试。"
      )
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <Modal
        title={review ? "核对账单" : "拍账单"}
        hideTitle
        hideClose
        onClose={onClose}
        beforeClose={() =>
          !busy &&
          (!file ||
            ask("这张账单尚未加入记录。", {
              title: "放弃导入？",
              cancelLabel: "继续核对",
              confirmLabel: "放弃导入",
            }))
        }
        className="journal-receipt-import w-[560px]! p-0! max-sm:top-0! max-sm:left-0! max-sm:h-dvh! max-sm:max-h-dvh! max-sm:w-screen! max-sm:max-w-none! max-sm:translate-none! max-sm:transform-none! max-sm:rounded-none! max-sm:pt-[env(safe-area-inset-top)]! max-sm:pb-[env(safe-area-inset-bottom)]!"
      >
        {(close) => (
          <>
            <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 bg-white px-6 py-3 md:px-9">
              <Button variant="ghost" disabled={!!busy} onClick={close}>
                取消
              </Button>
              <h2 className="text-base font-semibold">
                {review ? "核对账单" : "拍账单"}
              </h2>
              <Button
                variant="primary"
                disabled={!file}
                loading={!!busy}
                onClick={() => void submit()}
              >
                {review ? "加入" : "识别"}
              </Button>
            </header>
            <div className="space-y-6 px-6 pb-8 md:px-9">
              {revisionNotice}
              {error && (
                <p role="alert" className="text-sm text-coral">
                  {error}
                </p>
              )}
              {busy && (
                <p role="status" className="text-sm text-journal-muted">
                  {busy === "recognizing" ? "正在识别账单…" : "正在加入记录…"}
                </p>
              )}
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="账单原图"
                  className={`mx-auto w-full rounded-xl object-contain ${review ? "max-h-48" : "max-h-[55dvh]"}`}
                />
              ) : (
                <div className="flex min-h-60 items-center justify-center rounded-xl bg-journal-soft text-journal-muted">
                  <Camera size={36} strokeWidth={1.3} />
                </div>
              )}
              {review && (
                <>
                  <ReceiptForm
                    value={review.values}
                    disabled={!!busy}
                    onChange={(values) => setReview({ ...review, values })}
                  />
                  <Select
                    label="加入到"
                    value={target}
                    disabled={!!busy}
                    items={[
                      { value: "new", label: "新建记录" },
                      ...events.map((event) => ({
                        value: event.id,
                        label: event.title,
                      })),
                    ]}
                    onValueChange={(value) => value && setTarget(value)}
                  />
                </>
              )}
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="min-w-0 flex-1"
                  disabled={!!busy}
                  onClick={() => camera.current?.click()}
                >
                  <Camera size={17} />
                  {file ? "重新拍摄" : "拍摄账单"}
                </Button>
                <Button
                  variant="secondary"
                  className="min-w-0 flex-1"
                  disabled={!!busy}
                  onClick={() => library.current?.click()}
                >
                  <ImagePlus size={17} />
                  从相册选择
                </Button>
              </div>
              <input
                ref={camera}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(event) => {
                  void choose(event.target.files?.[0])
                  event.target.value = ""
                }}
              />
              <input
                ref={library}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  void choose(event.target.files?.[0])
                  event.target.value = ""
                }}
              />
            </div>
          </>
        )}
      </Modal>
      {confirmation}
    </>
  )
}
