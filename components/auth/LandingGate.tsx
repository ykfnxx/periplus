import Link from "next/link"

export default function LandingGate() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 text-ink">
      <section className="w-full max-w-sm text-center">
        <h1 className="text-5xl font-black tracking-normal">Periplus</h1>
        <p className="mt-3 text-sm font-bold text-walnut">
          旅行轨迹规划平台
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <Link
            href="/login"
            className="flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-bold text-soft-white transition hover:bg-russet"
          >
            登录
          </Link>
          <Link
            href="/register"
            className="flex h-11 items-center justify-center rounded-lg border border-ink-15 bg-soft-white px-4 text-sm font-bold text-ink transition hover:border-russet"
          >
            注册
          </Link>
        </div>
      </section>
    </main>
  )
}
