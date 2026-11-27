import BrandMark from "./BrandMark"
import Image from "next/image"
import Link from "next/link"
import "@/styles/ink-entry.css"
import HeroScroll from "./landing/HeroScroll"
import JourneyShowcase from "./landing/JourneyShowcase"
import FeatureLedger from "./landing/FeatureLedger"
export default function InkLanding() {
  return (
    <div className="ink-entry">
      <header className="ink-header">
        <div className="ink-header-inner">
          <a href="#top" className="brand-mark">
            <BrandMark />
          </a>

          <nav className="ink-nav" aria-label="主入口">
            <Link className="btn-link" href="/login">
              登录
            </Link>
            <Link className="btn-ink" href="/register">
              受邀注册
            </Link>
          </nav>
        </div>
      </header>
      <main id="top">
        <HeroScroll />
        <JourneyShowcase />
        <FeatureLedger />
        <section className="colophon-section" aria-label="受邀开启旅程">
          <div className="colophon-art-wrap" aria-hidden="true">
            <Image
              unoptimized
              src="/ink/ink-footer-boat.webp"
              alt=""
              className="colophon-ink-plate"
              width="1376"
              height="768"
            />
          </div>

          <div className="colophon-content">
            <h2 className="colophon-heading">下一段路，从落笔开始。</h2>

            <form
              action="/register"
              method="get"
              className="colophon-invite-form"
            >
              <label htmlFor="landing-invite-input" className="sr-only">
                输入邀请码
              </label>
              <input
                id="landing-invite-input"
                name="code"
                required
                pattern={".*\\S.*"}
                type="text"
                className="colophon-input tabular"
                placeholder="输入邀请码，例如 PERI-7K4M-9Q2X"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="btn-ink btn-lg">
                前往注册
              </button>
            </form>

            <p className="colophon-login-line">
              已有账号？
              <Link className="btn-inline-link" href="/login">
                直接登录
              </Link>
            </p>
          </div>
        </section>
      </main>
      <footer className="ink-footer">
        <div className="ink-footer-inner">
          <span className="brand-wordmark is-sm">Periplus</span>
          <span className="footer-note tabular">
            MapLibre · OpenFreeMap · MIT
          </span>
        </div>
      </footer>
    </div>
  )
}
