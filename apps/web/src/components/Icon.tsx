import type { CSSProperties } from 'react';

export type IconName = 'spark' | 'chat' | 'history' | 'plus' | 'arrow' | 'chevron' | 'close' | 'stop' | 'retry' | 'copy' | 'check' | 'code' | 'memory' | 'chart' | 'info';
const paths: Record<IconName, React.ReactNode> = {
  spark: <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z" /><path d="m20 2 .7 2.3L23 5l-2.3.7L20 8l-.7-2.3L17 5l2.3-.7L20 2Z" /></>,
  chat: <path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1.5 1L4 15.5A8.5 8.5 0 1 1 20 11.5Z" />,
  history: <><path d="M3 4v5h5M3.8 8A9 9 0 1 1 3 14" /><path d="M12 7v5l3 2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  retry: <><path d="M20 7v5h-5M19 11a7.5 7.5 0 1 0 0 6" /></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  code: <><path d="m7 7-5 5 5 5m10-10 5 5-5 5m-4-14-2 18" /></>,
  memory: <><path d="M9 4C4 2 2 9 5 11c-4 3-1 9 3 8 1 3 4 2 4 0V6c0-4-3-5-3-2ZM15 4c5-2 7 5 4 7 4 3 1 9-3 8-1 3-4 2-4 0V6c0-4 3-5 3-2Z" /><path d="M5 11h3m11 0h-3M8 19v-4m8 4v-4" /></>,
  chart: <><path d="M4 4v16h17M8 15l4-5 4 2 5-7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.5" /></>,
};

export function Icon({ name, size = 20, style, className = '' }: { name: IconName; size?: number; style?: CSSProperties; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name]}</svg>;
}
