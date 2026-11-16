import { useState } from 'react';
import { API_PREFIX, type HealthResponse } from '@adaptiveai/shared';

type Connection = 'idle' | 'checking' | 'connected' | 'error';

const layers = [
  ['01', 'Conversation', 'A focused chat experience with history that belongs to you.'],
  ['02', 'Validated memory', 'Useful corrections become private, retrievable knowledge after review.'],
  ['03', 'Measured improvement', 'Compare answers with and without memory on the same evaluation set.'],
] as const;

export function App() {
  const [connection, setConnection] = useState<Connection>('idle');

  async function checkConnection() {
    setConnection('checking');
    try {
      const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
      const response = await fetch(`${base}${API_PREFIX}/health`, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error('Health request failed');
      const health = await response.json() as Partial<HealthResponse>;
      if (health.service !== 'adaptiveai-api' || health.status !== 'ok') throw new Error('Unexpected health response');
      setConnection('connected');
    } catch {
      setConnection('error');
    }
  }

  const status = {
    idle: 'Ready to check your local API.',
    checking: 'Checking the API…',
    connected: 'API connected. Gemini and Supabase are not connected yet.',
    error: 'API unavailable. Start both development servers and try again.',
  }[connection];

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1b3029]">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-[#1b3029]/15 px-6 py-6 sm:px-10">
        <a href="/" className="text-xl font-bold tracking-tight">AdaptiveAI<span className="text-[#668274]">.</span></a>
        <span className="rounded-full border border-[#1b3029]/20 px-3 py-1 text-xs font-medium">Step 01 · Foundation</span>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-14 sm:px-10 sm:py-20">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#557165]">A self-improving AI assistant</p>
        <h1 className="max-w-3xl text-5xl font-medium leading-[1.08] tracking-tight sm:text-7xl">Better answers.<br /><span className="text-[#668274]">Built on what you teach it.</span></h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-[#53645b]">A project exploring persistent memory, validated feedback, and honest measurement. The foundation is ready; the assistant comes next.</p>

        <section aria-labelledby="connection-title" className="mt-10 flex flex-col gap-5 rounded-2xl bg-[#1b3029] p-6 text-[#f5f5f0] sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 id="connection-title" className="text-lg font-medium">Check the foundation</h2>
            <p role="status" aria-live="polite" className="mt-2 max-w-xl text-sm leading-relaxed text-[#d0dbd3]">{status}</p>
          </div>
          <button onClick={() => void checkConnection()} disabled={connection === 'checking'} className="shrink-0 rounded-lg bg-[#d6edbd] px-5 py-3 text-sm font-semibold text-[#1b3029] transition hover:bg-[#e3f3d2] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-60">
            {connection === 'checking' ? 'Checking…' : 'Check API connection'}
          </button>
        </section>

        <section aria-label="Planned capabilities" className="mt-14 grid gap-8 md:grid-cols-3">
          {layers.map(([number, title, description]) => (
            <article key={number} className="border-t border-[#1b3029]/20 pt-5">
              <span className="font-mono text-xs text-[#668274]">{number} / PLANNED</span>
              <h2 className="mt-5 text-xl font-medium">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#53645b]">{description}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="mx-auto max-w-6xl px-6 pb-8 text-xs text-[#53645b] sm:px-10">Learning through approved memory. Model weights remain unchanged.</footer>
    </div>
  );
}
