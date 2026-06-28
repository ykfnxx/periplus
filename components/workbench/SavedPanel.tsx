interface SavedPanelProps {
  searchQuery: string
}

export default function SavedPanel({ searchQuery }: SavedPanelProps) {
  return (
    <div className="text-sm text-[var(--periplus-walnut)]">
      收藏 {searchQuery}
    </div>
  )
}
