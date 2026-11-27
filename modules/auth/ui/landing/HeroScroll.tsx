"use client"
import Image from "next/image"
import { useState } from "react"
import Link from "next/link"
const HERO_STOPS = [
  {
    label: "西湖雨晨",
    left: "15%",
    top: "86.8%",
    date: "04月12日 · 07:15",
    coord: "30.251°N 120.145°E",
    title: "孤山断桥晨雨",
    note: "细雨刚起，石桥尽头只剩半面塔影，湖面平得像未落墨的生宣。",
    width: 960,
    height: 536,
    img: "/ink/spot-westlake.webp",
    alt: "西湖孤山石桥晨雨",
  },
  {
    label: "富春江渡",
    left: "53.8%",
    top: "71.8%",
    date: "04月12日 · 10:53",
    coord: "29.793°N 119.687°E",
    title: "富春江渡口",
    note: "高铁四十一分钟出城，江面浮着一层淡青水岚，岸边石阶微湿。",
    width: 896,
    height: 1200,
    img: "/ink/ink-auth-vertical.webp",
    alt: "富春江远山轻岚",
  },
  {
    label: "龙井山房",
    left: "80.3%",
    top: "46.8%",
    date: "04月12日 · 12:20",
    coord: "29.812°N 119.642°E",
    title: "龙井山房一盏茶",
    note: "靠窗听山涧雨声，点了明前龙井与竹笋面，小票随手识别入账。",
    width: 720,
    height: 538,
    img: "/ink/spot-teahouse.webp",
    alt: "山房青瓷茶盏",
  },
  {
    label: "始信峰亭",
    left: "91.8%",
    top: "29.1%",
    date: "04月13日 · 16:40",
    coord: "30.135°N 118.174°E",
    title: "始信峰松亭",
    note: "云雾退开不过三分钟，把远处松影与同行朋友补拍的照片合进同一段记事。",
    width: 1376,
    height: 768,
    img: "/ink/ink-hero-scroll.webp",
    alt: "山脊松亭水墨远影",
  },
]
export default function HeroScroll() {
  const [selected, setSelected] = useState(0)
  const stop = HERO_STOPS[selected]!
  return (
    <section className="hero-scroll" aria-label="行旅扉页">
      <div className="hero-art-layer" aria-hidden="true">
        <Image
          unoptimized
          src="/ink/ink-hero-scroll.webp"
          alt=""
          preload
          className="hero-ink-plate"
          width="1376"
          height="768"
        />
      </div>

      <div className="hero-grid">
        <div className="hero-copy">
          <h1 className="hero-title">
            山川入卷，
            <br />
            行路留痕。
          </h1>
          <p className="hero-lead">
            把地图坐标、沿途照片、票据与随笔，收进同一条有序旅程。
          </p>
          <div className="hero-actions">
            <Link className="btn-ink btn-lg" href="/register">
              <span>持邀请码注册</span>
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
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </Link>
            <Link className="btn-paper btn-lg" href="/login">
              登录账号
            </Link>
          </div>
        </div>

        <div className="hero-route-stage" aria-label="水墨行旅游线交互预览">
          <svg
            className="hero-route-svg"
            viewBox="0 0 640 440"
            fill="none"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <line
              x1="88"
              y1="36"
              x2="88"
              y2="412"
              stroke="var(--color-journal-canvas-line)"
              strokeWidth="0.75"
              strokeDasharray="2 6"
              opacity="0.55"
            />
            <line
              x1="348"
              y1="24"
              x2="348"
              y2="412"
              stroke="var(--color-journal-canvas-line)"
              strokeWidth="0.75"
              strokeDasharray="2 6"
              opacity="0.55"
            />
            <line
              x1="572"
              y1="36"
              x2="572"
              y2="412"
              stroke="var(--color-journal-canvas-line)"
              strokeWidth="0.75"
              strokeDasharray="2 6"
              opacity="0.55"
            />

            <path
              className="route-stroke-under"
              d="M 96 382 C 192 366, 268 338, 344 316 C 418 294, 466 244, 514 206 C 546 180, 568 156, 588 128"
              stroke="var(--color-journal-accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <path
              className="route-stroke-dash"
              d="M 96 382 C 192 366, 268 338, 344 316 C 418 294, 466 244, 514 206 C 546 180, 568 156, 588 128"
              stroke="var(--color-journal-accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeDasharray="4 7"
              opacity="0.35"
            />
          </svg>

          <div className="hero-waypoint-list">
            {HERO_STOPS.map((point, i) => (
              <button
                key={point.title}
                type="button"
                className={
                  i === selected ? "hero-waypoint is-active" : "hero-waypoint"
                }
                style={{ left: point.left, top: point.top }}
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
                onFocus={() => setSelected(i)}
                onMouseEnter={() => setSelected(i)}
              >
                <span className="waypoint-dot" />
                <span className="waypoint-name">{point.label}</span>
              </button>
            ))}
          </div>

          <article
            id="hero-vignette"
            className="hero-vignette"
            aria-live="polite"
          >
            <div className="hero-vignette-media">
              <Image
                unoptimized
                width={stop.width}
                height={stop.height}
                src={stop.img}
                alt={stop.alt}
              />
            </div>
            <div className="hero-vignette-body">
              <div className="hero-vignette-meta">
                <span id="hero-vignette-date" className="tabular">
                  {stop.date}
                </span>
                <span id="hero-vignette-coord" className="tabular">
                  {stop.coord}
                </span>
              </div>
              <h2 id="hero-vignette-title" className="hero-vignette-title">
                {stop.title}
              </h2>
              <p id="hero-vignette-note" className="hero-vignette-note">
                {stop.note}
              </p>
            </div>
          </article>
        </div>
      </div>

      <div className="hero-vertical-coord tabular" aria-hidden="true">
        30°15′N · 120°09′E
      </div>
    </section>
  )
}
