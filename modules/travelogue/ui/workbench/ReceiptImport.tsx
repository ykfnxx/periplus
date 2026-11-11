"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Camera, ImagePlus } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Select } from "@/components/kumo/components/select/select"
import { operationId } from "../../data/operation-id"
import { useConfirmation } from "./Modal"
import ReceiptForm, { type ReceiptFormValues } from "./ReceiptForm"

export type ReceiptReview = {
  assetId: string
  values: ReceiptFormValues
}

const emptyValues: ReceiptFormValues = {
  merchant: "",
  date: "",
  currency: "",
  total: "",
  items: [],
}

export default function ReceiptImport({
  events,
  initialEventId,
  revisionNotice,
  upload,
  recognize,
  save,
  onClose,
  onSaved,
}: {
  initialEventId?: string | null
  revisionNotice?: ReactNode
  events: { id: string; title: string }[]
  upload: (file: File, uploadId: string) => Promise<string>
  recognize: (assetId: string) => Promise<ReceiptFormValues>
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

  async function attemptClose() {
    if (busy) return
    if (
      file &&
      !(await ask("这张账单尚未加入记录。", {
        title: "放弃导入？",
        cancelLabel: "继续核对",
        confirmLabel: "放弃导入",
      }))
    )
      return
    onClose()
  }

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

  async function recognizeImage() {
    if (!file || busy) return
    if (
      review &&
      JSON.stringify(review.values) !== JSON.stringify(emptyValues) &&
      !(await ask("重新识别将替换当前核对内容。", {
        title: "重新识别账单？",
        cancelLabel: "继续核对",
        confirmLabel: "重新识别",
      }))
    )
      return
    setBusy("recognizing")
    setError(null)
    let uploadedAssetId = review?.assetId
    try {
      uploadedAssetId ||= await upload(file, uploadId)
      // 原图上传成功后独立保留；识别失败不阻止手填，也不需要重新上传。
      const values = await recognize(uploadedAssetId)
      setReview({ assetId: uploadedAssetId, values })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "账单识别失败。"
      if (uploadedAssetId) {
        const retainedAssetId = uploadedAssetId
        setReview(
          (current) =>
            current || { assetId: retainedAssetId, values: emptyValues }
        )
        setError(`${message} 可以手动填写后加入记录，或重新识别。`)
      } else {
        setError(message)
      }
    } finally {
      setBusy(null)
    }
  }

  async function submit() {
    if (!file || busy) return
    setError(null)
    if (!review) {
      await recognizeImage()
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

  const label = review ? "核对账单" : "拍账单"

  return (
    <>
      <section
        className="journal-subpage journal-receipt-import"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.stopPropagation()
            void attemptClose()
          }
        }}
      >
        <header className="journal-subpage-header sticky top-0 z-10">
          <Button
            variant="ghost"
            size="sm"
            disabled={!!busy}
            onClick={() => void attemptClose()}
          >
            取消
          </Button>
          <h2 className="truncate font-editorial text-lg font-bold">{label}</h2>
          <Button
            variant="primary"
            size="sm"
            disabled={!file}
            loading={!!busy}
            onClick={() => void submit()}
          >
            {review ? "加入" : "识别"}
          </Button>
        </header>

        <div className="journal-subpage-body">
          <div className="space-y-5 rounded-3xl border border-journal-line bg-journal-card p-4 shadow-journal-card">
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
                className={`mx-auto w-full rounded-2xl border border-journal-line bg-journal-paper-soft object-contain ${
                  review ? "max-h-48" : "max-h-[48dvh]"
                }`}
              />
            ) : (
              <div className="flex min-h-52 items-center justify-center rounded-2xl border border-dashed border-journal-line bg-journal-paper-soft text-journal-muted">
                <Camera size={34} strokeWidth={1.4} />
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
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => void recognizeImage()}
                >
                  重新识别
                </Button>
              </>
            )}
            <div className="flex gap-2.5">
              <Button
                variant="secondary"
                className="min-w-0 flex-1"
                disabled={!!busy}
                onClick={() => camera.current?.click()}
              >
                <Camera size={16} />
                {file ? "重新拍摄" : "拍摄账单"}
              </Button>
              <Button
                variant="secondary"
                className="min-w-0 flex-1"
                disabled={!!busy}
                onClick={() => library.current?.click()}
              >
                <ImagePlus size={16} />
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
        </div>
      </section>
      {confirmation}
    </>
  )
}
