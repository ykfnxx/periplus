"use client"
import { useState } from "react"

export default function FeatureLedger() {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <section className="ledger-section" aria-label="核心能力">
      <div className="folio-container">
        <h2 className="section-heading">记录之外，皆有分寸</h2>

        <div className="asymmetric-ledger">
          <article className="ledger-cell ledger-cell-wide">
            <div className="ledger-cell-body">
              <h3 className="ledger-title">票据拍下即归账</h3>
              <p className="ledger-desc">
                本地 OCR
                提取金额、币种与商户，核对后直接挂入当前事件，小票原图随记留存。
              </p>
            </div>

            <div className="ocr-demo-box">
              <div className="ocr-slip">
                <div className="ocr-slip-head">
                  <span>龙井山房茶舍</span>
                  <span className="tabular">04-12 12:48</span>
                </div>
                <div className="ocr-slip-row">
                  <span>明前龙井（壶）</span>
                  <span className="tabular">128.00</span>
                </div>
                <div className="ocr-slip-row">
                  <span>手剥春笋面</span>
                  <span className="tabular">40.00</span>
                </div>
                <div className="ocr-slip-total">
                  <span>合计</span>
                  <span className="tabular">¥ 168.00</span>
                </div>
              </div>

              <div className="ocr-arrow" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </div>

              <div className="ocr-result-col">
                <div className="ocr-pill-row">
                  <span className="p-expense-pill is-solid tabular">
                    CNY 168.00
                  </span>
                  <span className="p-chip">原图已附</span>
                </div>
                <button
                  type="button"
                  aria-pressed={confirmed}
                  onClick={() => setConfirmed(!confirmed)}
                  className="btn-paper btn-sm"
                >
                  {confirmed ? "已附入事件 · 撤销" : "确认入账演示"}
                </button>
                <span
                  id="ocr-status-msg"
                  className={
                    confirmed
                      ? "ocr-status-text is-confirmed"
                      : "ocr-status-text"
                  }
                  aria-live="polite"
                >
                  {confirmed
                    ? "已挂入「山房一盏雨前茶」· 原图已归档"
                    : "待核对 · 可修改币种与金额"}
                </span>
              </div>
            </div>
          </article>

          <article className="ledger-cell">
            <div className="ledger-cell-body">
              <h3 className="ledger-title">一纸链接，同游共写</h3>
              <p className="ledger-desc">
                七日有效共写邀请，同行伙伴各自补充照片、文字与花销，作者与上传归属分明，不共享彼此私有素材库。
              </p>
            </div>
            <div className="cowrite-strip">
              <div className="author-badge">
                <span className="author-dot is-ink">林</span>
                <span>发起人 · 可整理全篇</span>
              </div>
              <div className="author-badge">
                <span className="author-dot is-accent">周</span>
                <span>同行伙伴 · 编辑本人记录</span>
              </div>
            </div>
          </article>

          <article className="ledger-cell">
            <div className="ledger-cell-body">
              <h3 className="ledger-title">AI 协作，明晰边界</h3>
              <p className="ledger-desc">
                按单次旅程授予 OAuth
                权限，写入携带版本号校验，遇并发修改提示刷新，绝不静默覆盖你的手稿。
              </p>
            </div>
            <div className="scope-row tabular">
              <span className="scope-chip">journey:read</span>
              <span className="scope-chip">journey:write</span>
              <span className="scope-chip">photos:upload</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
