import type { ReactNode } from "react"

export default function EditorShell({
  label,
  header,
  children,
  confirmation,
  onEscape,
}: {
  label: string
  header: ReactNode
  children: ReactNode
  confirmation?: ReactNode
  onEscape?: () => void
}) {
  return (
    <section
      className="journal-subpage journal-composer"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented && onEscape) {
          event.stopPropagation()
          onEscape()
        }
      }}
    >
      <header className="journal-subpage-header sticky top-0 z-10">
        {header}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
      {confirmation}
    </section>
  )
}
