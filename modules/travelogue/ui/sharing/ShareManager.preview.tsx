"use client"
import { useRef, useState } from "react"
import ShareManager from "./ShareManager"
import type { ShareStatus, SharePreview } from "@/modules/data-model/contracts"
import type { PreviewVariant } from "../workbench/fixtures.preview"
import "./sharing.css"
export default function ShareManagerPreview({
  variant,
}: {
  variant: PreviewVariant
}) {
  const [includeCosts, setCosts] = useState(false)
  const [published, setPublished] = useState(false)
  const link = useRef<HTMLInputElement>(null)
  const status: ShareStatus = {
    version: published ? 1 : 0,
    sourceRevision: 12,
    currentRevision: 12,
    includeCosts,
    url: published ? "https://example.test/preview" : null,
    publishedAt: null,
    revokedAt: null,
    lastMutationId: null,
  }
  const preview: SharePreview = {
    includeCosts,
    revision: 12,
    photoUrls: {},
    document: {
      title: "杭州三日游",
      description: "分享预览",
      authors: ["预览作者"],
      cities: ["杭州"],
      events:
        variant === "empty"
          ? []
          : [
              {
                id: "preview-event",
                category: "VISIT",
                title: "西湖漫步",
                body: "雨后沿湖散步。",
                date: "2026-11-14",
                timeLabel: "10:00",
                location: "杭州西湖",
                author: "预览作者",
                photos: [],
                costs: includeCosts ? ["餐饮 ¥128.00"] : [],
                weather: null,
                transit: null,
              },
            ],
    },
  }
  return (
    <ShareManager
      status={status}
      preview={preview}
      includeCosts={includeCosts}
      changeCosts={setCosts}
      busy={variant === "busy"}
      loading={false}
      pending={variant === "conflict"}
      error={variant === "error" ? "预览未能更新，请重试。" : ""}
      notice=""
      online
      link={link}
      confirmation={null}
      returnHref="/ui-preview"
      refresh={() => {}}
      confirmPending={() => setPublished(true)}
      publish={() => setPublished(true)}
      stop={() => setPublished(false)}
      copy={() => {}}
    />
  )
}
