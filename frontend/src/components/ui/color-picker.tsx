import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "./input";
import { Slider } from "./slider";

// Bảng chọn màu tự vẽ, thay cho <input type="color"> (hộp thoại của hệ điều hành, mỗi máy một kiểu,
// không theo theme): ô bão hoà × độ sáng + thanh sắc độ + ô mã hex — như ô "+" màu tuỳ chọn của
// TradingView. Chỉ làm việc với "#rrggbb"; độ trong suốt do nơi dùng lo.

type Hsv = { h: number; s: number; v: number };

const HEX = /^#?([0-9a-f]{6})$/i;

function hexToHsv(hex: string): Hsv {
  const m = HEX.exec(hex);
  const n = m ? +`0x${m[1]}` : 0;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (k: number) => {
    const x = (k + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(x, 4 - x, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function ColorPicker({
  value,
  onChange,
  className,
  labels,
}: {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
  /** Nhãn trợ năng (đã dịch) của ô bão hoà, thanh sắc độ và ô hex. */
  labels: { area: string; hue: string; hex: string };
}) {
  // giữ HSV riêng: màu xám (s = 0) hay đen (v = 0) không mang sắc độ, đổi ra hex rồi đọc lại là mất h
  const [hsv, setHsv] = React.useState(() => hexToHsv(value));
  const [hexText, setHexText] = React.useState(value);
  // giá trị đổi từ ngoài (không phải do chính bảng này phát ra) thì đọc lại. So không phân biệt
  // hoa thường: nơi dùng đổi "#FFAA00" thành "#ffaa00" không phải là một màu mới.
  const [seen, setSeen] = React.useState(value);
  if (value.toLowerCase() !== seen.toLowerCase()) {
    setSeen(value);
    setHsv(keepHue(hexToHsv(value), hsv));
    setHexText(value);
  }
  /** Xám / đen không mang sắc độ (và đen không mang độ bão hoà): giữ của màu trước để thanh sắc độ không nhảy về đỏ. */
  function keepHue(next: Hsv, prev: Hsv): Hsv {
    if (next.v === 0) return { h: prev.h, s: prev.s, v: 0 };
    if (next.s === 0) return { ...next, h: prev.h };
    return next;
  }
  const apply = (next: Hsv) => {
    const hex = hsvToHex(next);
    setSeen(hex);
    setHsv(next);
    setHexText(hex);
    onChange(hex);
  };

  const area = React.useRef<HTMLDivElement | null>(null);
  const fromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = area.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    apply({ ...hsv, s, v });
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const d = e.shiftKey ? 0.1 : 0.01;
    const k: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    const step = k[e.key];
    if (!step) return;
    e.preventDefault();
    apply({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + step[0])), v: Math.min(1, Math.max(0, hsv.v + step[1])) });
  };

  return (
    <div data-slot="color-picker" className={cn("flex flex-col gap-3", className)}>
      <div
        ref={area}
        role="slider"
        tabIndex={0}
        aria-label={labels.area}
        // ô hai chiều: số đọc là độ bão hoà (← →), giá trị đọc kèm cả độ sáng (↑ ↓) và mã màu
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%, ${hsvToHex(hsv)}`}
        className="relative h-36 w-full cursor-crosshair touch-none rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        style={{
          backgroundColor: `hsl(${hsv.h} 100% 50%)`,
          backgroundImage: "linear-gradient(to top, black, transparent), linear-gradient(to right, white, transparent)",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && fromPointer(e)}
        onKeyDown={onKey}
      >
        <span
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/40"
          style={{ left: `${hsv.s * 100}%`, bottom: `${hsv.v * 100}%`, background: hsvToHex(hsv) }}
        />
      </div>
      <Slider
        min={0} max={359} step={1} value={[Math.round(hsv.h)]} thumbLabel={labels.hue}
        onValueChange={([h]) => apply({ ...hsv, h })}
        trackClassName="h-3 bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]"
        rangeClassName="bg-transparent"
      />
      <div className="flex items-center gap-2">
        <span className="size-8 shrink-0 rounded-md border border-border" style={{ background: hsvToHex(hsv) }} />
        <Input
          aria-label={labels.hex}
          className="h-8 font-mono uppercase"
          value={hexText}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const s = e.target.value.trim();
            setHexText(s);
            const m = HEX.exec(s);
            if (m) apply(keepHue(hexToHsv(`#${m[1].toLowerCase()}`), hsv));
          }}
          onBlur={() => setHexText(hsvToHex(hsv))}
        />
      </div>
    </div>
  );
}

export { ColorPicker, hexToHsv, hsvToHex };
