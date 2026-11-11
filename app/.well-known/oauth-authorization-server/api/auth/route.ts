import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { auth } from "@/modules/auth/server/auth"
export const GET = oauthProviderAuthServerMetadata(auth, {
  headers: { "Access-Control-Allow-Origin": "*" },
})
