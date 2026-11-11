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
      return envString("BETTER_AUTH_URL", periplusPublicConfig.app.baseUrl)
    },
  },
  auth: {
    get secret() {
      if (
        process.env.NODE_ENV === "production" &&
        !envString("BETTER_AUTH_SECRET")
      )
        throw new Error("BETTER_AUTH_SECRET is required in production")
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
  planning: {
    get model() {
      return envString("PERIPLUS_PLANNING_MODEL", "deepseek-flash")
    },
    get apiKey() {
      return envString("DEEPSEEK_API_KEY")
    },
    get amapKey() {
      return envString("PERIPLUS_AMAP_WEB_SERVICE_KEY")
    },
    get amapRetentionPolicyId() {
      return envString("PERIPLUS_AMAP_RETENTION_POLICY_ID")
    },
    get amapRetentionFields() {
      const fields = envString("PERIPLUS_AMAP_RETENTION_FIELDS")
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean)
      if (
        fields.some(
          (field) => !["name", "city", "address", "coordinates"].includes(field)
        )
      )
        throw new Error("Invalid PERIPLUS_AMAP_RETENTION_FIELDS")
      if (fields.length && !envString("PERIPLUS_AMAP_RETENTION_POLICY_ID"))
        throw new Error(
          "PERIPLUS_AMAP_RETENTION_POLICY_ID is required for retained fields"
        )
      return fields as ("name" | "city" | "address" | "coordinates")[]
    },
  },
  weather: {
    get archiveUrl() {
      return envString(
        "PERIPLUS_WEATHER_ARCHIVE_URL",
        "https://archive-api.open-meteo.com/v1/archive"
      )
    },
    get apiKey() {
      return envString("PERIPLUS_WEATHER_API_KEY")
    },
    get timeoutMs() {
      return envNumber("PERIPLUS_WEATHER_TIMEOUT_MS", 10000)
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
} as const
