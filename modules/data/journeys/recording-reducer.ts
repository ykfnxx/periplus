import { createHash } from "node:crypto"
import {
  recordingEventContentSchema,
  type RecordingCommand,
  type RecordingEventContent,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { JourneyInputError } from "./journey-repository"
import {
  recordingChain,
  type RecordingChainEvent,
} from "./recording-projection"

export const emptyRecordingContent: RecordingEventContent = {
  title: "",
  body: "",
  category: null,
  date: null,
  time: null,
  timeZone: null,
  location: null,
}

export function recordingId(journeyId: string, key: string, label: string) {
  return createHash("sha256")
    .update(JSON.stringify([journeyId, key, label]))
    .digest("hex")
}

export function recordingContent(input: unknown): RecordingEventContent {
  const content = recordingEventContentSchema.parse(input)
  if (content.time !== null && content.date === null) {
    throw new JourneyInputError("A recorded time requires a recorded date")
  }
  if (content.timeZone !== null) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: content.timeZone })
    } catch {
      throw new JourneyInputError("Invalid recording time zone")
    }
  }
  return content
}

function indexTitle(content: RecordingEventContent) {
  return (
    content.title.trim() ||
    content.body.trim().split("\n")[0] ||
    "未命名记录"
  ).slice(0, 200)
}

export function requireRecordingEvent(
  graph: TargetJourneyGraphSnapshot,
  id: string
): RecordingChainEvent {
  const event = graph.events.find(
    (event) => event.id === id && !event.retiredRevision
  )
  if (!event || event.type !== "RECORD")
    throw new JourneyInputError("Recording event not found")
  return event
}

function insertAfter(
  ids: string[],
  eventId: string,
  afterEventId: string | null
) {
  if (afterEventId === eventId)
    throw new JourneyInputError("An event cannot be placed after itself")
  const index = afterEventId === null ? -1 : ids.indexOf(afterEventId)
  if (afterEventId !== null && index < 0)
    throw new JourneyInputError("Insertion anchor not found")
  ids.splice(index + 1, 0, eventId)
}

function persistOrder(
  graph: TargetJourneyGraphSnapshot,
  ids: string[],
  key: string
) {
  const desired = ids
    .slice(1)
    .map((to, index) => ({ from: ids[index]!, to, rank: index }))
  const retained = new Set<string>()
  for (const edge of desired) {
    const existing = graph.links.find(
      (link) =>
        !link.retiredRevision &&
        link.kind === "MAIN" &&
        link.fromEventId === edge.from &&
        link.toEventId === edge.to &&
        link.rank === edge.rank
    )
    if (existing) {
      retained.add(existing.id)
      continue
    }
    const id = recordingId(graph.id, key, `link:${edge.from}:${edge.to}`)
    graph.links.push({
      id,
      journeyId: graph.id,
      fromEventId: edge.from,
      toEventId: edge.to,
      kind: "MAIN",
      rank: edge.rank,
      introducedRevision: graph.revision,
    })
    retained.add(id)
  }
  for (const link of graph.links) {
    if (!link.retiredRevision && !retained.has(link.id)) {
      link.retiredRevision = graph.revision
    }
  }
}

export function reduceRecordingCore(
  graph: TargetJourneyGraphSnapshot,
  command: RecordingCommand,
  key: string,
  now: string
): string | undefined {
  const ids = recordingChain(graph).map((event) => event.id)
  if (command.name === "journey.update") {
    Object.assign(graph, command.patch)
    return
  }
  if (command.name === "event.add") {
    const id = recordingId(graph.id, key, "event")
    const detail = recordingContent({
      ...emptyRecordingContent,
      ...command.content,
    })
    insertAfter(ids, id, command.afterEventId)
    graph.events.push({
      id,
      journeyId: graph.id,
      type: "RECORD",
      detail,
      title: indexTitle(detail),
      parentSectionEventId: null,
      placementStatus: "SCHEDULED",
      origin: "USER_INSERTED",
      introducedRevision: graph.revision,
      createdAt: now,
      updatedAt: now,
    })
    persistOrder(graph, ids, key)
    return id
  }
  if (command.name === "event.update") {
    const event = requireRecordingEvent(graph, command.eventId)
    event.detail = recordingContent({ ...event.detail, ...command.patch })
    event.title = indexTitle(event.detail)
    event.updatedAt = now
    return event.id
  }
  if (command.name === "event.move") {
    const event = requireRecordingEvent(graph, command.eventId)
    ids.splice(ids.indexOf(event.id), 1)
    insertAfter(ids, event.id, command.afterEventId)
    event.updatedAt = now
    persistOrder(graph, ids, key)
    return event.id
  }
  if (command.name === "event.remove") {
    const event = requireRecordingEvent(graph, command.eventId)
    ids.splice(ids.indexOf(event.id), 1)
    event.retiredRevision = graph.revision
    event.updatedAt = now
    for (const link of graph.eventAssetLinks) {
      if (!link.retiredRevision && link.eventId === event.id)
        link.retiredRevision = graph.revision
    }
    persistOrder(graph, ids, key)
    return event.id
  }
}
