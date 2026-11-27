"use client"
import Image from "next/image"
import { useState } from "react"

const WORKBENCH_EVENTS = [
  { name: "孤山石桥听雨", coord: "30.251°N · 120.145°E · WGS84" },
  {
    name: "杭州东 → 桐庐 · 高铁 41 分钟",
    coord: "29.793°N · 119.687°E · 交通段",
  },
  { name: "山房一盏雨前茶", coord: "29.812°N · 119.642°E · WGS84" },
]
export default function JourneyShowcase() {
  const [workbench, setWorkbench] = useState(true)
  const [selected, setSelected] = useState(0)
  return (
    <section className="folio-section" aria-label="地图工作台与长文分享演示">
      <div className="folio-container">
        <div className="section-head-row">
          <h2 className="section-heading">一卷事件流，两重阅读面</h2>
          <div className="mode-switch" role="group" aria-label="切换产品表面">
            <button
              type="button"
              aria-pressed={workbench}
              className={"mode-switch-btn" + (workbench ? " is-active" : "")}
              onClick={() => setWorkbench(true)}
            >
              地图工作台
            </button>
            <button
              type="button"
              aria-pressed={!workbench}
              className={"mode-switch-btn" + (!workbench ? " is-active" : "")}
              onClick={() => setWorkbench(false)}
            >
              公开长文分享
            </button>
          </div>
        </div>

        <div hidden={!workbench} className="surface-stage is-active">
          <div className="workbench-demo">
            <div className="demo-stream-panel">
              <div className="demo-panel-header">
                <span className="demo-journey-name">江南春雨四日</span>
                <span className="demo-date-pill tabular">04月12日</span>
              </div>

              <div className="demo-date-divider">
                <span className="tabular">04月12日 · 杭州至桐庐</span>
              </div>

              <article
                className={
                  "p-card p-card-visit" + (selected === 0 ? " is-selected" : "")
                }
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setSelected(0)
                  }
                }}
                role="button"
                onClick={() => setSelected(0)}
                aria-current={selected === 0}
              >
                <div className="p-card-cover">
                  <Image
                    unoptimized
                    width={960}
                    height={536}
                    src="/ink/spot-westlake.webp"
                    alt="西湖孤山石桥"
                  />
                  <span className="p-cover-count tabular">4</span>
                </div>
                <div className="p-card-content">
                  <div className="p-card-meta tabular">
                    <span>07:15</span>
                    <span>小雨 16°C</span>
                    <span className="p-card-city">杭州</span>
                  </div>
                  <h3 className="p-event-title">孤山石桥听雨</h3>
                  <p className="p-card-body">
                    趁游人未至沿白堤步行，雨点落进湖面很快化开，拍下四张雾里断桥。
                  </p>
                  <div className="p-card-footer">
                    <span className="p-chip">游览</span>
                    <span className="p-expense-pill tabular">¥ 0</span>
                  </div>
                </div>
              </article>

              <article
                className={
                  "p-card p-card-transit" +
                  (selected === 1 ? " is-selected" : "")
                }
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setSelected(1)
                  }
                }}
                role="button"
                onClick={() => setSelected(1)}
                aria-current={selected === 1}
              >
                <div className="p-card-content">
                  <div className="p-transit-top">
                    <span className="p-transit-badge">
                      <svg
                        viewBox="0 0 24 24"
                        width="13"
                        height="13"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="4" y="3" width="16" height="15" rx="2" />
                        <path d="M4 11h16" />
                        <path d="M12 3v8" />
                        <path d="m8 21 2-3" />
                        <path d="m16 21-2-3" />
                      </svg>
                      <span>高铁</span>
                    </span>
                    <span className="p-expense-pill p-expense-pill-transit tabular">
                      ¥ 38
                    </span>
                  </div>
                  <div className="p-transit-route">
                    <div className="p-transit-end">
                      <span className="p-transit-time tabular">10:12</span>
                      <span className="p-transit-place">杭州东</span>
                    </div>
                    <div className="p-transit-axis tabular">
                      <span>41 分钟</span>
                      <div className="p-transit-line">
                        <span className="p-transit-dot"></span>
                        <span className="p-transit-rule"></span>
                        <span className="p-transit-dot"></span>
                      </div>
                    </div>
                    <div className="p-transit-end is-right">
                      <span className="p-transit-time tabular">10:53</span>
                      <span className="p-transit-place">桐庐</span>
                    </div>
                  </div>
                </div>
              </article>

              <article
                className={
                  "p-card p-card-horizontal" +
                  (selected === 2 ? " is-selected" : "")
                }
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setSelected(2)
                  }
                }}
                role="button"
                onClick={() => setSelected(2)}
                aria-current={selected === 2}
              >
                <div className="p-card-cover-h">
                  <Image
                    unoptimized
                    width={720}
                    height={538}
                    src="/ink/spot-teahouse.webp"
                    alt="青瓷茶盏"
                  />
                </div>
                <div className="p-card-content">
                  <div className="p-card-meta tabular">
                    <span>12:20</span>
                    <span className="p-card-city">桐庐</span>
                  </div>
                  <h3 className="p-event-title">山房一盏雨前茶</h3>
                  <p className="p-card-body">
                    靠窗听山涧雨声，点了明前龙井与竹笋面。
                  </p>
                  <div className="p-card-footer">
                    <span className="p-chip">餐饮</span>
                    <span className="p-expense-pill tabular">¥ 168</span>
                  </div>
                </div>
              </article>
            </div>

            <div className="demo-map-stage" aria-label="同步足迹地图">
              <div className="demo-map-backdrop">
                <svg
                  className="demo-map-svg"
                  viewBox="0 0 680 540"
                  fill="none"
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden="true"
                >
                  <path
                    d="M-20 140 Q 160 110, 290 190 T 700 150"
                    stroke="#c8d4d1"
                    strokeWidth="1"
                  />
                  <path
                    d="M-20 220 Q 180 185, 320 270 T 700 245"
                    stroke="#c8d4d1"
                    strokeWidth="1"
                  />
                  <path
                    d="M-20 350 Q 220 310, 380 390 T 700 360"
                    stroke="#c8d4d1"
                    strokeWidth="1"
                  />

                  <path
                    d="M 60 560 C 140 440, 220 380, 330 330 C 440 280, 520 210, 640 80"
                    stroke="#cddce0"
                    strokeWidth="26"
                    strokeLinecap="round"
                    opacity="0.65"
                  />
                  <path
                    d="M 60 560 C 140 440, 220 380, 330 330 C 440 280, 520 210, 640 80"
                    stroke="#b9cfd5"
                    strokeWidth="1.5"
                    strokeDasharray="6 8"
                    opacity="0.7"
                  />

                  <path
                    d="M 210 178 C 285 205, 325 258, 376 300"
                    stroke="var(--color-journal-transit-accent)"
                    strokeWidth="2.2"
                    strokeDasharray="6 6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 376 300 C 420 336, 466 368, 514 392"
                    stroke="var(--color-map-route)"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>

                <button
                  type="button"
                  aria-label={WORKBENCH_EVENTS[0]!.name}
                  className={
                    "polaroid-pin" + (selected === 0 ? " is-selected" : "")
                  }
                  style={{ left: "31%", top: "33%" }}
                  onClick={() => setSelected(0)}
                  aria-pressed={selected === 0}
                >
                  <span className="polaroid-stack polaroid-back-2"></span>
                  <span className="polaroid-stack polaroid-back-1"></span>
                  <span className="polaroid-front">
                    <Image
                      unoptimized
                      width={960}
                      height={536}
                      src="/ink/spot-westlake.webp"
                      alt="孤山石桥照片簇"
                    />
                  </span>
                  <span className="polaroid-count tabular">4</span>
                  <span className="polaroid-anchor"></span>
                </button>

                <button
                  type="button"
                  aria-label={WORKBENCH_EVENTS[1]!.name}
                  className={
                    "map-ordinal-pin" + (selected === 1 ? " is-selected" : "")
                  }
                  style={{ left: "55.3%", top: "55.5%" }}
                  onClick={() => setSelected(1)}
                  aria-pressed={selected === 1}
                >
                  <span className="tabular">2</span>
                </button>

                <button
                  type="button"
                  aria-label={WORKBENCH_EVENTS[2]!.name}
                  className={
                    "polaroid-pin" + (selected === 2 ? " is-selected" : "")
                  }
                  style={{ left: "75.5%", top: "72.5%" }}
                  onClick={() => setSelected(2)}
                  aria-pressed={selected === 2}
                >
                  <span className="polaroid-front">
                    <Image
                      unoptimized
                      width={720}
                      height={538}
                      src="/ink/spot-teahouse.webp"
                      alt="桐庐山房茶盏"
                    />
                  </span>
                  <span className="polaroid-anchor"></span>
                </button>

                <div className="demo-map-caption">
                  <span
                    id="demo-map-focus-name"
                    className="demo-map-focus-name"
                  >
                    {WORKBENCH_EVENTS[selected]!.name}
                  </span>
                  <span
                    id="demo-map-focus-coord"
                    className="demo-map-focus-coord tabular"
                  >
                    {WORKBENCH_EVENTS[selected]!.coord}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="surface-stage" hidden={workbench}>
          <div className="share-preview-sheet">
            <div className="share-cover-folio">
              <span className="share-date-range tabular">
                2026.04.12 — 04.15 · 杭州 · 桐庐
              </span>
              <h3 className="share-folio-title">江南春雨四日</h3>
              <p className="share-folio-intro">
                不必提前排满行程表，沿途停下拍的照片、车票与小记，发布后自然成篇。
              </p>
            </div>
            <div className="share-body-grid">
              <div className="share-day-rail tabular">
                <span className="share-day-chip is-active">第 1 日</span>
                <span className="share-day-chip">第 2 日</span>
                <span className="share-day-chip">第 3 日</span>
              </div>
              <div className="share-article-col">
                <div className="share-entry-box">
                  <div className="share-entry-meta tabular">
                    07:15 · 杭州 · 小雨 16°C
                  </div>
                  <h4 className="share-entry-title">孤山石桥听雨</h4>
                  <p className="share-entry-text">
                    趁游人未至沿白堤步行，雨点落进湖面很快化开。远处宝俶塔在青灰水雾里只剩轮廓，停在桥头拍了四张照片，顺手记下出发时的安静。
                  </p>
                </div>
                <div className="share-entry-box">
                  <div className="share-entry-meta tabular">
                    12:20 · 桐庐 · 餐饮 · ¥ 168
                  </div>
                  <h4 className="share-entry-title">山房一盏雨前茶</h4>
                  <p className="share-entry-text">
                    出高铁站绕进山路，窗外是连片春茶与湿润青瓦。把茶单拍照识入账目，一并留在中午这一刻里。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
