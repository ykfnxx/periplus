import { z } from "zod"
import {
  TARGET_TRANSIT_PREFERENCES,
  TARGET_TRANSIT_REQUEST_MODES,
  TARGET_TRANSPORT_MODES,
} from "@/modules/data-model/contracts"

export const MAX_AGENT_DRAFT_REPAIRS = 5

const idSchema = z.string().trim().min(1)
const dateTimeSchema = z.iso.datetime({ offset: true })

export const cardPositionSchema = z.discriminatedUnion("placement", [
  z
    .object({
      placement: z.enum(["START", "END"]),
      scopeCityCardId: idSchema.nullable(),
    })
    .strict(),
  z
    .object({
      placement: z.enum(["BEFORE", "AFTER"]),
      anchorCardId: idSchema,
    })
    .strict(),
])

export const draftMutationMetaSchema = z
  .object({
    draftId: idSchema,
    operationId: idSchema,
    issueId: idSchema.optional(),
  })
  .strict()

export const draftOpenInputSchema = z
  .object({
    expectedWorkspaceRevision: z.number().int().nonnegative(),
    idempotencyKey: idSchema,
  })
  .strict()

export const draftGetInputSchema = z.object({ draftId: idSchema }).strict()

const eventBase = {
  cardId: idSchema,
  description: z.string().optional(),
}

const scheduleFields = {
  plannedStartAt: dateTimeSchema,
  plannedEndAt: dateTimeSchema.optional(),
}

export const draftAddCityCardInputSchema = draftMutationMetaSchema.extend({
  card: z
    .object({
      ...eventBase,
      title: z.string().trim().min(1),
      timeZone: z.string().trim().min(1),
    })
    .strict(),
  position: cardPositionSchema,
})

export const draftAddPlaceCardInputSchema = draftMutationMetaSchema.extend({
  card: z.discriminatedUnion("type", [
    z
      .object({
        ...eventBase,
        ...scheduleFields,
        type: z.literal("VISIT"),
        placeResolutionId: idSchema,
        plannedDurationMinutes: z.number().int().nonnegative().optional(),
        includeAvailableCoverImage: z.boolean().default(true),
      })
      .strict(),
    z
      .object({
        ...eventBase,
        ...scheduleFields,
        type: z.literal("MEAL"),
        placeResolutionId: idSchema,
        plannedDurationMinutes: z.number().int().nonnegative().optional(),
        cuisine: z.string().optional(),
      })
      .strict(),
    z
      .object({
        ...eventBase,
        ...scheduleFields,
        type: z.literal("ACTIVITY"),
        placeResolutionId: idSchema,
        plannedDurationMinutes: z.number().int().nonnegative().optional(),
        bookingReference: z.string().optional(),
      })
      .strict(),
  ]),
  cityCardId: idSchema,
  position: cardPositionSchema,
})

export const draftAddHotelStayCardInputSchema = draftMutationMetaSchema.extend({
  card: z
    .object({
      ...eventBase,
      ...scheduleFields,
      hotelSelectionId: idSchema,
      checkInNote: z.string().optional(),
    })
    .strict(),
  cityCardId: idSchema,
  position: cardPositionSchema,
})

export const draftAddPlaceStayCardInputSchema = draftMutationMetaSchema.extend({
  card: z
    .object({
      ...eventBase,
      ...scheduleFields,
      placeResolutionId: idSchema,
      checkInNote: z.string().optional(),
    })
    .strict(),
  cityCardId: idSchema,
  position: cardPositionSchema,
})

export const draftAddTransitCardInputSchema = draftMutationMetaSchema.extend({
  card: z
    .object({
      ...eventBase,
      ...scheduleFields,
      fromCardId: idSchema,
      toCardId: idSchema,
      title: z.string().trim().min(1).optional(),
      transportMode: z.enum(TARGET_TRANSPORT_MODES),
      requestMode: z.enum(TARGET_TRANSIT_REQUEST_MODES).optional(),
      preference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
      plannedDepartAt: dateTimeSchema.optional(),
      notes: z.string().optional(),
    })
    .strict(),
})

