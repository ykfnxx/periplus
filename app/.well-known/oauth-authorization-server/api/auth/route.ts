import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { getAuth } from "@/modules/auth/server/auth"
export const GET = (request: Request) =>
  oauthProviderAuthServerMetadata(getAuth(), {
    headers: { "Access-Control-Allow-Origin": "*" },
  })(request)
