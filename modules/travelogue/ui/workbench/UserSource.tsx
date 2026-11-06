import ContextInfo from "./ContextInfo"

export default function UserSource({
  user,
  className = "",
  size = "sm",
  compact = false,
}: {
  user: { name: string; image?: string | null }
  className?: string
  size?: "sm" | "md"
  compact?: boolean
}) {
  if (compact) {
    const avatar = user.image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.image} alt="" />
    ) : (
      <span aria-hidden="true">{Array.from(user.name)[0]}</span>
    )
    return (
      <ContextInfo
        label={`作者：${user.name}`}
        className="cards-author-trigger"
        content={
          <div className="cards-author-card">
            {avatar}
            <strong>{user.name}</strong>
          </div>
        }
      >
        {avatar}
      </ContextInfo>
    )
  }
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 ${size === "md" ? "text-sm" : "text-xs"} ${className}`}
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.image}
          alt=""
          className={`${size === "md" ? "size-9" : "size-5"} shrink-0 rounded-full object-cover`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`flex ${size === "md" ? "size-9" : "size-5"} shrink-0 items-center justify-center rounded-full bg-journal-soft text-journal-muted`}
        >
          {Array.from(user.name)[0]}
        </span>
      )}
      <span className="truncate">{user.name}</span>
    </span>
  )
}
