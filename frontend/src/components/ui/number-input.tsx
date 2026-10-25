import * as React from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * Ô nhập số, thay cho `<input type="number">`.
 *
 * Ô gốc có cặp mũi tên tăng/giảm do trình duyệt vẽ (màu hệ thống, không theo theme), lăn chuột
 * lên ô đang focus là đổi số mà người dùng không hề định đổi, và `value` của nó là "" với mọi
 * thứ chưa đọc được thành số — gõ dở "1." là mất. Form lệnh của app đã dùng ô chữ +
 * `inputMode="decimal"` từ trước (TradeFormDialog), ô này giữ đúng cách đó và thêm hai thứ ô gốc
 * có mà ô chữ không có:
 *
 *   - Chỉ nhận chữ số, một dấu chấm, và dấu trừ ở đầu khi `min` cho phép số âm.
 *   - Mũi tên lên/xuống cộng/trừ `step`, kẹp trong [min, max].
 *
 * Giá trị vào ra là CHUỖI, như ô gốc: người gọi tự đọc thành số khi cần.
 */
function NumberInput({
  value,
  onValueChange,
  step = 1,
  min,
  max,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "value" | "onChange" | "step" | "min" | "max"> & {
  value: string
  onValueChange: (value: string) => void
  step?: number
  min?: number
  max?: number
}) {
  const negative = min == null || min < 0

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    props.onKeyDown?.(e)
    const dir = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0
    if (dir === 0 || e.defaultPrevented) return
    e.preventDefault()
    const cur = value.trim() === "" || !Number.isFinite(+value) ? (min ?? 0) : +value
    onValueChange(format(clamp(cur + dir * step, min, max), step, value))
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      className={cn("num", className)}
      onChange={(e) => {
        const next = sanitize(e.target.value, negative)
        if (next !== value) onValueChange(next)
      }}
      onKeyDown={onKeyDown}
    />
  )
}

/** Bỏ mọi ký tự không phải số; giữ dấu chấm đầu tiên (dấu phẩy coi như dấu chấm) và dấu trừ ở đầu. */
function sanitize(raw: string, negative: boolean): string {
  const sign = negative && raw.trimStart().startsWith("-") ? "-" : ""
  const body = raw.replace(/,/g, ".").replace(/[^\d.]/g, "")
  const dot = body.indexOf(".")
  return sign + (dot < 0 ? body : body.slice(0, dot + 1) + body.slice(dot + 1).replace(/\./g, ""))
}

function clamp(v: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
}

/**
 * Làm tròn theo số chữ số lẻ của step hoặc của số đang có, lấy bên nhiều hơn: 0.1 + 0.2 phải ra
 * "0.3" chứ không phải "0.30000000000000004", và 1.25 + 1 vẫn là "2.25".
 */
function format(v: number, step: number, prev: string): string {
  const places = (s: string) => (s.split(".")[1] ?? "").length
  return v.toFixed(Math.max(places(String(step)), places(prev)))
}

export { NumberInput }
