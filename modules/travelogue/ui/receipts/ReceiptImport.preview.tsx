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
  const [file, setFile] = useState<File | null>(() =>
    variant === "empty"
      ? null
      : new File(
          [
            '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#fff"/><text x="28" y="60" font-size="18">RECEIPT</text><text x="28" y="100">CNY 128.00</text></svg>',
          ],
          "receipt.svg",
          { type: "image/svg+xml" }
        )
  )
  const [review, setReview] = useState<ReceiptReview | null>(
    variant === "empty"
      ? null
      : {
          assetId: "preview-receipt",
          values: {
            ...emptyReceiptValues,
            merchant: "湖畔餐馆",
            date: "2026-11-14",
            currency: "CNY",
            total: "128.00",
            items: [{ name: "双人午餐", quantity: "1", amount: "128.00" }],
          },
        }
  )
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
