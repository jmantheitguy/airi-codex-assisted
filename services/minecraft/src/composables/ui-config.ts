import type { Config } from './config'

import path from 'node:path'

import { existsSync, readFileSync } from 'node:fs'
import { cwd } from 'node:process'

import * as fs from 'node:fs/promises'

import { z } from 'zod'

const persistedMinecraftUiConfigSchema = z.object({
  enabled: z.boolean().optional(),
  serverAddress: z.string().trim().optional(),
  serverPort: z.coerce.number().int().min(1).max(65535).optional(),
  username: z.string().trim().optional(),
})

export type PersistedMinecraftUiConfig = z.infer<typeof persistedMinecraftUiConfigSchema>

function getPersistedMinecraftUiConfigPath() {
  return path.resolve(cwd(), '.airi.minecraft-config.json')
}

export function loadPersistedMinecraftUiConfigSync(): PersistedMinecraftUiConfig | null {
  const configPath = getPersistedMinecraftUiConfigPath()
  if (!existsSync(configPath)) {
    return null
  }

  try {
    const raw = readFileSync(configPath, 'utf8')
    return persistedMinecraftUiConfigSchema.parse(JSON.parse(raw))
  }
  catch (error) {
    console.warn('Failed to read persisted Minecraft UI config:', error)
    return null
  }
}

export async function savePersistedMinecraftUiConfig(config: PersistedMinecraftUiConfig) {
  const configPath = getPersistedMinecraftUiConfigPath()
  const normalizedConfig = persistedMinecraftUiConfigSchema.parse(config)

  await fs.writeFile(configPath, `${JSON.stringify(normalizedConfig, null, 2)}\n`, 'utf8')
}

export function isPersistedMinecraftUiConfig(config: unknown): config is PersistedMinecraftUiConfig {
  return persistedMinecraftUiConfigSchema.safeParse(config).success
}

export function applyPersistedMinecraftUiConfig(baseConfig: Config, persistedConfig: PersistedMinecraftUiConfig | null): Config {
  if (!persistedConfig) {
    return baseConfig
  }

  return {
    ...baseConfig,
    bot: {
      ...baseConfig.bot,
      enabled: persistedConfig.enabled ?? baseConfig.bot.enabled,
      username: persistedConfig.username?.trim() || baseConfig.bot.username,
      host: persistedConfig.serverAddress?.trim() || baseConfig.bot.host,
      port: persistedConfig.serverPort ?? baseConfig.bot.port,
    },
  }
}
