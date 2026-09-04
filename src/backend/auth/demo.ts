export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE_ENABLED === 'true'
    && Boolean(process.env.DEMO_EMAIL?.trim())
    && Boolean(process.env.DEMO_PASSWORD);
}

