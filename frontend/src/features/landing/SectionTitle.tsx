import type { ReactNode } from "react";

/**
 * Tiêu đề H2 của các khối landing. Tiếng Việt chồng dấu nên line-height tối
 * thiểu 1.16 (spec landing §2.2).
 */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.16] font-semibold tracking-[-0.02em] text-balance">
      {children}
    </h2>
  );
}
