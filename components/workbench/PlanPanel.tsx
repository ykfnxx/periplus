interface PlanPanelProps {
  searchQuery: string
}

export default function PlanPanel({ searchQuery }: PlanPanelProps) {
  return (
    <div className="text-sm text-[var(--periplus-walnut)]">
      计划 {searchQuery}
    </div>
  )
}
