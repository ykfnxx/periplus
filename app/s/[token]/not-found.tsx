import "@/modules/travelogue/ui/sharing/sharing.css"
export default function UnavailableShare() {
  return (
    <main className="share-page">
      <div className="share-empty">
        <span className="share-brand">Periplus</span>
        <h1>这篇游记暂不可访问</h1>
        <p>链接可能有误，或作者已停止分享。</p>
      </div>
    </main>
  )
}
