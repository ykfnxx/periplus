import ContextInfo from "./ContextInfo"

import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Snowflake,
  Sun,
  Thermometer,
  type LucideIcon,
} from "lucide-react"
import type { EventWeather as Weather } from "@/modules/data-model/contracts"

// WMO interpretation: https://open-meteo.com/en/docs/historical-weather-api
const conditions: Record<number, [string, LucideIcon]> = {
  0: ["晴", Sun],
  1: ["晴间多云", CloudSun],
  2: ["多云", Cloud],
  3: ["阴", Cloud],
  45: ["雾", CloudFog],
  48: ["冻雾", CloudFog],
  51: ["小毛毛雨", CloudDrizzle],
  53: ["毛毛雨", CloudDrizzle],
  55: ["强毛毛雨", CloudDrizzle],
  56: ["小冻毛毛雨", CloudDrizzle],
  57: ["强冻毛毛雨", CloudDrizzle],
  61: ["小雨", CloudRain],
  63: ["中雨", CloudRain],
  65: ["大雨", CloudRain],
  66: ["小冻雨", CloudRain],
  67: ["强冻雨", CloudRain],
  71: ["小雪", CloudSnow],
  73: ["中雪", CloudSnow],
  75: ["大雪", CloudSnow],
  77: ["雪粒", Snowflake],
  80: ["小阵雨", CloudRain],
  81: ["阵雨", CloudRain],
  82: ["强阵雨", CloudRain],
  85: ["小阵雪", CloudSnow],
  86: ["强阵雪", CloudSnow],
  95: ["雷雨", CloudLightning],
  96: ["雷雨夹冰雹", CloudLightning],
  97: ["强雷雨", CloudLightning],
  99: ["强雷雨夹冰雹", CloudLightning],
}

function WeatherValue({ weather }: { weather?: Weather | null }) {
  if (!weather) return null
  if (weather.precision === "DAILY")
    return (
      <span className="journal-weather" data-weather-precision="DAILY">
        当日{Math.round(weather.temperatureMinC)}–
        {Math.round(weather.temperatureMaxC)}°C
      </span>
    )
  const condition = conditions[weather.weatherCode]
  const Icon = condition?.[1] || Thermometer
  return (
    <span className="journal-weather" data-weather-precision="HOURLY">
      <Icon size={16} aria-hidden="true" />
      <span>
        {condition && `${condition[0]} · `}
        <span className="whitespace-nowrap">
          约{Math.round(weather.temperatureC)}°C
        </span>
      </span>
    </span>
  )
}

export default function EventWeather({
  weather,
}: {
  weather?: Weather | null
}) {
  if (!weather) return null
  return (
    <ContextInfo
      label="天气数据来源与许可"
      className="cards-weather-trigger"
      content={
        <>
          <div className="cards-info-title">天气数据</div>
          <WeatherAttribution weather={weather} />
        </>
      }
    >
      <WeatherValue weather={weather} />
    </ContextInfo>
  )
}

export function WeatherAttribution({ weather }: { weather?: Weather | null }) {
  return weather ? (
    <span className="journal-weather-source">
      天气数据：
      <a
        href="https://open-meteo.com/"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        Open-Meteo
      </a>
      {" · "}
      <a
        href="https://open-meteo.com/en/licence"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        CC BY 4.0
      </a>
    </span>
  ) : null
}
