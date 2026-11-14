import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({ plugins: [oauthProviderClient()] })

export const authApi: import("../ports").AuthApi = {
  login: (input) => authClient.signIn.email(input),
  register: async (input) => {
    const result = await authClient.signUp.email(input)
    return { error: result.error, data: result.data ? {} : null }
  },
  signOut: () => authClient.signOut(),
}
