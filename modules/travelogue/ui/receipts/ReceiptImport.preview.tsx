"use client"
import { useState } from "react"
import ReceiptImport from "./ReceiptImport"
import {
  emptyReceiptValues,
  type ReceiptReview,
} from "../../model/receipt-draft"
import type { PreviewVariant } from "../workbench/fixtures.preview"
export default function ReceiptImportPreview({
  variant,
}: {
  variant: PreviewVariant
}) {
  const [file, setFile] = useState<File | null>(null)
  const [review, setReview] = useState<ReceiptReview | null>(null)
  return (
    <div className="journal-workbench mx-auto h-dvh max-w-xl pt-16">
      <ReceiptImport
        file={file}
        review={review}
        busy={variant === "busy" ? "recognizing" : null}
        error={variant === "error" ? "识别暂不可用，可以手动填写。" : null}
        events={[]}
        onClose={() => {}}
        onSaved={() => {}}
        onChoose={(file) => {
          setFile(file)
          setReview(null)
        }}
        onChange={(values) => setReview({ ...review!, values })}
        onRecognize={async () =>
          setReview({ assetId: "preview-receipt", values: emptyReceiptValues })
        }
        onSubmit={async () => {
          if (!review)
            setReview({
              assetId: "preview-receipt",
              values: {
                ...emptyReceiptValues,
                merchant: "湖畔餐馆",
                total: "128.00",
                currency: "CNY",
              },
            })
          return undefined
        }}
      />
    </div>
  )
}
