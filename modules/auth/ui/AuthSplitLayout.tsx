import BrandMark from "./BrandMark"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import "@/styles/ink-entry.css"
export default function AuthSplitLayout({
  register = false,
  children,
}: {
  register?: boolean
  children: ReactNode
}) {
  return (
    <div className="ink-entry">
      <div className="auth-split">
        <aside className="auth-folio">
          <div className="auth-folio-top">
            <Link href="/" className="brand-mark">
              <BrandMark />
            </Link>
          </div>

          <div className="auth-folio-art" aria-hidden="true">
            <Image
              unoptimized
              src="/ink/ink-auth-vertical.webp"
              alt=""
              className="auth-ink-plate"
              width="896"
              height="1200"
            />
          </div>

          <div className="auth-folio-foot">
            <p className="auth-folio-quote">
              {register
                ? "受邀启卷，记下你的第一段旅程。"
                : "山川入卷，行路留痕。"}
            </p>
            <span className="auth-folio-coord tabular">30°15′N · 120°09′E</span>
          </div>
        </aside>

        <main className="auth-stage">
          <div className="auth-mobile-bar">
            <Link href="/" className="btn-back">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              <span>返回</span>
            </Link>
            <span className="brand-wordmark is-sm">Periplus</span>
          </div>

          <section className="auth-card">
            <h1 className="auth-title">{register ? "受邀注册" : "登录"}</h1>
            {children}
          </section>
        </main>
      </div>
    </div>
  )
}
