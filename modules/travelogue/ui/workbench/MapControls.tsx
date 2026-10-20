import { LocateFixed, Minus, Plus } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { RecordMapRequest } from "../RecordMap"
export default function MapControls({
  onRequest,
  canFit = true,
}: {
  canFit?: boolean
  onRequest: (type: RecordMapRequest["type"]) => void
}) {
  return (
    <div
      className="journal-map-controls absolute top-5 right-5 z-10 flex flex-col gap-2"
      aria-label="地图控制"
    >
      <Button
        variant="secondary"
        shape="square"
        size="lg"
        aria-label="放大地图"
        onClick={() => onRequest("zoom-in")}
      >
        <Plus size={21} />
      </Button>
      <Button
        variant="secondary"
        shape="square"
        size="lg"
        aria-label="缩小地图"
        onClick={() => onRequest("zoom-out")}
      >
        <Minus size={21} />
      </Button>
      {canFit && (
        <Button
          variant="secondary"
          shape="square"
          size="lg"
          aria-label="查看全部记录地点"
          onClick={() => onRequest("fit")}
        >
          <LocateFixed size={20} />
        </Button>
      )}
    </div>
  )
}
