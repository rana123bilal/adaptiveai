import { API_PREFIX } from '@adaptiveai/shared';
import { readConfig, type Env } from './config';
import { checkOrigin, createHttpContext, preflightResponse, RequestError } from './http';
import { demoChatResponse, healthResponse } from './routes';

/** CORS is a browser boundary, not authentication. The demo remains mock-only. */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const config = readConfig(env);
  const http = createHttpContext(request);
  const deniedOrigin = checkOrigin(request, config.allowedOrigins, http);
  if (deniedOrigin) return deniedOrigin;

  const path = new URL(request.url).pathname;
  const isHealth = path === `${API_PREFIX}/health`;
  const isDemo = path === `${API_PREFIX}/demo/chat`;
  if (!isHealth && !isDemo) return http.fail(404, 'NOT_FOUND', 'This endpoint is not available.');
  const methods = isHealth ? ['GET', 'HEAD'] : ['POST'];

  if (request.method === 'OPTIONS') {
    return preflightResponse(request, http, methods, isDemo ? ['content-type'] : []);
  }
  if (!methods.includes(request.method)) {
    http.headers.set('Allow', [...methods, 'OPTIONS'].join(', '));
    return http.fail(405, 'METHOD_NOT_ALLOWED', 'This endpoint does not support that method.');
  }

  try {
    return isHealth ? healthResponse(http) : await demoChatResponse(request, config, http);
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return http.fail(408, 'REQUEST_CANCELLED', 'The request was cancelled.');
    }
    if (error instanceof RequestError) return http.fail(error.status, error.code, error.message);
    return http.fail(500, 'INTERNAL_ERROR', 'The request could not be completed. Please try again.');
  }
}
