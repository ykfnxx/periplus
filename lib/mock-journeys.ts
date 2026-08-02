import type {
  TargetJourneyEvent,
  TargetJourneyEventLink,
  TargetJourneyGraphSnapshot,
  TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"

const fixtureTimestamp = "2026-09-30T00:00:00.000Z"
const coordinateSystem = "GCJ02" as const
const timezone = "Asia/Shanghai"

interface FixtureOptions {
  id?: string
  ownerId?: string
}

interface Schedule {
  startAt: string
  endAt: string
  durationMinutes: number
}

interface LocationOptions extends Schedule {
  title: string
  description: string
  lat: number
  lng: number
  cuisine?: string
  bookingReference?: string
  checkInNote?: string
}

interface TransitEstimateOption {
  label: string
  strategy: string
  segmentMode: TargetTransitPlanningRun["plans"][number]["segments"][number]["mode"]
  durationMinutes: number
  distanceKm: number
  fareAmount?: number
  geometryOffset?: number
}

function eventIdentity(
  journeyId: string,
  id: string,
  parentSectionEventId: string | null,
  title: string,
  description?: string
) {
  return {
    id,
    journeyId,
    parentSectionEventId,
    placementStatus: "SCHEDULED" as const,
    origin: "ORIGINAL" as const,
    title,
    description,
    introducedRevision: 1,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  }
}

function citySection(
  journeyId: string,
  id: string,
  title: string,
  lat: number,
  lng: number,
  description: string
): TargetJourneyEvent {
  return {
    ...eventIdentity(journeyId, id, null, title, description),
    type: "SECTION",
    detail: { kind: "CITY", timeZone: timezone, lat, lng, coordinateSystem },
  }
}

function daySection(
  journeyId: string,
  id: string,
  parentSectionEventId: string,
  title: string,
  localDate: string,
  description: string
): TargetJourneyEvent {
  return {
    ...eventIdentity(journeyId, id, parentSectionEventId, title, description),
    type: "SECTION",
    detail: { kind: "DAY", localDate, timezone },
  }
}

function locationEvent(
  journeyId: string,
  id: string,
  parentSectionEventId: string,
  type: "VISIT" | "MEAL" | "ACTIVITY" | "STAY",
  options: LocationOptions
): TargetJourneyEvent {
  const identity = eventIdentity(
    journeyId,
    id,
    parentSectionEventId,
    options.title,
    options.description
  )
  const executable = {
    ...identity,
    executionStatus: "PLANNED" as const,
    plannedStartAt: options.startAt,
    plannedEndAt: options.endAt,
  }
  const detail = {
    plannedLat: options.lat,
    plannedLng: options.lng,
    coordinateSystem,
    plannedDurationMinutes: options.durationMinutes,
  }

  if (type === "MEAL") {
    return {
      ...executable,
      type,
      detail: { ...detail, cuisine: options.cuisine },
    }
  }
  if (type === "ACTIVITY") {
    return {
      ...executable,
      type,
      detail: { ...detail, bookingReference: options.bookingReference },
    }
  }
  if (type === "STAY") {
    return {
      ...executable,
      type,
      detail: { ...detail, checkInNote: options.checkInNote },
    }
  }
  return { ...executable, type, detail }
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
  >["detail"]["transportMode"] = "CAR",
  schedule?: Schedule
): Extract<TargetJourneyEvent, { type: "TRANSIT" }> {
  return {
    ...eventIdentity(journeyId, id, parentSectionEventId, "交通"),
    type: "TRANSIT",
    executionStatus: "PLANNED",
    plannedStartAt: schedule?.startAt,
    plannedEndAt: schedule?.endAt,
    detail: {
      plannedFromEventId: fromEventId,
      plannedToEventId: toEventId,
      transportMode,
      requestMode:
        transportMode === "WALK"
          ? "WALK"
          : transportMode === "BUS" ||
              transportMode === "SUBWAY" ||
              transportMode === "TRAIN"
            ? "TRANSIT"
            : "DRIVE",
      preference: "RECOMMENDED",
      plannedDurationMinutes: schedule?.durationMinutes,
      routeState: "EMPTY",
    },
  }
}

function providerTransit(
  journeyId: string,
  id: string,
  from: TargetJourneyEvent,
  to: TargetJourneyEvent,
  parentSectionEventId: string | null,
  transportMode: Extract<
    TargetJourneyEvent,
    { type: "TRANSIT" }
  >["detail"]["transportMode"],
  schedule: Schedule,
  estimates: TransitEstimateOption[]
) {
  const event = transit(
    journeyId,
    id,
    from.id,
    to.id,
    parentSectionEventId,
    transportMode,
    schedule
  )
  const estimate = estimates[0]
  if (!estimate) throw new Error(`Transit ${id} requires an estimate`)
  event.detail.plannedDurationMinutes = estimate.durationMinutes
  event.detail.plannedDistanceKm = estimate.distanceKm
  event.detail.plannedCostEstimate = estimate.fareAmount
  return event
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
    rank: (index + 1) * 1024,
    introducedRevision: 1,
  }))
}

