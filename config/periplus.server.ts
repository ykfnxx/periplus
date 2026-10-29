import { periplusPublicConfig } from "./periplus"

function envString(name: string, fallback = "") {
  return process.env[name] || fallback
}

function envNumber(name: string, fallback: number) {
  const value = envString(name)
  if (!value) return fallback

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const periplusServerConfig = {
  development: {
    get bypassLogin() {
      // A public client flag must never grant an identity. Production ignores
      // this switch even if a development env file was accidentally reused.
      return (
        process.env.NODE_ENV === "development" &&
        envString("PERIPLUS_DEVELOPER_MODE") === "true"
      )
    },
  },
  app: {
    get baseUrl() {
      return periplusPublicConfig.app.baseUrl
    },
  },
  auth: {
    get secret() {
      return envString(
        "BETTER_AUTH_SECRET",
        "periplus-dev-secret-change-before-production-000000"
      )
    },
  },
  database: {
    get url() {
      const url = envString("DATABASE_URL")
      if (!/^postgres(?:ql)?:\/\//.test(url)) {
        throw new Error("DATABASE_URL must be a PostgreSQL connection URL")
      }
      return url
    },
  },
  ocr: {
    get url() {
      return envString("PERIPLUS_OCR_URL", "http://127.0.0.1:8106/ocr")
    },
    get timeoutMs() {
      return envNumber("PERIPLUS_OCR_TIMEOUT_MS", 60000)
    },
  },
  storage: {
    get scheme() {
      const scheme = envString("PERIPLUS_STORAGE_SCHEME", "s3")
      if (scheme !== "s3" && scheme !== "fs" && scheme !== "memory") {
        throw new Error("Unsupported PERIPLUS_STORAGE_SCHEME")
      }
      return scheme
    },
    get root() {
      return envString("PERIPLUS_STORAGE_ROOT", "./uploads")
    },
    get bucket() {
      return envString("PERIPLUS_STORAGE_BUCKET")
    },
    get region() {
      return envString("PERIPLUS_STORAGE_REGION", "us-east-1")
    },
    get endpoint() {
      return envString("PERIPLUS_STORAGE_ENDPOINT")
    },
    get accessKeyId() {
      return envString("PERIPLUS_STORAGE_ACCESS_KEY_ID")
    },
    get secretAccessKey() {
      return envString("PERIPLUS_STORAGE_SECRET_ACCESS_KEY")
    },
  },
  amap: {
    get webServiceKey() {
      // JS API 与 Web 服务使用不同类型的 Key，不能互相回退。
      return envString("PERIPLUS_AMAP_WEB_SERVICE_KEY")
    },
  },
} as const
