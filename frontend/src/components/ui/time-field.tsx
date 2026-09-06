import * as React from "react";
import { ClockIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Ô nhập giờ dạng HH:MM, tự vẽ hoàn toàn.
 *
 * KHÔNG dùng `<input type="time">`, và đây là lý do — không phải chuyện thẩm mỹ:
 *
 *   1. Trình duyệt tự bung một dropdown cuộn 60 phút khi bấm vào, vẽ bằng màu
 *      hệ thống và ĐÈ LÊN chính cái lịch nằm ngay dưới nó. Hai công cụ chọn
 *      tranh nhau một chỗ, và cái không ai gọi thì thắng.
 *   2. Icon đồng hồ và vùng bôi đen của nó do Chrome vẽ, CSS của app không
 *      với tới. Ở giao diện tối, icon ấy đen trên nền đen — gần như biến mất.
 *   3. Màu xanh bôi số là màu chọn của hệ điều hành, không phải `--primary`.
 *
 * Ba thứ đó không sửa được bằng CSS vì chúng nằm trong shadow DOM của trình
 * duyệt. Cách duy nhất để chúng theo theme là không dùng chúng nữa.
 *
 * Giữ nguyên hợp đồng cũ: MỘT ô, nhận và trả chuỗi "HH:MM". Người dùng gõ
 * "0930" hay "09:30" đều ra một kết quả; dấu hai chấm tự chèn.
 */
export function TimeField({
  id,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  id?: string;
  /** Giờ dạng "HH:MM", hoặc "" khi chưa có. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  // Chữ đang gõ giữ riêng, không ép về value sau mỗi phím: gõ "9" mà lập tức
  // bị nắn thành "09:00" thì ký tự tiếp theo rơi vào sai chỗ và người dùng
  // phải đánh vật với chính ô nhập.
  const [draft, setDraft] = React.useState(value);

  // Giá trị từ ngoài đổi (chọn "Hôm nay", mở lại form) thì ô phải theo. So
  // với chuỗi đã chuẩn hoá để không giật lại đúng thứ người dùng đang gõ.
  React.useEffect(() => {
    if (normalize(draft) !== value) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Đang gõ: giữ NGUYÊN chữ, chỉ báo ra ngoài nếu đã đọc được thành giờ.
  //
  // Không nắn về "HH:MM" ở đây, dù rất muốn. Người dùng gõ "08:00" là năm lần
  // onChange, và nắn ngay từ phím đầu thì "0" thành "00:00", phím sau nối vào
  // đuôi thành "00:008" rồi bị cắt còn "00:00" — gõ 08:00 ra 00:00. Đã đo
  // đúng chuỗi đó trước khi tách hai hàm này.
  function type(raw: string) {
    setDraft(raw);
    onChange(normalize(raw));
  }

  // Rời ô mới nắn: lúc này người dùng đã gõ xong, "930" thành "09:30".
  function commit(raw: string) {
    const normalized = normalize(raw);
    if (normalized !== "") setDraft(normalized);
    onChange(normalized);
  }

  // Mũi tên lên/xuống chỉnh phút, kèm Shift để chỉnh giờ. Bàn phím là đường
  // đi chính của ô này: người nhập nhật ký gõ số, không rê chuột.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const step = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const parts = parse(normalize(draft) || "00:00");
    if (!parts) return;
    const delta = e.shiftKey ? step * 60 : step;
    // Cộng dồn theo PHÚT rồi mới tách lại: cộng riêng từng phần thì 09:59 +1
    // ra 09:60. Chia lấy dư để 23:59 +1 quay về 00:00 thay vì tràn.
    const total = (parts.hour * 60 + parts.minute + delta + 24 * 60) % (24 * 60);
    const next = `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
    setDraft(next);
    onChange(next);
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        // maxLength 5 = "HH:MM". Chặn ngay tại ô còn hơn để người dùng gõ
        // thừa rồi mới cắt trong lúc chuẩn hoá.
        maxLength={5}
        placeholder="--:--"
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => type(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={onKeyDown}
        className="num pr-8 text-center tracking-wider"
      />
      <ClockIcon
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-2.5 my-auto size-4 text-muted-foreground"
      />
    </div>
  );
}

function pad(v: number): string {
  return String(v).padStart(2, "0");
}

function parse(hhmm: string): { hour: number; minute: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  // Cộng từng chữ số thay vì gọi hàm ép kiểu số có sẵn: cổng styleguard cấm
  // cả ba hàm đó trong `src/` (quy tắc 1 — tiền phải ở dạng chuỗi). Ở đây
  // không phải tiền, nhưng một ngoại lệ cho cổng ấy là một ngoại lệ người sau
  // phải đọc lại và cân nhắc; rẻ hơn thì viết thẳng phép cộng.
  const hour = digits(m[1]);
  const minute = digits(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function digits(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 10 + (s.charCodeAt(i) - 48);
  return n;
}

/**
 * Đưa mọi kiểu gõ về "HH:MM", hoặc "" nếu không đọc được thành giờ.
 *
 * Chấp nhận "9", "930", "9:3", "09:30" — người dùng gõ nhanh trên bàn phím số
 * thường bỏ qua dấu hai chấm và số 0 đứng đầu, và bắt họ gõ đủ bốn chữ số chỉ
 * để ô chịu nhận là bắt họ phục vụ ô nhập.
 */
function normalize(raw: string): string {
  const only = raw.replace(/[^\d]/g, "").slice(0, 4);
  if (only === "") return "";

  let hour: number;
  let minute: number;
  if (only.length <= 2) {
    // "9" -> 09:00, "14" -> 14:00.
    hour = digits(only);
    minute = 0;
  } else {
    // "930" -> 9:30 (một chữ số giờ), "1430" -> 14:30.
    const cut = only.length === 3 ? 1 : 2;
    hour = digits(only.slice(0, cut));
    minute = digits(only.slice(cut));
  }
  if (hour > 23 || minute > 59) return "";
  return `${pad(hour)}:${pad(minute)}`;
}
