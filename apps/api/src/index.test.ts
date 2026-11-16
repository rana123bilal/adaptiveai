import { describe, expect, it } from 'vitest';
import { handleRequest } from './index';

const env = { ALLOWED_ORIGINS: 'http://localhost:5173' };
const url = 'http://localhost/api/v1/health';

describe('foundation HTTP boundary', () => {
  it('reports liveness without claiming connected integrations', async () => {
    const response = handleRequest(new Request(url), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      dependencies: { gemini: 'not-configured', supabase: 'not-configured' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('accepts only exact allowed browser origins', () => {
    const allowed = handleRequest(new Request(url, { headers: { Origin: 'http://localhost:5173' } }), env);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    const denied = handleRequest(new Request(url, { headers: { Origin: 'http://localhost:5173.attacker.example' } }), env);
    expect(denied.status).toBe(403);
    expect(denied.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('handles an allowed browser preflight without a response body', async () => {
    const response = handleRequest(new Request(url, {
      method: 'OPTIONS',
      headers: { Origin: env.ALLOWED_ORIGINS, 'Access-Control-Request-Method': 'GET' },
    }), env);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('rejects an unsupported preflight method', () => {
    const response = handleRequest(new Request(url, {
      method: 'OPTIONS',
      headers: { Origin: env.ALLOWED_ORIGINS, 'Access-Control-Request-Method': 'POST' },
    }), env);
    expect(response.status).toBe(400);
  });

  it('does not expose planned chat routes', async () => {
    const response = handleRequest(new Request('http://localhost/api/v1/chat', { method: 'POST' }), env);
    expect(response.status).toBe(404);
    const body = await response.json() as { error: { requestId: string } };
    expect(body.error.requestId).toBe(response.headers.get('X-Request-Id'));
  });

  it('uses HTTP method semantics for HEAD and unsupported requests', async () => {
    const head = handleRequest(new Request(url, { method: 'HEAD' }), env);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const post = handleRequest(new Request(url, { method: 'POST' }), env);
    expect(post.status).toBe(405);
    expect(post.headers.get('Allow')).toContain('GET');
  });
});
