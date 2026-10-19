import type { ButtonHTMLAttributes, ReactNode } from "react"
import { twMerge as cn } from "tailwind-merge"

export function RecordButton({
  primary = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-russet disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "border-russet bg-russet text-white hover:bg-teak"
          : "border-ink-15 bg-soft-white text-ink hover:border-russet hover:text-russet",
        className
      )}
      {...props}
    />
  )
}

export const recordInputClass =
  "w-full rounded-xl border border-ink-15 bg-soft-white px-3 py-2.5 text-sm text-ink outline-none focus:border-russet focus:ring-2 focus:ring-russet/15"

export function RecordField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-bold text-walnut">
      {label}
      {children}
    </label>
  )
}

export function RecordError({ message }: { message: string | null }) {
  return message ? (
    <p
      role="alert"
      className="rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral"
    >
      {message}
    </p>
  ) : null
}
