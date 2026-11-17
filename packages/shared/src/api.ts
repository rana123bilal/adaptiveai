export const API_PREFIX = '/api/v1';

/** Liveness only: this does not probe external providers. */
export interface HealthResponse {
  service: 'adaptiveai-api';
  status: 'ok';
  stage: 'chat-shell';
  mode: 'mock';
  dependencies: {
    gemini: 'not-configured';
    supabase: 'not-configured';
  };
}

export interface ApiError {
  error: { code: string; message: string; requestId: string };
}
