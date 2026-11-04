import type { ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Một ô nhập có nhãn và chỗ báo lỗi.
 *
 * TradeFormDialog và AccountFormDialog từng khai bản riêng gần như y hệt, còn
 * CashFlowPanel vẫn còn nội tuyến cùng khuôn đó (chưa chuyển sang Field).
 * `role="alert"` là hợp đồng trợ năng: lỗi phải được đọc lên khi nó xuất hiện,
 * và để ở đây thì không ô nào quên được.
 *
 * `hint` và `unit` đều đi qua `aria-describedby` chứ không chỉ nằm cạnh ô:
 * người dùng trình đọc màn hình phải nghe được đơn vị tiền và câu giải thích,
 * không riêng người nhìn thấy chúng. Khi có lỗi thì lỗi được đọc trước, vì đó
 * là thứ đang chặn họ.
 */
export function Field({
  name,
  label,
  errorMsg,
  register,
  kind = "text",
  hint,
  unit,
  required = false,
  placeholder,
  inputMode,
  autoComplete,
  numeric = false,
  className,
}: {
  name: string;
  label: string;
  errorMsg?: string;
  register: UseFormRegisterReturn;
  kind?: string;
  /** Câu giải thích dưới ô. Nói ô này để làm gì, không lặp lại nhãn. */
  hint?: ReactNode;
  /** Đơn vị in mờ trong ô, ví dụ mã tiền của tài khoản. */
  unit?: string;
  required?: boolean;
  placeholder?: string;
  inputMode?: "text" | "decimal" | "numeric";
  autoComplete?: string;
  /**
   * Ô mang CON SỐ: đổi sang mặt chữ mono + tabular-nums, cùng lớp `.num` mà
   * bảng lệnh và biểu đồ đã dùng. Không phải để trang trí — giá vào và giá ra
   * đứng cạnh nhau, và với mặt chữ thường thì "1.0850" và "1.0870" không
   * thẳng cột, mắt phải đọc từng ký tự mới thấy chúng khác nhau ở đâu.
   */
  numeric?: boolean;
  className?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = errorMsg ? `${name}-error` : undefined;
  // Lỗi đứng trước gợi ý: nó là thứ đang chặn người dùng.
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <FieldLabel htmlFor={name} label={label} required={required} />
      <div className="relative">
        <Input
          id={name}
          type={kind}
          inputMode={inputMode}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={Boolean(errorMsg)}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          className={cn(unit && "pr-12", numeric && "num")}
          {...register}
        />
        {unit && (
          // aria-hidden: đơn vị đã nằm trong `hint` cho trình đọc màn hình,
          // đọc lại lần nữa ngay giữa ô chỉ làm rối.
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium tracking-wide text-muted-foreground"
          >
            {unit}
          </span>
        )}
      </div>
      <FieldFoot hintId={hintId} hint={hint} errorId={errorId} errorMsg={errorMsg} />
    </div>
  );
}

/**
 * Nhãn kèm dấu bắt buộc.
 *
 * Dấu sao nằm NGOÀI <Label>, và đó là điều kiện bắt buộc chứ không phải chi
 * tiết trình bày. Tên trợ năng của một ô nhập là toàn bộ text bên trong nhãn
 * gắn với nó, nên để dấu sao vào trong thì ô "Chiều lệnh" mang tên "Chiều
 * lệnh *" — trình đọc màn hình đọc thừa một ký tự, và mọi phép tìm theo nhãn
 * đều trượt. Ràng buộc "bắt buộc" đã được `aria-required` trên chính ô nhập
 * nói ra một cách máy hiểu được; dấu sao ở đây chỉ còn là tín hiệu cho mắt.
 */
export function FieldLabel({
  htmlFor,
  label,
  required = false,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {required && <RequiredMark />}
    </span>
  );
}

export function RequiredMark() {
  return (
    <span aria-hidden className="leading-none text-destructive">
      *
    </span>
  );
}

/**
 * Vùng dưới ô: gợi ý khi bình thường, lỗi khi có lỗi.
 *
 * CHỪA SẴN một dòng, kể cả khi không có gì để nói. Không chừa thì lúc lỗi
 * hiện ra, ô đó cao thêm một dòng và đẩy toàn bộ phần dưới nó xuống — người
 * dùng đang nhắm chuột vào ô kế tiếp thì ô ấy vừa trượt khỏi đầu ngón tay.
 * Với form mười sáu ô, vài lỗi cùng lúc là cả trang nhảy loạn.
 *
 * Cùng `text-xs` cho cả lỗi lẫn gợi ý, vì hai trạng thái phải cao BẰNG NHAU —
 * `text-sm` cho lỗi thì chính chỗ đã chừa lại vẫn chênh vài pixel.
 *
 * Chừa đúng MỘT dòng. Con số 17px là ĐO được, không phải chọn cho tròn: một
 * dòng `text-xs leading-snug` cao 16.5px và trình duyệt làm tròn lên 17. Lấy
 * `min-h-4` (16px) cho tròn số thì vẫn hụt nửa pixel, và ô đó vẫn nhảy 3px
 * đúng lúc lỗi hiện ra — đã đo thấy trên trình duyệt thật.
 *
 * Chừa một dòng chứ không phải hai: chừa dư thì mọi ô đều đeo một khoảng
 * trống thừa để phòng một trường hợp hiếm. `min-h` chứ không phải `h` — lỗi dài hai dòng vẫn phải
 * đọc được đủ, thà giãn ra còn hơn cắt cụt câu đang nói cho người dùng biết
 * họ sai ở đâu.
 *
 * `reserve={false}` cho những chỗ ô nằm một mình, không xếp cạnh ô nào —
 * chừa chỗ ở đó chỉ tạo một khoảng trống thừa chẳng canh với cái gì.
 */
export function FieldFoot({
  hintId,
  hint,
  errorId,
  errorMsg,
  reserve = true,
}: {
  hintId?: string;
  hint?: ReactNode;
  errorId?: string;
  errorMsg?: string;
  reserve?: boolean;
}) {
  const empty = !errorMsg && !hint;
  if (empty && !reserve) return null;
  return (
    <p
      id={errorMsg ? errorId : hintId}
      role={errorMsg ? "alert" : undefined}
      className={cn(
        "text-xs leading-snug",
        reserve && "min-h-[17px]",
        errorMsg ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {errorMsg || hint}
    </p>
  );
}
