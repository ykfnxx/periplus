import { toNextJsHandler } from "better-auth/next-js"
import { getAuth } from "@/modules/auth/server/auth"

export const { GET, POST } = toNextJsHandler((request: Request) =>
  getAuth().handler(request)
)
