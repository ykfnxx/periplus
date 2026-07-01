import { randomUUID } from 'node:crypto';
import { createRoute, getRoute, updateRoute } from '@/lib/routes/service';
import {
  validateRouteInput,
  validateRoutePointCreateInput,
  validateRoutePointPatchInput,
  validateRoutePointPosition,
} from '@/lib/routes/validation';
import type {
  Route,
  RouteInput,
  RoutePoint,
  RoutePointCreateInput,
  RoutePointPatchInput,
  RoutePointPosition,
} from '@/types/route';
import type {
  AgentConversationMessage,
  DraftSnapshot,
  DraftToolName,
  SessionDraft,
} from './types';

export class DraftInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftInputError';
  }
}

interface UpdateDraftPointInput {
  patch?: RoutePointPatchInput;
  position?: RoutePointPosition;
}

function nowIso() {
  return new Date().toISOString();
}

function cloneRoute(route: Route): Route {
  return JSON.parse(JSON.stringify(route)) as Route;
}

function validatedRouteInput(input: unknown): RouteInput {
  const result = validateRouteInput(input);
  if (!result.ok) throw new DraftInputError(result.error);
  return result.data;
}

function validatedPointCreateInput(input: unknown): RoutePointCreateInput {
  const result = validateRoutePointCreateInput(input);
  if (!result.ok) throw new DraftInputError(result.error);
  return result.data;
}

function validatedPointPatchInput(input: unknown): RoutePointPatchInput {
  const result = validateRoutePointPatchInput(input);
  if (!result.ok) throw new DraftInputError(result.error);
  return result.data;
}

function validatedPointPosition(input: unknown): RoutePointPosition {
  const result = validateRoutePointPosition(input);
  if (!result.ok) throw new DraftInputError(result.error);
  return result.data;
}

function isPersistedRoute(input: RouteInput | Route): input is Route {
  return typeof (input as Route).id === 'string';
}

function orderedIdsWithPosition(
  pointIds: string[],
  movingPointId: string,
  position: RoutePointPosition
): string[] {
  const remainingIds = pointIds.filter((pointId) => pointId !== movingPointId);

  if (position.placement === 'start') return [movingPointId, ...remainingIds];
  if (position.placement === 'end') return [...remainingIds, movingPointId];

  if (position.pointId === movingPointId) {
    throw new DraftInputError(
      'Invalid point position: point cannot be positioned relative to itself'
    );
  }

  const anchorIndex = remainingIds.indexOf(position.pointId);
  if (anchorIndex === -1) {
    throw new DraftInputError(
      'Invalid point position: anchor point must belong to the draft'
    );
  }

  const insertIndex =
    position.placement === 'before' ? anchorIndex : anchorIndex + 1;
  return [
    ...remainingIds.slice(0, insertIndex),
    movingPointId,
    ...remainingIds.slice(insertIndex),
  ];
}

function normalizePointOrders(
  points: RoutePoint[],
  orderedPointIds?: string[]
) {
  const pointById = new Map(points.map((point) => [point.id, point]));
  const ids =
    orderedPointIds ??
    [...points].sort((a, b) => a.order - b.order).map((point) => point.id);

  return ids.map((pointId, order) => ({
    ...pointById.get(pointId)!,
    order,
  }));
}

function toRouteInput(route: Route): RouteInput {
  return {
    name: route.name,
    description: route.description,
    points: normalizePointOrders(route.points).map((point) => ({
      name: point.name,
      lat: point.lat,
      lng: point.lng,
      order: point.order,
      stayHours: point.stayHours,
      notes: point.notes,
    })),
  };
}

