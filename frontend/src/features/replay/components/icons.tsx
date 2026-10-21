import type { ReactNode } from "react";
import type { DrawTool } from "../engine/drawings";

/** Biểu tượng công cụ vẽ, theo kiểu thanh công cụ của TradingView / FX Replay. */
const PATHS: Record<DrawTool | "magnet" | "hline", ReactNode> = {
  trend: (
    <>
      <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="5" r="2" />
    </>
  ),
  rect: (
    <>
      <path d="M7 5h10M7 19h10M5 7v10M19 7v10" />
      <circle cx="5" cy="5" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
    </>
  ),
  hline: (
    <>
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M3 8v8M21 8v8" />
    </>
  ),
  hray: (
    <>
      <circle cx="5" cy="12" r="2" />
      <line x1="7" y1="12" x2="21" y2="12" />
    </>
  ),
  brush: (
    <>
      <path d="M3 20c3 0 4.5-1 4.5-3.2 0-1.6 1.1-2.8 2.7-2.8s2.8 1.2 2.8 2.7C13 19 10.5 20 7.5 20H3z" />
      <path d="M12.5 14.5 16 11M14.5 9.5c1.5-1.6 3.4-4.2 5.5-4.5-.3 2.1-2.9 4-4.5 5.5" />
    </>
  ),
  path: (
    <>
      <polyline points="3,17 8.5,10.5 13,14.5 20.5,6" />
      <polyline points="15.5,6 20.5,6 20.5,11" />
      <circle cx="8.5" cy="10.5" r="1.6" />
      <circle cx="13" cy="14.5" r="1.6" />
    </>
  ),
  fib: (
    <>
      <path d="M4 5h16M4 9.5h12M4 14h16M7 18.5h13" />
      <circle cx="20" cy="9.5" r="1.8" />
      <circle cx="4" cy="18.5" r="1.8" />
    </>
  ),
  long: (
    <>
      <path d="M6 5h15M6 19h15" />
      <circle cx="4.5" cy="5" r="1.6" />
      <circle cx="4.5" cy="19" r="1.6" />
      <path d="M10 9v6h4" />
    </>
  ),
  short: (
    <>
      <path d="M6 5h15M6 19h15" />
      <circle cx="4.5" cy="5" r="1.6" />
      <circle cx="4.5" cy="19" r="1.6" />
      <path d="M14 9.2c-.6-.5-1.3-.7-2-.7-1.1 0-2 .6-2 1.5 0 2 4 1.2 4 3.3 0 1-.9 1.7-2.1 1.7-.8 0-1.6-.3-2.1-.8" />
    </>
  ),
  text: <path d="M5 5h14M12 5v14M9.5 19h5" />,
  magnet: (
    <>
      <path d="M6 4h4v8a2 2 0 0 0 4 0V4h4v8a6 6 0 0 1-12 0z" />
      <path d="M6 8h4M14 8h4" />
    </>
  ),
};

export function ToolIcon({ name, className = "size-6" }: { name: DrawTool | "magnet" | "hline"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
