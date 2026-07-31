import type {
  Journey,
  JourneyEvent,
  JourneyEventLink,
  SectionEvent,
  TransitEvent,
  VisitEvent,
} from "@/types/journey"

const journeyId = "preset-silk-road"

function section(
  id: string,
  title: string,
  lat: number,
  lng: number,
  description: string
): SectionEvent {
  return {
    id,
    journeyId,
    type: "SECTION",
    origin: "ORIGINAL",
    title,
    description,
    detail: { kind: "CITY", lat, lng, coordinateSystem: "GCJ02" },
  }
}

function transit(
  id: string,
  fromEventId: string,
  toEventId: string,
  parentEventId?: string,
  mode: TransitEvent["detail"]["transportMode"] = "CAR"
): TransitEvent {
  return {
    id,
    journeyId,
    parentEventId,
    type: "TRANSIT",
    executionStatus: "PLANNED",
    origin: "ORIGINAL",
    title: "交通",
    detail: {
      plannedFromEventId: fromEventId,
      plannedToEventId: toEventId,
      transportMode: mode,
      requestMode:
        mode === "WALK" ? "WALK" : mode === "SUBWAY" ? "TRANSIT" : "DRIVE",
      preference: "RECOMMENDED",
      planningStatus: "EMPTY",
    },
  }
}

function visit(
  id: string,
  parentEventId: string,
  title: string,
  lat: number,
  lng: number,
  durationMinutes: number,
  description: string
): VisitEvent {
  return {
    id,
    journeyId,
    parentEventId,
    type: "VISIT",
    executionStatus: "PLANNED",
    origin: "ORIGINAL",
    title,
    description,
    detail: {
      plannedLat: lat,
      plannedLng: lng,
      coordinateSystem: "GCJ02",
      plannedDurationMinutes: durationMinutes,
    },
  }
}

function chainLinks(events: readonly JourneyEvent[], prefix: string) {
  return events.slice(0, -1).map(
    (event, index): JourneyEventLink => ({
      id: `${prefix}-${index + 1}`,
      journeyId,
      fromEventId: event.id,
      toEventId: events[index + 1]!.id,
      kind: "MAIN",
    })
  )
}

const xian = section(
  "section-xian",
  "西安",
  34.3416,
  108.9398,
  "起点，兵马俑、大雁塔"
)
const lanzhou = section(
  "section-lanzhou",
  "兰州",
  36.0611,
  103.8343,
  "黄河风情线、牛肉面"
)
const zhangye = section(
  "section-zhangye",
  "张掖",
  38.9259,
  100.4498,
  "七彩丹霞、大佛寺"
)
const jiayuguan = section(
  "section-jiayuguan",
  "嘉峪关",
  39.7728,
  98.2892,
  "天下第一雄关"
)
const dunhuang = section(
  "section-dunhuang",
  "敦煌",
  40.1421,
  94.6615,
  "莫高窟、鸣沙山月牙泉"
)
const turpan = section(
  "section-turpan",
  "吐鲁番",
  42.9513,
  89.1897,
  "火焰山、葡萄沟"
)
const urumqi = section(
  "section-urumqi",
  "乌鲁木齐",
  43.8256,
  87.6168,
  "终点，新疆首府"
)

const topLevelEvents: JourneyEvent[] = [
  xian,
  transit("transit-xian-lanzhou", xian.id, lanzhou.id),
  lanzhou,
  transit("transit-lanzhou-zhangye", lanzhou.id, zhangye.id),
  zhangye,
  transit("transit-zhangye-jiayuguan", zhangye.id, jiayuguan.id),
  jiayuguan,
  transit("transit-jiayuguan-dunhuang", jiayuguan.id, dunhuang.id),
  dunhuang,
  transit("transit-dunhuang-turpan", dunhuang.id, turpan.id),
  turpan,
  transit("transit-turpan-urumqi", turpan.id, urumqi.id),
  urumqi,
]

const xianWall = visit(
  "visit-xian-city-wall",
  xian.id,
  "西安城墙",
  34.2655,
  108.9531,
  120,
  "从南门登城，适合安排在抵达后的半日行程"
)
const xianPagoda = visit(
  "visit-xian-dayan-pagoda",
  xian.id,
  "大雁塔",
  34.2183,
  108.9642,
  90,
  "傍晚可衔接大唐不夜城步行区"
)
const xianMuslimQuarter = visit(
  "visit-xian-muslim-quarter",
  xian.id,
  "回民街",
  34.263,
  108.945,
  90,
  "作为晚餐和夜间散步节点"
)
const xianEvents: JourneyEvent[] = [
  xianWall,
  transit("transit-xian-1", xianWall.id, xianPagoda.id, xian.id, "TAXI"),
  xianPagoda,
  transit(
    "transit-xian-2",
    xianPagoda.id,
    xianMuslimQuarter.id,
    xian.id,
    "SUBWAY"
  ),
  xianMuslimQuarter,
]

export const silkRoadJourney: Journey = {
  id: journeyId,
  ownerId: "preset",
  revision: 1,
  status: "DRAFT",
  visibility: "private",
  title: "丝绸之路",
  description: "从长安出发，经河西走廊至西域的经典路线",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  events: [...topLevelEvents, ...xianEvents],
  links: [
    ...chainLinks(topLevelEvents, "link-main"),
    ...chainLinks(xianEvents, "link-xian"),
  ],
}
