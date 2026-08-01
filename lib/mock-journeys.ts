import type {
  TargetJourneyEvent,
  TargetJourneyEventLink,
  TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"

const fixtureTimestamp = "2026-07-29T00:00:00.000Z"

interface FixtureOptions {
  id?: string
  ownerId?: string
}

function eventIdentity(
  journeyId: string,
  id: string,
  title: string,
  description?: string
) {
  return {
    id,
    journeyId,
    parentSectionEventId: null,
    placementStatus: "SCHEDULED" as const,
    origin: "ORIGINAL" as const,
    title,
    description,
    introducedRevision: 1,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  }
}

function section(
  journeyId: string,
  id: string,
  title: string,
  lat: number,
  lng: number,
  description: string
): TargetJourneyEvent {
  return {
    ...eventIdentity(journeyId, id, title, description),
    type: "SECTION",
    detail: { kind: "CITY", lat, lng, coordinateSystem: "GCJ02" },
  }
}

function transit(
  journeyId: string,
  id: string,
  fromEventId: string,
  toEventId: string,
  parentSectionEventId: string | null = null,
  transportMode: Extract<
    TargetJourneyEvent,
    { type: "TRANSIT" }
  >["detail"]["transportMode"] = "CAR"
): TargetJourneyEvent {
  return {
    ...eventIdentity(journeyId, id, "交通"),
    parentSectionEventId,
    type: "TRANSIT",
    executionStatus: "PLANNED",
    detail: {
      plannedFromEventId: fromEventId,
      plannedToEventId: toEventId,
      transportMode,
      requestMode:
        transportMode === "WALK"
          ? "WALK"
          : transportMode === "SUBWAY"
            ? "TRANSIT"
            : "DRIVE",
      preference: "RECOMMENDED",
      routeState: "EMPTY",
    },
  }
}

function visit(
  journeyId: string,
  id: string,
  parentSectionEventId: string,
  title: string,
  lat: number,
  lng: number,
  plannedDurationMinutes: number,
  description: string
): TargetJourneyEvent {
  return {
    ...eventIdentity(journeyId, id, title, description),
    parentSectionEventId,
    type: "VISIT",
    executionStatus: "PLANNED",
    detail: {
      plannedLat: lat,
      plannedLng: lng,
      coordinateSystem: "GCJ02",
      plannedDurationMinutes,
    },
  }
}

function chainLinks(
  journeyId: string,
  events: readonly TargetJourneyEvent[],
  prefix: string
): TargetJourneyEventLink[] {
  return events.slice(0, -1).map((event, index) => ({
    id: `${prefix}-${index + 1}`,
    journeyId,
    fromEventId: event.id,
    toEventId: events[index + 1]!.id,
    kind: "MAIN",
    rank: index,
    introducedRevision: 1,
  }))
}

export function createSilkRoadJourney(
  options: FixtureOptions = {}
): TargetJourneyGraphSnapshot {
  const journeyId = options.id ?? "preset-silk-road"
  const xian = section(
    journeyId,
    "section-xian",
    "西安",
    34.3416,
    108.9398,
    "起点，兵马俑、大雁塔"
  )
  const lanzhou = section(
    journeyId,
    "section-lanzhou",
    "兰州",
    36.0611,
    103.8343,
    "黄河风情线、牛肉面"
  )
  const zhangye = section(
    journeyId,
    "section-zhangye",
    "张掖",
    38.9259,
    100.4498,
    "七彩丹霞、大佛寺"
  )
  const jiayuguan = section(
    journeyId,
    "section-jiayuguan",
    "嘉峪关",
    39.7728,
    98.2892,
    "天下第一雄关"
  )
  const dunhuang = section(
    journeyId,
    "section-dunhuang",
    "敦煌",
    40.1421,
    94.6615,
    "莫高窟、鸣沙山月牙泉"
  )
  const turpan = section(
    journeyId,
    "section-turpan",
    "吐鲁番",
    42.9513,
    89.1897,
    "火焰山、葡萄沟"
  )
  const urumqi = section(
    journeyId,
    "section-urumqi",
    "乌鲁木齐",
    43.8256,
    87.6168,
    "终点，新疆首府"
  )
  const topLevelEvents: TargetJourneyEvent[] = [
    xian,
    transit(journeyId, "transit-xian-lanzhou", xian.id, lanzhou.id),
    lanzhou,
    transit(journeyId, "transit-lanzhou-zhangye", lanzhou.id, zhangye.id),
    zhangye,
    transit(journeyId, "transit-zhangye-jiayuguan", zhangye.id, jiayuguan.id),
    jiayuguan,
    transit(journeyId, "transit-jiayuguan-dunhuang", jiayuguan.id, dunhuang.id),
    dunhuang,
    transit(journeyId, "transit-dunhuang-turpan", dunhuang.id, turpan.id),
    turpan,
    transit(journeyId, "transit-turpan-urumqi", turpan.id, urumqi.id),
    urumqi,
  ]
  const xianWall = visit(
    journeyId,
    "visit-xian-city-wall",
    xian.id,
    "西安城墙",
    34.2655,
    108.9531,
    120,
    "从南门登城，适合安排在抵达后的半日行程"
  )
  const xianPagoda = visit(
    journeyId,
    "visit-xian-dayan-pagoda",
    xian.id,
    "大雁塔",
    34.2183,
    108.9642,
    90,
    "傍晚可衔接大唐不夜城步行区"
  )
  const xianMuslimQuarter = visit(
    journeyId,
    "visit-xian-muslim-quarter",
    xian.id,
    "回民街",
    34.263,
    108.945,
    90,
    "作为晚餐和夜间散步节点"
  )
  const xianEvents: TargetJourneyEvent[] = [
    xianWall,
    transit(
      journeyId,
      "transit-xian-1",
      xianWall.id,
      xianPagoda.id,
      xian.id,
      "TAXI"
    ),
    xianPagoda,
    transit(
      journeyId,
      "transit-xian-2",
      xianPagoda.id,
      xianMuslimQuarter.id,
      xian.id,
      "SUBWAY"
    ),
    xianMuslimQuarter,
  ]

  return {
    id: journeyId,
    ownerId: options.ownerId ?? "preset",
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: "丝绸之路",
    description: "从长安出发，经河西走廊至西域的经典路线",
    events: [...topLevelEvents, ...xianEvents],
    links: [
      ...chainLinks(journeyId, topLevelEvents, "link-main"),
      ...chainLinks(journeyId, xianEvents, "link-xian"),
    ],
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
}

export const silkRoadJourney = createSilkRoadJourney()