function schedule(
  startAt: string,
  endAt: string,
  durationMinutes: number
): Schedule {
  return { startAt, endAt, durationMinutes }
}

export function createSilkRoadJourney(
  options: FixtureOptions = {}
): TargetJourneyGraphSnapshot {
  const journeyId = options.id ?? "preset-silk-road"
  const events: TargetJourneyEvent[] = []
  const links: TargetJourneyEventLink[] = []
  const addScope = (scopeEvents: TargetJourneyEvent[], prefix: string) => {
    events.push(...scopeEvents)
    links.push(...chainLinks(journeyId, scopeEvents, prefix))
  }

  const xian = citySection(
    journeyId,
    "section-xian",
    "西安",
    34.3416,
    108.9398,
    "2 天 · 古城墙、唐文化与陕西风味"
  )
  const lanzhou = citySection(
    journeyId,
    "section-lanzhou",
    "兰州",
    36.0611,
    103.8343,
    "1 天 · 黄河风情线与牛肉面"
  )
  const zhangye = citySection(
    journeyId,
    "section-zhangye",
    "张掖",
    38.9259,
    100.4498,
    "1 天 · 大佛寺与七彩丹霞"
  )
  const jiayuguan = citySection(
    journeyId,
    "section-jiayuguan",
    "嘉峪关",
    39.7728,
    98.2892,
    "1 天 · 关城与长城第一墩"
  )
  const dunhuang = citySection(
    journeyId,
    "section-dunhuang",
    "敦煌",
    40.1421,
    94.6615,
    "2 天 · 莫高窟、鸣沙山与沙漠日落"
  )
  const turpan = citySection(
    journeyId,
    "section-turpan",
    "吐鲁番",
    42.9513,
    89.1897,
    "1 天 · 葡萄沟、交河故城与火焰山"
  )
  const urumqi = citySection(
    journeyId,
    "section-urumqi",
    "乌鲁木齐",
    43.8256,
    87.6168,
    "1 天 · 博物馆、大巴扎与新疆风味"
  )

  // All Transit Events start EMPTY. The debug server uses the configured AMap
  // Web Service key to persist provider geometry before a route becomes READY.
  const xianLanzhou = providerTransit(
    journeyId,
    "transit-xian-lanzhou",
    xian,
    lanzhou,
    null,
    "CAR",
    schedule("2026-10-03T00:20:00.000Z", "2026-10-03T08:20:00.000Z", 480),
    [
      {
        label: "推荐自驾",
        strategy: "RECOMMENDED",
        segmentMode: "DRIVE",
        durationMinutes: 480,
        distanceKm: 630,
      },
    ]
  )
  const lanzhouZhangye = providerTransit(
    journeyId,
    "transit-lanzhou-zhangye",
    lanzhou,
    zhangye,
    null,
    "CAR",
    schedule("2026-10-04T00:10:00.000Z", "2026-10-04T06:10:00.000Z", 360),
    [
      {
        label: "推荐自驾",
        strategy: "RECOMMENDED",
        segmentMode: "DRIVE",
        durationMinutes: 360,
        distanceKm: 510,
      },
    ]
  )
  const zhangyeJiayuguan = providerTransit(
    journeyId,
    "transit-zhangye-jiayuguan",
    zhangye,
    jiayuguan,
    null,
    "CAR",
    schedule("2026-10-05T00:40:00.000Z", "2026-10-05T03:10:00.000Z", 150),
    [
      {
        label: "推荐自驾",
        strategy: "RECOMMENDED",
        segmentMode: "DRIVE",
        durationMinutes: 150,
        distanceKm: 225,
      },
    ]
  )
  const jiayuguanDunhuang = providerTransit(
    journeyId,
    "transit-jiayuguan-dunhuang",
    jiayuguan,
    dunhuang,
    null,
    "CAR",
    schedule("2026-10-06T00:30:00.000Z", "2026-10-06T05:00:00.000Z", 270),
    [
      {
        label: "推荐自驾",
        strategy: "RECOMMENDED",
        segmentMode: "DRIVE",
        durationMinutes: 270,
        distanceKm: 370,
      },
    ]
  )
  const dunhuangTurpan = providerTransit(
    journeyId,
    "transit-dunhuang-turpan",
    dunhuang,
    turpan,
    null,
    "CAR",
    schedule("2026-10-08T00:05:00.000Z", "2026-10-08T09:05:00.000Z", 540),
    [
      {
        label: "推荐自驾",
        strategy: "RECOMMENDED",
        segmentMode: "DRIVE",
        durationMinutes: 540,
        distanceKm: 730,
      },
    ]
  )
  const turpanUrumqi = providerTransit(
    journeyId,
    "transit-turpan-urumqi",
    turpan,
    urumqi,
    null,
    "CAR",
    schedule("2026-10-09T00:30:00.000Z", "2026-10-09T03:00:00.000Z", 150),
    [
      {
        label: "推荐自驾",
        strategy: "RECOMMENDED",
        segmentMode: "DRIVE",
        durationMinutes: 150,
        distanceKm: 185,
      },
    ]
  )
  addScope(
    [
      xian,
      xianLanzhou,
      lanzhou,
      lanzhouZhangye,
      zhangye,
      zhangyeJiayuguan,
      jiayuguan,
      jiayuguanDunhuang,
      dunhuang,
      dunhuangTurpan,
      turpan,
      turpanUrumqi,
      urumqi,
    ],
    "link-main"
  )

  // 西安：直接事件 scope，集中覆盖五类卡片与多路线 TransitPlan。
  const xianWall = locationEvent(
    journeyId,
    "visit-xian-city-wall",
    xian.id,
    "VISIT",
    {
      title: "西安城墙",
      description: "从南门登城，沿城墙骑行并俯瞰古城中轴线",
      lat: 34.2655,
      lng: 108.9531,
      ...schedule("2026-10-01T01:00:00.000Z", "2026-10-01T03:00:00.000Z", 120),
    }
  )
  const xianPagoda = locationEvent(
    journeyId,
    "visit-xian-dayan-pagoda",
    xian.id,
    "VISIT",
    {
      title: "大雁塔",
      description: "参观大慈恩寺，傍晚衔接大唐不夜城步行区",
      lat: 34.2183,
      lng: 108.9642,
      ...schedule("2026-10-01T05:00:00.000Z", "2026-10-01T06:30:00.000Z", 90),
    }
  )
  const xianMuslimQuarter = locationEvent(
    journeyId,
    "visit-xian-muslim-quarter",
    xian.id,
    "VISIT",
    {
      title: "回民街",
      description: "穿行鼓楼北侧街巷，保留小吃与夜间散步时间",
      lat: 34.263,
      lng: 108.945,
      ...schedule("2026-10-01T08:00:00.000Z", "2026-10-01T09:00:00.000Z", 60),
    }
  )
  const xianTransit1 = providerTransit(
    journeyId,
    "transit-xian-1",
    xianWall,
    xianPagoda,
    xian.id,
    "TAXI",
    schedule("2026-10-01T03:00:00.000Z", "2026-10-01T03:24:00.000Z", 24),
    [
      {
        label: "推荐 · 出租车",
        strategy: "RECOMMENDED",
        segmentMode: "TAXI",
        durationMinutes: 24,
        distanceKm: 7.8,
        fareAmount: 26,
      },
      {
        label: "少步行 · 地铁",
        strategy: "LESS_WALKING",
        segmentMode: "SUBWAY",
        durationMinutes: 35,
        distanceKm: 8.6,
        fareAmount: 4,
        geometryOffset: 0.006,
      },
      {
        label: "低价 · 公交",
        strategy: "LOW_COST",
        segmentMode: "BUS",
        durationMinutes: 46,
        distanceKm: 9.4,
        fareAmount: 2,
        geometryOffset: -0.006,
      },
    ]
  )
  const xianTransit2 = providerTransit(
    journeyId,
    "transit-xian-2",
    xianPagoda,
    xianMuslimQuarter,
    xian.id,
    "SUBWAY",
    schedule("2026-10-01T06:30:00.000Z", "2026-10-01T07:05:00.000Z", 35),
    [
      {
        label: "地铁优先",
        strategy: "RECOMMENDED",
        segmentMode: "SUBWAY",
        durationMinutes: 35,
        distanceKm: 8.9,
        fareAmount: 4,
      },
      {
        label: "出租车",
        strategy: "FASTEST",
        segmentMode: "TAXI",
        durationMinutes: 27,
        distanceKm: 9.7,
        fareAmount: 31,
        geometryOffset: 0.004,
      },
    ]
  )
  const xianMeal = locationEvent(
    journeyId,
    "meal-xian-yongxingfang",
    xian.id,
    "MEAL",
    {
      title: "永兴坊陕西小吃",
      description: "葫芦鸡、肉夹馍与凉皮，保留排队缓冲",
      cuisine: "陕西菜",
      lat: 34.2675,
      lng: 108.9728,
      ...schedule("2026-10-01T09:10:00.000Z", "2026-10-01T10:10:00.000Z", 60),
    }
  )
  const xianActivity = locationEvent(
    journeyId,
    "activity-xian-tang-night",
    xian.id,
    "ACTIVITY",
    {
      title: "大唐不夜城夜游",
      description: "沿步行街看主题演出与灯光，按人流灵活调整",
      bookingReference: "TANG-NIGHT-1930",
      lat: 34.2108,
      lng: 108.9652,
      ...schedule("2026-10-01T11:30:00.000Z", "2026-10-01T13:30:00.000Z", 120),
    }
  )
  const xianStay = locationEvent(
    journeyId,
    "stay-xian-bell-tower",
    xian.id,
    "STAY",
    {
      title: "西安钟楼逸扉酒店",
      description: "靠近钟楼地铁站，方便第二天前往兵马俑",
      checkInNote: "21:45 后凭身份证在前台办理入住",
      lat: 34.2617,
      lng: 108.947,
      ...schedule("2026-10-01T13:45:00.000Z", "2026-10-02T00:00:00.000Z", 615),
    }
  )
  addScope(
    [
      xianWall,
      xianTransit1,
      xianPagoda,
      xianTransit2,
      xianMuslimQuarter,
      xianMeal,
      xianActivity,
      xianStay,
    ],
    "link-xian"
  )

  // 兰州：CITY -> DAY -> Event，作为嵌套 scope 的完整调试样本。
  const lanzhouDay = daySection(
    journeyId,
    "day-lanzhou-2026-10-03",
    lanzhou.id,
    "第 3 天 · 兰州",
    "2026-10-03",
    "黄河沿线慢游，晚间入住市中心"
  )
  addScope([lanzhouDay], "link-lanzhou-days")
  const lanzhouBridge = locationEvent(
    journeyId,
    "visit-lanzhou-zhongshan-bridge",
    lanzhouDay.id,
    "VISIT",
    {
      title: "中山桥",
      description: "从白塔山俯瞰黄河，再步行过铁桥",
      lat: 36.0673,
      lng: 103.8197,
      ...schedule("2026-10-03T06:00:00.000Z", "2026-10-03T07:20:00.000Z", 80),
    }
  )
  const lanzhouMeal = locationEvent(
    journeyId,
    "meal-lanzhou-beef-noodles",
    lanzhouDay.id,
    "MEAL",
    {
      title: "马子禄牛肉面",
      description: "选择细面与清汤，错开午餐高峰",
      cuisine: "兰州牛肉面",
      lat: 36.0567,
      lng: 103.8318,
      ...schedule("2026-10-03T07:50:00.000Z", "2026-10-03T08:40:00.000Z", 50),
    }
  )
  const lanzhouTransit = providerTransit(
    journeyId,
    "transit-lanzhou-1",
    lanzhouBridge,
    lanzhouMeal,
    lanzhouDay.id,
    "WALK",
    schedule("2026-10-03T07:20:00.000Z", "2026-10-03T07:48:00.000Z", 28),
    [
      {
        label: "沿河步行",
        strategy: "RECOMMENDED",
        segmentMode: "WALK",
        durationMinutes: 28,
        distanceKm: 2.1,
      },
      {
        label: "少步行 · 出租车",
        strategy: "LESS_WALKING",
        segmentMode: "TAXI",
        durationMinutes: 12,
        distanceKm: 3.2,
        fareAmount: 13,
        geometryOffset: 0.003,
      },
    ]
  )
  const lanzhouActivity = locationEvent(
    journeyId,
    "activity-lanzhou-yellow-river",
    lanzhouDay.id,
    "ACTIVITY",
    {
      title: "黄河夜游",
      description: "乘游船看白塔山与两岸夜景，提前 20 分钟登船",
      bookingReference: "YR-CRUISE-1930",
      lat: 36.0651,
      lng: 103.8145,
      ...schedule("2026-10-03T11:30:00.000Z", "2026-10-03T12:40:00.000Z", 70),
    }
  )
  const lanzhouStay = locationEvent(
    journeyId,
    "stay-lanzhou-center",
    lanzhouDay.id,
    "STAY",
    {
      title: "兰州中心酒店",
      description: "靠近西站，方便次日乘高铁前往张掖",
      checkInNote: "行李可提前寄存在礼宾部",
      lat: 36.0646,
      lng: 103.7517,
      ...schedule("2026-10-03T13:20:00.000Z", "2026-10-04T00:00:00.000Z", 640),
    }
  )
  addScope(
    [lanzhouBridge, lanzhouTransit, lanzhouMeal, lanzhouActivity, lanzhouStay],
    "link-lanzhou-day"
  )

  // 张掖、嘉峪关、吐鲁番和乌鲁木齐采用直接 CITY scope，方便比较
  // “无 DAY 层”与“有 DAY 层”的通用渲染。
  const zhangyeTemple = locationEvent(
    journeyId,
    "visit-zhangye-dafo",
    zhangye.id,
    "VISIT",
    {
      title: "张掖大佛寺",
      description: "参观西夏木构与国内最大的室内木胎泥塑卧佛",
      lat: 38.9281,
      lng: 100.454,
      ...schedule("2026-10-04T05:30:00.000Z", "2026-10-04T07:00:00.000Z", 90),
    }
  )
  const zhangyeMeal = locationEvent(
    journeyId,
    "meal-zhangye-cujuan",
    zhangye.id,
    "MEAL",
    {
      title: "张掖卷子鸡",
      description: "本地面食午餐，预留一小时休息",
      cuisine: "河西风味",
      lat: 38.93,
      lng: 100.4512,
      ...schedule("2026-10-04T07:10:00.000Z", "2026-10-04T08:10:00.000Z", 60),
    }
  )
  const zhangyeDanxia = locationEvent(
    journeyId,
    "activity-zhangye-danxia",
    zhangye.id,
    "ACTIVITY",
    {
      title: "七彩丹霞日落摄影",
      description: "依次停靠 2、4 号观景台，日落前抵达最后一站",
      bookingReference: "DANXIA-SUNSET",
      lat: 38.9722,
      lng: 100.0718,
      ...schedule("2026-10-04T09:30:00.000Z", "2026-10-04T12:30:00.000Z", 180),
    }
  )
  const zhangyeStay = locationEvent(
    journeyId,
    "stay-zhangye",
    zhangye.id,
    "STAY",
    {
      title: "张掖宾馆",
      description: "市中心住宿，次日清晨前往张掖西站",
      checkInNote: "前台预留无烟大床房",
      lat: 38.932,
      lng: 100.449,
      ...schedule("2026-10-04T13:30:00.000Z", "2026-10-05T00:00:00.000Z", 630),
    }
  )
  addScope(
    [zhangyeTemple, zhangyeMeal, zhangyeDanxia, zhangyeStay],
    "link-zhangye"
  )

  const jiayuguanPass = locationEvent(
    journeyId,
    "visit-jiayuguan-pass",
    jiayuguan.id,
    "VISIT",
    {
      title: "嘉峪关关城",
      description: "从东闸门进入，依次参观城楼、瓮城与长城博物馆",
      lat: 39.801,
      lng: 98.216,
      ...schedule("2026-10-05T04:00:00.000Z", "2026-10-05T06:30:00.000Z", 150),
    }
  )
  const jiayuguanMeal = locationEvent(
    journeyId,
    "meal-jiayuguan-barbecue",
    jiayuguan.id,
    "MEAL",
    {
      title: "嘉峪关烤肉",
      description: "选择本地羊肉与烤饼，控制午餐节奏",
      cuisine: "西北烧烤",
      lat: 39.772,
      lng: 98.289,
      ...schedule("2026-10-05T07:00:00.000Z", "2026-10-05T08:00:00.000Z", 60),
    }
  )
  const jiayuguanStay = locationEvent(
    journeyId,
    "stay-jiayuguan",
    jiayuguan.id,
    "STAY",
    {
      title: "嘉峪关广场假日酒店",
      description: "靠近市中心，次日打车前往火车站",
      checkInNote: "早餐打包时间 06:30",
      lat: 39.77,
      lng: 98.288,
      ...schedule("2026-10-05T12:00:00.000Z", "2026-10-06T00:00:00.000Z", 720),
    }
  )
  addScope([jiayuguanPass, jiayuguanMeal, jiayuguanStay], "link-jiayuguan")

  // 敦煌：两个 DAY section，覆盖多日嵌套导航。
  const dunhuangDay1 = daySection(
    journeyId,
    "day-dunhuang-2026-10-06",
    dunhuang.id,
    "第 6 天 · 莫高窟",
    "2026-10-06",
    "预约参观莫高窟，晚间沙洲夜市"
  )
  const dunhuangDay2 = daySection(
    journeyId,
    "day-dunhuang-2026-10-07",
    dunhuang.id,
    "第 7 天 · 鸣沙山",
    "2026-10-07",
    "鸣沙山月牙泉与沙漠日落"
  )
  addScope([dunhuangDay1, dunhuangDay2], "link-dunhuang-days")

  const mogao = locationEvent(
    journeyId,
    "visit-dunhuang-mogao",
    dunhuangDay1.id,
    "VISIT",
    {
      title: "莫高窟",
      description: "按预约时段观看数字中心影片并参观开放洞窟",
      lat: 40.0373,
      lng: 94.8091,
      ...schedule("2026-10-06T06:00:00.000Z", "2026-10-06T09:00:00.000Z", 180),
    }
  )
  const dunhuangMeal = locationEvent(
    journeyId,
    "meal-dunhuang-noodles",
    dunhuangDay1.id,
    "MEAL",
    {
      title: "达记驴肉黄面",
      description: "莫高窟返城后的晚餐，错开旅行团高峰",
      cuisine: "敦煌风味",
      lat: 40.142,
      lng: 94.661,
      ...schedule("2026-10-06T10:30:00.000Z", "2026-10-06T11:30:00.000Z", 60),
    }
  )
  const dunhuangStay1 = locationEvent(
    journeyId,
    "stay-dunhuang-1",
    dunhuangDay1.id,
    "STAY",
    {
      title: "敦煌山庄",
      description: "靠近鸣沙山，第二天可避开市区交通",
      checkInNote: "前台确认次日早餐盒与行李寄存",
      lat: 40.105,
      lng: 94.677,
      ...schedule("2026-10-06T13:30:00.000Z", "2026-10-07T00:00:00.000Z", 630),
    }
  )
  addScope([mogao, dunhuangMeal, dunhuangStay1], "link-dunhuang-day-1")

  const mingsha = locationEvent(
    journeyId,
    "visit-dunhuang-mingsha",
    dunhuangDay2.id,
    "VISIT",
    {
      title: "鸣沙山月牙泉",
      description: "上午慢游月牙泉，避开正午高温",
      lat: 40.0875,
      lng: 94.6818,
      ...schedule("2026-10-07T01:00:00.000Z", "2026-10-07T04:00:00.000Z", 180),
    }
  )
  const desertActivity = locationEvent(
    journeyId,
    "activity-dunhuang-sunset",
    dunhuangDay2.id,
    "ACTIVITY",
    {
      title: "沙漠日落与星空",
      description: "傍晚返回沙丘，日落后等待第一轮星空",
      bookingReference: "DESERT-SUNSET-1800",
      lat: 40.081,
      lng: 94.692,
      ...schedule("2026-10-07T09:30:00.000Z", "2026-10-07T13:00:00.000Z", 210),
    }
  )
  const dunhuangStay2 = locationEvent(
    journeyId,
    "stay-dunhuang-2",
    dunhuangDay2.id,
    "STAY",
    {
      title: "敦煌山庄 · 续住",
      description: "同房续住，减少整理行李时间",
      checkInNote: "房卡已续期，次日 07:20 出发去火车站",
      lat: 40.105,
      lng: 94.677,
      ...schedule("2026-10-07T13:30:00.000Z", "2026-10-08T00:00:00.000Z", 630),
    }
  )
  addScope([mingsha, desertActivity, dunhuangStay2], "link-dunhuang-day-2")

  const turpanGrapes = locationEvent(
    journeyId,
    "visit-turpan-grape-valley",
    turpan.id,
    "VISIT",
    {
      title: "葡萄沟",
      description: "参观晾房与葡萄园，午后转往交河故城",
      lat: 43.0008,
      lng: 89.186,
      ...schedule("2026-10-08T08:00:00.000Z", "2026-10-08T10:00:00.000Z", 120),
    }
  )
  const turpanMeal = locationEvent(
    journeyId,
    "meal-turpan-pilaf",
    turpan.id,
    "MEAL",
    {
      title: "吐鲁番抓饭",
      description: "抓饭、烤包子与当地水果",
      cuisine: "新疆菜",
      lat: 42.949,
      lng: 89.184,
      ...schedule("2026-10-08T10:30:00.000Z", "2026-10-08T11:30:00.000Z", 60),
    }
  )
  const turpanStay = locationEvent(
    journeyId,
    "stay-turpan",
    turpan.id,
    "STAY",
    {
      title: "吐鲁番火洲美居酒店",
      description: "靠近市中心，次日一早乘高铁前往乌鲁木齐",
      checkInNote: "前台预约 07:20 送站车辆",
      lat: 42.947,
      lng: 89.181,
      ...schedule("2026-10-08T13:30:00.000Z", "2026-10-09T00:00:00.000Z", 630),
    }
  )
  addScope([turpanGrapes, turpanMeal, turpanStay], "link-turpan")

  const urumqiMuseum = locationEvent(
    journeyId,
    "visit-urumqi-museum",
    urumqi.id,
    "VISIT",
    {
      title: "新疆维吾尔自治区博物馆",
      description: "重点参观干尸、织锦与丝路文物展厅",
      lat: 43.8172,
      lng: 87.5818,
      ...schedule("2026-10-09T03:00:00.000Z", "2026-10-09T05:30:00.000Z", 150),
    }
  )
  const urumqiMeal = locationEvent(
    journeyId,
    "meal-urumqi-bazaar",
    urumqi.id,
    "MEAL",
    {
      title: "国际大巴扎晚餐",
      description: "烤肉、馕与酸奶，预留逛手工艺市集时间",
      cuisine: "新疆菜",
      lat: 43.7802,
      lng: 87.6167,
      ...schedule("2026-10-09T10:00:00.000Z", "2026-10-09T11:30:00.000Z", 90),
    }
  )
  const urumqiActivity = locationEvent(
    journeyId,
    "activity-urumqi-bazaar",
    urumqi.id,
    "ACTIVITY",
    {
      title: "大巴扎歌舞演出",
      description: "作为全程收尾活动，演出结束后返回酒店",
      bookingReference: "BAZAAR-FINALE",
      lat: 43.7806,
      lng: 87.6172,
      ...schedule("2026-10-09T11:40:00.000Z", "2026-10-09T13:00:00.000Z", 80),
    }
  )
  const urumqiStay = locationEvent(
    journeyId,
    "stay-urumqi",
    urumqi.id,
    "STAY",
    {
      title: "乌鲁木齐人民公园希尔顿欢朋",
      description: "行程终点住宿，次日可灵活返程",
      checkInNote: "前台确认延迟退房至 14:00",
      lat: 43.806,
      lng: 87.602,
      ...schedule("2026-10-09T13:30:00.000Z", "2026-10-10T02:00:00.000Z", 750),
    }
  )
  addScope(
    [urumqiMuseum, urumqiMeal, urumqiActivity, urumqiStay],
    "link-urumqi"
  )

  return {
    id: journeyId,
    ownerId: options.ownerId ?? "preset",
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: "丝绸之路",
    description:
      "从长安出发，经河西走廊抵达乌鲁木齐；覆盖多层路线、五类事件与多交通方案的完整调试行程",
    events,
    links,
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
}

export const silkRoadJourney = createSilkRoadJourney()
