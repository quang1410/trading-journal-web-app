import { compareDecimal } from "@/lib/decimal";

/**
 * Ngưỡng màu §8.2 của thiết kế mẹ, so bằng compareDecimal trên CHUỖI.
 *
 * Ở một chỗ vì hai màn hình dùng chung: dải KPI của /trades và lưới KPI của
 * /dashboard. Hai bản chép sẽ trôi lệch trong im lặng — cùng một tài khoản
 * hiện hai màu ở hai trang, và không test nào bắt được vì mỗi bản tự nó đúng.
 */

/** Bậc đóng dưới: > 2 xanh dương, >= 1.5 xanh lá, >= 1 vàng, còn lại đỏ. */
export function mauProfitFactor(pf: string): string {
  if (compareDecimal(pf, "2") > 0) return "text-info";
  if (compareDecimal(pf, "1.5") >= 0) return "text-success";
  if (compareDecimal(pf, "1") >= 0) return "text-warning";
  return "text-destructive";
}

/** § 8.2: < 1 đỏ, 1–2 vàng, > 2 xanh lá. Chỉ ba bậc, không có bậc xanh dương. */
export function mauRecoveryFactor(rf: string): string {
  if (compareDecimal(rf, "2") > 0) return "text-success";
  if (compareDecimal(rf, "1") >= 0) return "text-warning";
  return "text-destructive";
}

/**
 * Dấu và màu theo dấu của một số tiền.
 *
 * Ba nhánh: 0 là hoà, mang màu trung tính. Backend không đếm lệnh net = 0 vào
 * win_count lẫn loss_count, nên tô nó xanh hay đỏ đều là bịa thêm một phía.
 */
export function dauVaMau(v: string): { dau: string; lop: string } {
  const d = compareDecimal(v, "0");
  if (d > 0) return { dau: "+", lop: "text-primary" };
  if (d < 0) return { dau: "", lop: "text-destructive" };
  return { dau: "", lop: "text-muted-foreground" };
}
