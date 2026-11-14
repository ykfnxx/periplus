export interface AuthResult {
  error: { message?: string } | null
  data: { redirect?: boolean } | null
}
export interface AuthApi {
  login(input: {
    email: string
    password: string
    rememberMe: boolean
  }): Promise<AuthResult>
  register(input: {
    name: string
    email: string
    password: string
  }): Promise<AuthResult>
  signOut(): Promise<unknown>
}
