"use client"

import { Search } from "lucide-react"

interface TopSearchBarProps {
  searchQuery: string
  onSearchQueryChange: (query: string) => void
}

export default function TopSearchBar({
  searchQuery,
  onSearchQueryChange,
}: TopSearchBarProps) {
  return (
    <div className="flex h-14 items-center gap-3 rounded-full border border-[rgb(44_36_22_/_16%)] bg-white/95 px-4 shadow-[var(--periplus-soft-shadow)]">
      <div className="relative h-6 w-11 shrink-0" aria-hidden="true">
        <span className="absolute top-1 left-0 h-[18px] w-[18px] rounded-full bg-[var(--periplus-russet)] shadow-[11px_0_0_var(--periplus-mustard),22px_0_0_var(--periplus-olive)]" />
        <span className="absolute top-0 right-0 h-6 w-6 rounded-full bg-[conic-gradient(from_0deg,var(--periplus-russet)_0_10deg,transparent_10deg_20deg)] opacity-75" />
      </div>
      <label className="sr-only" htmlFor="periplus-search">
        搜索地点、路线、标签或备注
      </label>
      <Search
        className="h-4 w-4 shrink-0 text-[var(--periplus-russet)]"
        aria-hidden="true"
      />
      <input
        id="periplus-search"
        type="search"
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        placeholder="搜索地点、路线、标签或备注"
        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--periplus-ink)] outline-none placeholder:text-[var(--periplus-walnut)] focus-visible:rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--periplus-russet)]"
      />
      <span className="hidden text-base font-black text-[var(--periplus-ink)] sm:inline">
        Periplus
      </span>
    </div>
  )
}
