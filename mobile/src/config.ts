import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'wrex_server_url'
const DEFAULT_URL = 'http://localhost:55520'

let cachedUrl: string | null = null

export async function getServerUrl(): Promise<string> {
  if (cachedUrl) return cachedUrl
  const stored = await AsyncStorage.getItem(STORAGE_KEY)
  cachedUrl = stored || DEFAULT_URL
  return cachedUrl
}

export async function setServerUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/+$/, '')
  cachedUrl = trimmed
  await AsyncStorage.setItem(STORAGE_KEY, trimmed)
}

export function getServerUrlSync(): string {
  return cachedUrl || DEFAULT_URL
}