function toDraftRoute(input: RouteInput | Route): Route {
  const routeInput = validatedRouteInput(input);
  const persistedRoute = isPersistedRoute(input) ? input : null;
  const timestamp = nowIso();

  return {
    id: persistedRoute?.id ?? `draft-route-${randomUUID()}`,
    name: routeInput.name,
    description: routeInput.description,
    points: [...routeInput.points]
      .sort((a, b) => a.order - b.order)
      .map((point, order) => {
        const originalPoint = input.points.find(
          (candidate) => candidate.order === point.order
        );
        const originalId =
          originalPoint && typeof (originalPoint as RoutePoint).id === 'string'
            ? (originalPoint as RoutePoint).id
            : undefined;

        return {
          id: originalId ?? `draft-point-${randomUUID()}`,
          name: point.name,
          lat: point.lat,
          lng: point.lng,
          order,
          stayHours: point.stayHours,
          notes: point.notes,
        };
      }),
    createdAt: persistedRoute?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export class DraftStore {
  private readonly sessions = new Map<string, SessionDraft>();

  getSnapshot(sessionId: string): DraftSnapshot {
    const session = this.ensureSession(sessionId);
    return {
      sessionId,
      route: session.route ? cloneRoute(session.route) : null,
      sourceRouteId: session.sourceRouteId,
      isLocked: Boolean(session.lockedByRunId),
      lockedByRunId: session.lockedByRunId,
      updatedAt: session.updatedAt,
    };
  }

  getConversationMessages(sessionId: string) {
    return this.ensureSession(sessionId).conversationMessages.map(
      (message) => ({ ...message })
    );
  }

  addUserConversationMessage(sessionId: string, content: string) {
    return this.addConversationMessage(sessionId, {
      role: 'user',
      content,
      runId: null,
    });
  }

  appendAssistantConversationDelta(
    sessionId: string,
    runId: string,
    content: string
  ) {
    const session = this.ensureSession(sessionId);
    const lastMessage = session.conversationMessages.at(-1);
    const timestamp = nowIso();

    if (lastMessage?.role === 'assistant' && lastMessage.runId === runId) {
      lastMessage.content += content;
      lastMessage.updatedAt = timestamp;
      session.updatedAt = timestamp;
      return { ...lastMessage };
    }

    return this.addConversationMessage(sessionId, {
      role: 'assistant',
      content,
      runId,
    });
  }

  isLocked(sessionId: string) {
    return Boolean(this.ensureSession(sessionId).lockedByRunId);
  }

  lock(sessionId: string, runId: string) {
    const session = this.ensureSession(sessionId);
    session.lockedByRunId = runId;
    session.updatedAt = nowIso();
    return this.getSnapshot(sessionId);
  }

  unlock(sessionId: string, runId: string) {
    const session = this.ensureSession(sessionId);
    if (session.lockedByRunId === runId) {
      session.lockedByRunId = null;
      session.updatedAt = nowIso();
    }
    return this.getSnapshot(sessionId);
  }

  async loadSavedRoute(sessionId: string, routeId: string) {
    const route = await getRoute(routeId);
    if (!route) throw new DraftInputError('Route not found');

    const session = this.ensureSession(sessionId);
    session.route = cloneRoute(route);
    session.sourceRouteId = route.id;
    session.updatedAt = nowIso();
    return this.getSnapshot(sessionId);
  }

  replaceDraft(sessionId: string, route: RouteInput | Route | null) {
    const session = this.ensureSession(sessionId);
    session.route = route ? toDraftRoute(route) : null;
    session.sourceRouteId =
      route &&
      isPersistedRoute(route) &&
      !route.id.startsWith('draft-') &&
      !route.id.startsWith('preset-') &&
      !route.id.startsWith('temp-')
        ? route.id
        : null;
    session.updatedAt = nowIso();
    return this.getSnapshot(sessionId);
  }

  addDraftPoint(
    sessionId: string,
    input: { point: RoutePointCreateInput; position?: RoutePointPosition }
  ) {
    const session = this.ensureSession(sessionId);
    if (!session.route) throw new DraftInputError('Draft route is empty');

    const point = validatedPointCreateInput(input.point);
    const position = validatedPointPosition(input.position);
    const createdPoint: RoutePoint = {
      id: `draft-point-${randomUUID()}`,
      name: point.name,
      lat: point.lat,
      lng: point.lng,
      order: session.route.points.length,
      stayHours: point.stayHours,
      notes: point.notes,
    };
    const orderedPointIds = orderedIdsWithPosition(
      [
        ...session.route.points.map((routePoint) => routePoint.id),
        createdPoint.id,
      ],
      createdPoint.id,
      position
    );

    session.route = {
      ...session.route,
      points: normalizePointOrders(
        [...session.route.points, createdPoint],
        orderedPointIds
      ),
      updatedAt: nowIso(),
    };
    session.updatedAt = session.route.updatedAt;
    return this.getSnapshot(sessionId);
  }

  updateDraftPoint(
    sessionId: string,
    pointId: string,
    input: UpdateDraftPointInput
  ) {
    const session = this.ensureSession(sessionId);
    if (!session.route) throw new DraftInputError('Draft route is empty');

    const patch =
      input.patch === undefined
        ? undefined
        : validatedPointPatchInput(input.patch);
    const position =
      input.position === undefined
        ? undefined
        : validatedPointPosition(input.position);
    if (!patch && !position)
      throw new DraftInputError(
        'Invalid point update: patch or position required'
      );

    const existingPoint = session.route.points.find(
      (point) => point.id === pointId
    );
    if (!existingPoint) throw new DraftInputError('Route point not found');

    const patchedPoints = session.route.points.map((point) =>
      point.id === pointId
        ? {
            ...point,
            ...patch,
            stayHours:
              patch?.stayHours === null
                ? undefined
                : (patch?.stayHours ?? point.stayHours),
            notes:
              patch?.notes === null ? undefined : (patch?.notes ?? point.notes),
          }
        : point
    );
    const orderedPointIds = position
      ? orderedIdsWithPosition(
          session.route.points.map((point) => point.id),
          pointId,
          position
        )
      : undefined;

    session.route = {
      ...session.route,
      points: normalizePointOrders(patchedPoints, orderedPointIds),
      updatedAt: nowIso(),
    };
    session.updatedAt = session.route.updatedAt;
    return this.getSnapshot(sessionId);
  }

  deleteDraftPoint(sessionId: string, pointId: string) {
    const session = this.ensureSession(sessionId);
    if (!session.route) throw new DraftInputError('Draft route is empty');

    const points = session.route.points.filter((point) => point.id !== pointId);
    if (points.length === session.route.points.length)
      throw new DraftInputError('Route point not found');

    session.route = {
      ...session.route,
      points: normalizePointOrders(points),
      updatedAt: nowIso(),
    };
    session.updatedAt = session.route.updatedAt;
    return this.getSnapshot(sessionId);
  }

  reorderDraftPoints(sessionId: string, pointIds: string[]) {
    const session = this.ensureSession(sessionId);
    if (!session.route) throw new DraftInputError('Draft route is empty');

    const expectedPointIds = new Set(
      session.route.points.map((point) => point.id)
    );
    if (pointIds.length !== expectedPointIds.size) {
      throw new DraftInputError(
        'Invalid point reorder: pointIds must include every draft point exactly once'
      );
    }
    for (const pointId of pointIds) {
      if (!expectedPointIds.has(pointId)) {
        throw new DraftInputError(
          'Invalid point reorder: pointIds must include every draft point exactly once'
        );
      }
    }

    session.route = {
      ...session.route,
      points: normalizePointOrders(session.route.points, pointIds),
      updatedAt: nowIso(),
    };
    session.updatedAt = session.route.updatedAt;
    return this.getSnapshot(sessionId);
  }

  async saveDraft(sessionId: string) {
    const session = this.ensureSession(sessionId);
    if (!session.route) throw new DraftInputError('Draft route is empty');

    const routeInput = toRouteInput(session.route);
    const savedRoute = session.sourceRouteId
      ? await updateRoute(session.sourceRouteId, routeInput)
      : await createRoute(routeInput);

    if (!savedRoute) throw new DraftInputError('Route not found');

    session.route = cloneRoute(savedRoute);
    session.sourceRouteId = savedRoute.id;
    session.updatedAt = nowIso();
    return this.getSnapshot(sessionId);
  }

  async callTool(
    sessionId: string,
    tool: DraftToolName,
    input: Record<string, unknown>
  ) {
    if (tool === 'get_current_draft') return this.getSnapshot(sessionId);
    if (tool === 'replace_draft')
      return this.replaceDraft(
        sessionId,
        input.route as RouteInput | Route | null
      );
    if (tool === 'add_draft_point') {
      return this.addDraftPoint(sessionId, {
        point: input.point as RoutePointCreateInput,
        position: input.position as RoutePointPosition | undefined,
      });
    }
    if (tool === 'update_draft_point') {
      return this.updateDraftPoint(sessionId, input.pointId as string, {
        patch: input.patch as RoutePointPatchInput | undefined,
        position: input.position as RoutePointPosition | undefined,
      });
    }
    if (tool === 'delete_draft_point') {
      return this.deleteDraftPoint(sessionId, input.pointId as string);
    }
    return this.reorderDraftPoints(sessionId, input.pointIds as string[]);
  }

  private ensureSession(sessionId: string) {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    const session = {
      sessionId,
      route: null,
      sourceRouteId: null,
      lockedByRunId: null,
      conversationMessages: [],
      updatedAt: nowIso(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  private addConversationMessage(
    sessionId: string,
    input: Pick<AgentConversationMessage, 'role' | 'content' | 'runId'>
  ) {
    const session = this.ensureSession(sessionId);
    const timestamp = nowIso();
    const message: AgentConversationMessage = {
      id: `message-${randomUUID()}`,
      role: input.role,
      content: input.content,
      runId: input.runId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    session.conversationMessages.push(message);
    session.updatedAt = timestamp;
    return { ...message };
  }
}
