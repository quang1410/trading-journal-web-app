import * as React from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Ô nhập số có nút tăng/giảm tự vẽ, thay cho <input type="number"> (mũi tên của trình duyệt mỗi nơi
// một kiểu, Firefox lại không có). Là ô chữ thường mang role="spinbutton":
//   - gõ tự do; chỉ báo ra ngoài khi chuỗi là một số hợp lệ, nên gõ dở "21500." không làm nhảy giá trị;
//   - ↑ / ↓ (hoặc hai nút bên phải) cộng trừ một `step`, PageUp / PageDown mười step, Home / End về
//     min / max; kết quả làm tròn theo số lẻ của step hay của giá trị, cái nào nhiều hơn
//     (0.1 + 0.2 không ra 0.30000000000000004, 0.123 + 0.1 không bị cắt còn 0.2);
//   - đang gõ thì giữ nguyên chữ người dùng gõ; giá trị đổi từ ngoài (kéo hình, hoàn tác) thì hiện
//     ngay cả khi ô đang focus; rời ô thì hiện lại giá trị thật;
//   - disabled / readOnly khoá cả phím lẫn hai nút.

const NUMERIC = /^-?(?:\d+\.?\d*|\.\d+)$/;

/** Số chữ số lẻ của một số, kể cả dạng mũ (1e-7 → 7). */
function decimalsOf(n: number) {
  const [mant, exp] = `${n}`.split("e");
  const dot = mant.indexOf(".");
  const frac = dot < 0 ? 0 : mant.length - dot - 1;
  return Math.max(0, frac - (exp ? +exp : 0));
}

/** Chuỗi người dùng gõ / dán → dạng số chuẩn: "1,5" → "1.5", "1,000.5" → "1000.5". */
function normalize(s: string) {
  const t = s.trim().replace(/\s/g, "");
  return t.includes(".") ? t.replace(/,/g, "") : t.replace(",", ".");
}

function NumberField({
  value,
  onValueChange,
  step = 1,
  min,
  max,
  className,
  inputClassName,
  disabled,
  readOnly,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "step" | "min" | "max"> & {
  value: number;
  onValueChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  inputClassName?: string;
}) {
  const [text, setText] = React.useState(`${value}`);
  const [focused, setFocused] = React.useState(false);
  // giá trị đổi từ ngoài trong lúc đang focus: hiện ngay, trừ khi chữ đang gõ đã là đúng số đó
  // ("21500." vẫn là 21500 nên không bị ghi đè lúc đang gõ)
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    if (!(NUMERIC.test(text) && +text === value)) setText(`${value}`);
  }
  const shown = focused ? text : `${value}`;
  const locked = disabled || readOnly;
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = (next: number) => {
    setText(`${next}`);
    setSeen(next);
    onValueChange(next);
  };
  const bump = (steps: number) => {
    if (locked) return;
    const base = NUMERIC.test(shown) ? +shown : value;
    const digits = Math.max(decimalsOf(step), decimalsOf(base));
    commit(clamp(+(base + steps * step).toFixed(digits)));
  };
  const stepBtn = "flex flex-1 items-center justify-center px-1 text-text-muted hover:bg-surface-raised hover:text-foreground disabled:pointer-events-none disabled:opacity-50";
  return (
    <div
      data-slot="number-field"
      data-disabled={disabled || undefined}
      className={cn(
        "flex h-8 w-28 items-stretch overflow-hidden rounded-md border border-input bg-transparent text-sm transition-[color,box-shadow] dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-[disabled]:opacity-50",
        className,
      )}
    >
      <input
        type="text"
        inputMode="decimal"
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        autoComplete="off"
        disabled={disabled}
        readOnly={readOnly}
        {...props}
        className={cn("min-w-0 flex-1 bg-transparent px-2 text-foreground outline-none disabled:cursor-not-allowed", inputClassName)}
        value={shown}
        onFocus={(e) => {
          setText(`${value}`);
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onChange={(e) => {
          const s = normalize(e.target.value);
          setText(s);
          if (!NUMERIC.test(s)) return;
          setSeen(clamp(+s));
          onValueChange(clamp(+s));
        }}
        onKeyDown={(e) => {
          const steps = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
          if (steps != null) {
            e.preventDefault();
            bump(steps);
          } else if ((e.key === "Home" && min != null) || (e.key === "End" && max != null)) {
            e.preventDefault();
            if (!locked) commit(e.key === "Home" ? min! : max!);
          }
          onKeyDown?.(e);
        }}
      />
      <div className="flex flex-col border-l border-input" aria-hidden>
        <button type="button" tabIndex={-1} disabled={locked} className={cn("cursor-pointer", stepBtn)} onClick={() => bump(1)}>
          <ChevronUpIcon className="size-3" />
        </button>
        <button type="button" tabIndex={-1} disabled={locked} className={cn("cursor-pointer", stepBtn, "border-t border-input")} onClick={() => bump(-1)}>
          <ChevronDownIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}

export { NumberField };
