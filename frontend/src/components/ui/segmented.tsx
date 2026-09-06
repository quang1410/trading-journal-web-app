import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Chọn MỘT trong vài lựa chọn, bày hết ra thay vì giấu sau một dropdown.
 *
 * Dùng cho chiều lệnh và khung thời gian. Cả hai đều là tập đóng, ngắn, và
 * người dùng chọn chúng ở MỌI lệnh — mà một dropdown bắt trả hai lần bấm
 * (mở ra, chọn) cho một câu hỏi chỉ có hai đáp án, đồng thời giấu mất đáp án
 * còn lại. Bày ngang thì thấy hết và bấm một lần.
 *
 * Không dùng cho các ô chấm điểm: chuỗi enum ở đó dài ("Thoát lệnh cảm tính,
 * sợ hãi") và có tới bảy lựa chọn, xếp ngang sẽ vỡ dòng. Những ô ấy vẫn là
 * Select.
 *
 * TRỢ NĂNG — đây là radiogroup thật, không phải một hàng nút:
 *
 *   - Vai trò `radiogroup` + `radio` để trình đọc màn hình đọc "1 trong 2"
 *     chứ không đọc thành hai nút rời rạc không liên quan.
 *   - Roving tabindex: cả nhóm chỉ chiếm MỘT nấc Tab, đúng như một ô nhập.
 *     Không có nó thì tám khung thời gian ngốn tám lần Tab.
 *   - Mũi tên trái/phải đổi lựa chọn, theo đúng thói quen của radio gốc.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  ariaLabelledBy,
  renderOption,
  optionClassName,
  className,
  id,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  /** Nhãn trợ năng khi nhóm không có <label> riêng đứng trước. */
  label?: string;
  ariaLabelledBy?: string;
  /** Chữ hiển thị trên mỗi ô; mặc định là chính giá trị. */
  renderOption?: (v: T) => ReactNode;
  /** Lớp thêm cho ô ĐANG CHỌN, để chiều lệnh tô teal/đỏ theo ngữ nghĩa. */
  optionClassName?: (v: T, selected: boolean) => string | undefined;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Mũi tên chạy vòng: từ ô cuối sang phải quay về ô đầu, giống radio gốc.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const i = options.indexOf(value);
    // Ô nào cũng chưa chọn thì mũi tên đầu tiên chọn ô đầu.
    const next = options[i < 0 ? 0 : (i + delta + options.length) % options.length];
    onChange(next);
    // Con trỏ bàn phím phải ĐI THEO lựa chọn: đổi giá trị mà focus còn ở ô cũ
    // thì lần nhấn mũi tên sau tính sai điểm xuất phát.
    requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next)}"]`)?.focus();
    });
  }

  return (
    <div
      ref={ref}
      id={id}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={ariaLabelledBy}
      onKeyDown={onKeyDown}
      className={cn(
        "flex w-full gap-1 rounded-md border border-input bg-surface-sunken p-1",
        className,
      )}
    >
      {options.map((o) => {
        const selected = o === value;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            data-value={o}
            aria-checked={selected}
            // Roving tabindex: chỉ ô đang chọn nhận Tab. Khi chưa chọn gì thì
            // ô đầu giữ nấc Tab, nếu không cả nhóm biến mất khỏi đường bàn phím.
            tabIndex={selected || (options.indexOf(value) < 0 && o === options[0]) ? 0 : -1}
            onClick={() => onChange(o)}
            className={cn(
              "flex-1 cursor-pointer rounded-sm px-2 py-1.5 text-sm font-medium transition-colors outline-none",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected
                ? "bg-surface-base text-foreground"
                : "text-muted-foreground hover:bg-interactive-bg-hover hover:text-foreground",
              optionClassName?.(o, selected),
            )}
          >
            {renderOption ? renderOption(o) : o}
          </button>
        );
      })}
    </div>
  );
}
