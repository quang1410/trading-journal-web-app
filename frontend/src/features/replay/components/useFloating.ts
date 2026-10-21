import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { readPref, writePref } from "../engine/storage";

/**
 * Thanh nổi kéo được trong khung chart (thanh replay). Kéo ở tay nắm;
 * vị trí lưu trong trình duyệt và luôn được kẹp vào trong khung.
 */
export function useFloating(key: string, wrapRef: RefObject<HTMLElement | null>, fallback: CSSProperties) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<[number, number] | null>(() => readPref<[number, number] | null>(`float.${key}`, null));
  const grab = useRef<[number, number] | null>(null);

  const clamp = useCallback(
    (x: number, y: number): [number, number] => {
      const w = wrapRef.current?.getBoundingClientRect();
      const b = barRef.current?.getBoundingClientRect();
      if (!w || !b) return [x, y];
      return [Math.max(0, Math.min(w.width - b.width, x)), Math.max(0, Math.min(w.height - b.height, y))];
    },
    [wrapRef],
  );

  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p[0], p[1]) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const gripProps = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      const b = barRef.current?.getBoundingClientRect();
      if (!b) return;
      grab.current = [e.clientX - b.left, e.clientY - b.top];
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const w = wrapRef.current?.getBoundingClientRect();
      if (!grab.current || !w) return;
      setPos(clamp(e.clientX - w.left - grab.current[0], e.clientY - w.top - grab.current[1]));
    },
    onPointerUp: () => {
      if (!grab.current) return;
      grab.current = null;
      setPos((p) => {
        if (p) writePref(`float.${key}`, p);
        return p;
      });
    },
  };

  const style: CSSProperties = pos ? { left: pos[0], top: pos[1] } : fallback;
  return { barRef, style, gripProps };
}
