import { createAuthClient } from 'better-auth/vue'

import { useAuthStore } from '../stores/auth'

export type OAuthProvider = 'google' | 'github'

function resolveServerUrl() {
  const configuredServerUrl = import.meta.env.VITE_SERVER_URL
  if (configuredServerUrl) {
    return configuredServerUrl
  }

  if (typeof window !== 'undefined') {
    const { hostname } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return null
    }
  }

  return 'https://airi-api.moeru.ai'
}

export const SERVER_URL = resolveServerUrl()
export const AUTH_AVAILABLE = typeof SERVER_URL === 'string' && SERVER_URL.length > 0

export const authClient = createAuthClient({
  baseURL: SERVER_URL || undefined,
  credentials: 'include',
})

export async function fetchSession() {
  if (!AUTH_AVAILABLE) {
    return false
  }

  const { data } = await authClient.getSession()
  if (data) {
    const authStore = useAuthStore()

    authStore.user = data.user
    authStore.session = data.session
    return true
  }

  return false
}

export async function listSessions() {
  if (!AUTH_AVAILABLE) {
    return { data: [] as const, error: null }
  }

  return await authClient.listSessions()
}

export async function signOut() {
  if (!AUTH_AVAILABLE) {
    const authStore = useAuthStore()
    authStore.user = undefined
    authStore.session = undefined
    return
  }

  await authClient.signOut()

  const authStore = useAuthStore()
  authStore.user = undefined
  authStore.session = undefined
}

export async function signIn(provider: OAuthProvider) {
  if (!AUTH_AVAILABLE) {
    throw new Error('Authentication is disabled in local web development until a server URL is configured.')
  }

  return await authClient.signIn.social({
    provider,
    callbackURL: window.location.origin,
  })
}
