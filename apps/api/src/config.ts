export interface Env {
  ALLOWED_ORIGINS?: string;
  DEMO_ENABLED?: string;
}

export function readConfig(env: Env) {
  return {
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    // This switch only enables the scripted adapter. It never selects a live model.
    demoEnabled: env.DEMO_ENABLED === 'true',
  };
}

export type AppConfig = ReturnType<typeof readConfig>;
