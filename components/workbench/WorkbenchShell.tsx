"use client"

import { useState } from "react"
import { useMapStore, type WorkbenchTab } from "@/stores/mapStore"
import ExplorePanel from "./ExplorePanel"
import PlanPanel from "./PlanPanel"
import SavedPanel from "./SavedPanel"
import TopSearchBar from "./TopSearchBar"

const tabs: Array<{ id: WorkbenchTab; label: string }> = [
  { id: "explore", label: "探索" },
  { id: "plan", label: "计划" },
  { id: "saved", label: "收藏" },
]

export default function WorkbenchShell() {
  const activeTab = useMapStore((state) => state.activeWorkbenchTab)
  const setActiveTab = useMapStore((state) => state.setActiveWorkbenchTab)
  const [searchQuery, setSearchQuery] = useState("")

  return (
    <section className="pointer-events-none absolute top-5 bottom-5 left-5 z-20 grid w-[min(410px,calc(100vw-40px))] grid-rows-[56px_1fr] gap-3">
      <div className="pointer-events-auto">
        <TopSearchBar
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />
      </div>
      <div className="pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-lg border border-[rgb(44_36_22_/_16%)] bg-[var(--periplus-soft-white)]/95 shadow-[var(--periplus-shadow)]">
        <div
          role="tablist"
          aria-label="Periplus 工作台"
          className="grid grid-cols-3 gap-2 p-4 pb-0"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`h-9 rounded-full border text-xs font-black transition-colors ${
                activeTab === tab.id
                  ? "border-[var(--periplus-ink)] bg-[var(--periplus-ink)] text-[var(--periplus-soft-white)]"
                  : "border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)]/80 text-[var(--periplus-walnut)] hover:border-[var(--periplus-russet)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {activeTab === "explore" && (
            <ExplorePanel searchQuery={searchQuery} />
          )}
          {activeTab === "plan" && <PlanPanel searchQuery={searchQuery} />}
          {activeTab === "saved" && <SavedPanel searchQuery={searchQuery} />}
        </div>
      </div>
    </section>
  )
}