export const draftUpdateCityCardInputSchema = draftMutationMetaSchema.extend({
  cardId: idSchema,
  patch: z
    .object({
      title: z.string().trim().min(1).optional(),
      description: z.string().nullable().optional(),
      timeZone: z.string().trim().min(1).optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, "patch is empty"),
})

export const draftUpdateScheduleInputSchema = draftMutationMetaSchema.extend({
  cardId: idSchema,
  patch: z
    .object({
      plannedStartAt: dateTimeSchema.nullable().optional(),
      plannedEndAt: dateTimeSchema.nullable().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, "patch is empty"),
})

export const draftChangePlaceInputSchema = draftMutationMetaSchema.extend({
  cardId: idSchema,
  placeResolutionId: idSchema,
  includeAvailableCoverImage: z.boolean().default(true),
})

export const draftUpdateTransitCardInputSchema = draftMutationMetaSchema.extend(
  {
    cardId: idSchema,
    patch: z
      .object({
        plannedStartAt: dateTimeSchema.optional(),
        plannedEndAt: dateTimeSchema.nullable().optional(),
        transportMode: z.enum(TARGET_TRANSPORT_MODES).optional(),
        requestMode: z.enum(TARGET_TRANSIT_REQUEST_MODES).optional(),
        preference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
        plannedDepartAt: dateTimeSchema.nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, "patch is empty"),
  }
)

export const draftMoveCardInputSchema = draftMutationMetaSchema.extend({
  cardId: idSchema,
  position: cardPositionSchema,
})

export const draftRemoveCardInputSchema = draftMutationMetaSchema
  .extend({
    cardId: idSchema,
    cityChildrenPolicy: z.enum(["REMOVE_ALL", "MOVE_TO_CITY"]).optional(),
    destinationCityCardId: idSchema.optional(),
  })
  .superRefine((value, context) => {
    if (
      value.cityChildrenPolicy === "MOVE_TO_CITY" &&
      !value.destinationCityCardId
    ) {
      context.addIssue({
        code: "custom",
        path: ["destinationCityCardId"],
        message: "MOVE_TO_CITY requires destinationCityCardId",
      })
    }
    if (
      value.cityChildrenPolicy !== "MOVE_TO_CITY" &&
      value.destinationCityCardId
    ) {
      context.addIssue({
        code: "custom",
        path: ["destinationCityCardId"],
        message: "destinationCityCardId is only valid with MOVE_TO_CITY",
      })
    }
  })

export const draftConnectCardsInputSchema = draftMutationMetaSchema.extend({
  fromCardId: idSchema,
  toCardId: idSchema,
})

export const draftDisconnectCardsInputSchema = draftConnectCardsInputSchema

export const draftValidateInputSchema = z
  .object({
    draftId: idSchema,
    attemptId: idSchema,
  })
  .strict()

export const draftPrepareTransitInputSchema = z
  .object({
    draftId: idSchema,
    operationId: idSchema,
    transitCardId: idSchema,
  })
  .strict()

export const draftCommitInputSchema = z
  .object({
    draftId: idSchema,
    idempotencyKey: idSchema,
  })
  .strict()

export const draftMutationRequestSchemas = {
  "draft.add_city_card": draftAddCityCardInputSchema,
  "draft.add_place_card": draftAddPlaceCardInputSchema,
  "draft.add_hotel_stay_card": draftAddHotelStayCardInputSchema,
  "draft.add_place_stay_card": draftAddPlaceStayCardInputSchema,
  "draft.add_transit_card": draftAddTransitCardInputSchema,
  "draft.update_city_card": draftUpdateCityCardInputSchema,
  "draft.update_schedule": draftUpdateScheduleInputSchema,
  "draft.change_place": draftChangePlaceInputSchema,
  "draft.update_transit_card": draftUpdateTransitCardInputSchema,
  "draft.move_card": draftMoveCardInputSchema,
  "draft.remove_card": draftRemoveCardInputSchema,
  "draft.connect_cards": draftConnectCardsInputSchema,
  "draft.disconnect_cards": draftDisconnectCardsInputSchema,
} as const

export type DraftMutationToolName = keyof typeof draftMutationRequestSchemas
