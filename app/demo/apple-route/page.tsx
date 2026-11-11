import type { Metadata } from "next"
import RouteDemo from "./route-demo"

export const metadata: Metadata = { title: "运动轨迹预览 · Periplus" }

export default function Page() {
  return <RouteDemo />
}
