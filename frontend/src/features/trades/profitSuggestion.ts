import { compareDecimal, mulDecimal, roundDecimal, subDecimal } from "@/lib/decimal";

// Cùng một dạng số với ô nhập của form. Cố ý KHÔNG dùng splitParts của
// decimal.ts: nó rộng hơn, nhận cả "1." và ".5" — những chuỗi ĐANG GÕ DỞ. Một
// người gõ "1." trên đường tới "1.5" mà thấy gợi ý tính theo 1 thì con số đó
// sai, và nó trông hoàn toàn bình thường.
const NUMBER_RE = /^-?\d*\.?\d+$/;

/**
 * Lãi lỗ suy ra từ giá vào, giá ra và khối lượng.
 *
 *   Long:  (giá ra − giá vào) × khối lượng
 *   Short: (giá vào − giá ra) × khối lượng
 *
 * Đây là GỢI Ý, không phải giá trị được lưu, và khác biệt đó là cố ý. Công
 * thức trên chỉ đúng khi một đơn vị khối lượng ăn một đơn vị giá; vàng, chỉ
 * số và hợp đồng tương lai đều có hệ số hợp đồng riêng mà form không biết,
 * còn phí thì đã có ô riêng. Vì thế hàm này chỉ đề nghị một con số để người
 * dùng bấm lấy, không bao giờ tự ghi đè ô Lãi/lỗ — người ghi nhật ký biết
 * sản phẩm của mình, form thì không.
 *
 * Trả null khi chưa đủ ba số, khi có số không đọc được, hoặc khi giá ra bằng
 * giá vào: gợi ý "0" chỉ là nhiễu, người dùng gõ 0 nhanh hơn đọc nó.
 *
 * Chuỗi đang gõ dở ("1.", "-", ".") bị loại ngay: gợi ý tính trên một nửa con
 * số vẫn ra một con số trông rất hợp lý.
 */
export function suggestProfit({
  entry,
  exit,
  volume,
  direction,
  longValue,
}: {
  entry: string;
  exit: string;
  volume: string;
  direction: string;
  /** Chuỗi backend dùng cho chiều mua, lấy từ /meta/enums chứ không chép cứng. */
  longValue: string;
}): string | null {
  const values = [entry, exit, volume].map((v) => v.trim());
  if (!values.every((v) => NUMBER_RE.test(v))) return null;
  const [e, x, v] = values;

  let diff: string;
  try {
    // Chiều nào không phải Long thì tính như Short: chỉ có đúng hai chiều
    // (domain.NormalizeDirection), nên không cần nhánh thứ ba.
    diff = direction === longValue ? subDecimal(x, e) : subDecimal(e, x);
    if (compareDecimal(diff, "0") === 0) return null;
    // Hai chữ số: đây là TIỀN, và một gợi ý dài 12 chữ số thập phân thì
    // không ai bấm vào.
    return roundDecimal(mulDecimal(diff, v), 2);
  } catch {
    // splitParts ném khi chuỗi không phải số. Ở đây "không gợi ý được" là
    // câu trả lời đúng, không phải một lỗi cần báo lên người dùng.
    return null;
  }
}
