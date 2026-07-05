import Link from "next/link"

export default function LandingGate() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--periplus-cream)] px-6 text-[var(--periplus-ink)]">
      <section className="w-full max-w-sm text-center">
        <h1 className="text-5xl font-black tracking-normal">Periplus</h1>
        <p className="mt-3 text-sm font-bold text-[var(--periplus-walnut)]">
          旅行轨迹规划平台
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <Link
            href="/login"
            className="flex h-11 items-center justify-center rounded-lg bg-[var(--periplus-ink)] px-4 text-sm font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-russet)]"
          >
            登录
          </Link>
          <Link
            href="/register"
            className="flex h-11 items-center justify-center rounded-lg border border-[rgb(44_36_22_/_16%)] bg-[var(--periplus-soft-white)] px-4 text-sm font-black text-[var(--periplus-ink)] transition hover:border-[var(--periplus-russet)]"
          >
            注册
          </Link>
        </div>
      </section>
    </main>
  )
}
