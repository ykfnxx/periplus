import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({ plugins: [oauthProviderClient()] })

export const authApi: import("../ports").AuthApi = {
  login: (input) => authClient.signIn.email(input),
  register: async ({ inviteCode, journeyInvitationToken, ...input }) => {
    const result = await authClient.signUp.email(input, {
      headers: journeyInvitationToken
        ? { "x-journey-invitation-token": journeyInvitationToken }
        : { "x-invite-code": inviteCode ?? "" },
    })
    return { error: result.error, data: result.data ? {} : null }
  },
  signOut: () => authClient.signOut(),
}
