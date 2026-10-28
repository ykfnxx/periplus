import { z } from "zod"
import { targetIdSchema as id, targetDateTimeSchema as instant } from "./common"
import { contributorSchema } from "./receipts"

export const journeyMemberSchema = z
  .object({
    user: contributorSchema,
    role: z.enum(["OWNER", "MEMBER"]),
    joinedAt: instant,
  })
  .strict()
export const journeyMembersSchema = z
  .object({ members: z.array(journeyMemberSchema) })
  .strict()
export const journeyInvitationSchema = z
  .object({
    id,
    expiresAt: instant,
    revokedAt: instant.nullable(),
  })
  .strict()
export const journeyInvitationCreatedSchema = z
  .object({
    invitation: journeyInvitationSchema,
    url: z.string(),
  })
  .strict()
export const journeyInvitationPreviewSchema = z
  .object({
    journeyId: id,
    journeyTitle: z.string(),
    owner: contributorSchema,
    expiresAt: instant,
  })
  .strict()
export type JourneyMember = z.infer<typeof journeyMemberSchema>
export type JourneyMembers = z.infer<typeof journeyMembersSchema>
export type JourneyInvitation = z.infer<typeof journeyInvitationSchema>
export type JourneyInvitationCreated = z.infer<
  typeof journeyInvitationCreatedSchema
>
export type JourneyInvitationPreview = z.infer<
  typeof journeyInvitationPreviewSchema
>

export const journeyInvitationsSchema = z
  .object({ invitations: z.array(journeyInvitationSchema) })
  .strict()
export type JourneyInvitations = z.infer<typeof journeyInvitationsSchema>
