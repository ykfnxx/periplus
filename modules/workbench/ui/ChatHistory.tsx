"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import Image from "next/image"
import { ExternalLink, Hotel, MapPin } from "lucide-react"
import type { TargetWorkspaceMessage } from "@/modules/data-model/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { selectWorkspaceLocked } from "@/modules/workspace/state/selectors"

export default function ChatHistory() {
  const chatMessages = useWorkspaceStore((state) => state.chatMessages)
  const isWorkspaceLocked = useWorkspaceStore(selectWorkspaceLocked)
  const workspaceSuggestions = useWorkspaceStore(
    (state) => state.workspaceDocument?.suggestions
  )
  const suggestions =
    workspaceSuggestions?.filter(
      (suggestion) => suggestion.status === "PENDING"
    ) ?? []

  if (!chatMessages.length && !suggestions.length && !isWorkspaceLocked) {
    return null
  }

  return (
    <div className="space-y-4">
      {chatMessages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap text-soft-white">
              {message.content}
            </div>
          </div>
        ) : (
          <div
            key={message.id}
            className="periplus-markdown text-sm leading-6 text-ink"
          >
            {message.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            ) : null}
            <SearchResultCards blocks={message.blocks} />
          </div>
        )
      )}
      {isWorkspaceLocked && (
        <div className="text-xs font-bold text-teak">正在规划...</div>
      )}
      {suggestions.map((suggestion) => (
        <div
          key={suggestion.id}
          className="rounded-xl border border-ink-10 bg-white p-3 shadow-periplus-soft"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-ink">
                {suggestion.title}
              </h3>
              <p className="mt-1 text-xs leading-5 text-walnut">
                {suggestion.summary}
              </p>
              <p className="mt-1 text-[11px] font-bold text-teak">
                {suggestion.commandPayloads.length} 项变更 · 建议模式待确认
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SearchResultCards({
  blocks = [],
}: {
  blocks?: TargetWorkspaceMessage["blocks"]
}) {
  return blocks.map((block) => {
    if (block.type === "hotel_search") {
      return (
        <section key={`${block.type}-${block.fetchedAt}`} className="mt-3">
          <p className="mb-2 text-xs font-black text-ink">{block.title}</p>
          <div className="flex gap-3 overflow-x-auto pb-1 md:block md:space-y-3 md:overflow-visible">
            {block.candidates.map((hotel) => (
              <article
                key={hotel.candidateId}
                className="min-w-[238px] overflow-hidden rounded-xl border border-ink-10 bg-white shadow-periplus-soft md:grid md:min-w-0 md:grid-cols-[104px_1fr]"
              >
                <CardImage src={hotel.imageUrl} label={hotel.name} />
                <div className="p-3">
                  <p className="truncate text-sm font-black text-ink">
                    {hotel.name}
                  </p>
                  {hotel.address ? (
                    <p className="mt-1 flex items-start gap-1 text-xs leading-5 text-walnut">
                      <MapPin
                        className="mt-0.5 h-3 w-3 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="line-clamp-2">{hotel.address}</span>
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {hotel.startingPrice ? (
                      <span className="text-xs font-black text-coral">
                        {hotel.startingPrice.currency}{" "}
                        {hotel.startingPrice.amount} 起
                      </span>
                    ) : null}
                    {hotel.externalUrl ? (
                      <a
                        href={hotel.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs font-black text-teak hover:text-russet"
                      >
                        查看详情
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )
    }

    return (
      <section key={`${block.type}-${block.fetchedAt}`} className="mt-3">
        <p className="mb-2 text-xs font-black text-ink">{block.title}</p>
        <div className="flex gap-3 overflow-x-auto pb-1 md:block md:space-y-3 md:overflow-visible">
          {block.candidates.map((place) => (
            <article
              key={place.candidateId}
              className="min-w-[220px] overflow-hidden rounded-xl border border-ink-10 bg-white shadow-periplus-soft md:grid md:min-w-0 md:grid-cols-[104px_1fr]"
            >
              <CardImage src={place.imageUrl} label={place.name} />
              <div className="p-3">
                <p className="truncate text-sm font-black text-ink">
                  {place.name}
                </p>
                <p className="mt-1 text-xs font-bold text-teak">
                  {placeCategoryLabel(place.category)}
                </p>
                {place.address ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-walnut">
                    {place.address}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    )
  })
}

function CardImage({ src, label }: { src?: string; label: string }) {
  return src ? (
    <Image
      src={src}
      alt={label}
      width={320}
      height={160}
      unoptimized
      className="h-28 w-full object-cover md:h-full"
    />
  ) : (
    <div className="flex h-28 items-center justify-center bg-route-summary text-olive md:h-full">
      <Hotel className="h-6 w-6" aria-hidden="true" />
    </div>
  )
}

function placeCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    SIGHT: "景点",
    PARK: "公园",
    MUSEUM: "博物馆",
    CULTURE: "文化地点",
    PERFORMANCE: "演出",
    SPORTS: "运动",
    ENTERTAINMENT: "娱乐",
    RESTAURANT: "餐饮",
    HOTEL: "酒店",
    TRANSIT: "交通",
    OTHER: "地点",
  }
  return labels[category] ?? "地点"
}
