export default function BrandMark() {
  return (
    <>
      <span className="seal-stamp" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <rect
            x="2.25"
            y="2.25"
            width="19.5"
            height="19.5"
            rx="3.2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M7.5 16.5C9.5 12.2 12 12.2 14 9.5C15.2 7.8 16.5 7.5 16.5 7.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="7.5" cy="16.5" r="1.4" fill="currentColor" />
          <circle cx="16.5" cy="7.5" r="1.4" fill="currentColor" />
        </svg>
      </span>
      <span className="brand-wordmark">Periplus</span>
    </>
  )
}
