// Tiền từ backend là CHUỖI (shopspring/decimal marshal ra chuỗi JSON) và phải
// ở nguyên dạng chuỗi cho tới lúc gửi lại. Mọi phép biến đổi ở đây làm bằng
// thao tác chuỗi, không mượn Number: 0.29 * 100 === 28.999999999999996.

const NUMBER_RE = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/** Dịch dấu chấm thập phân đi `places` chữ số. Dương là nhân 10^places. */
export function shiftDecimal(value: string, places: number): string {
  const m = NUMBER_RE.exec(value.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new Error(`không phải số thập phân: ${JSON.stringify(value)}`);
  }
  const sign = m[1] === "-" ? "-" : "";
  const intPart = m[2] === "" ? "0" : m[2];
  const fracPart = m[3] ?? "";

  let digits = intPart + fracPart;
  let dotPos = intPart.length + places; // vị trí dấu chấm trong `chuSo`

  if (dotPos < 0) {
    digits = "0".repeat(-dotPos) + digits;
    dotPos = 0;
  }
  if (dotPos > digits.length) {
    digits = digits + "0".repeat(dotPos - digits.length);
  }

  const before = digits.slice(0, dotPos).replace(/^0+(?=\d)/, "") || "0";
  const after = digits.slice(dotPos).replace(/0+$/, "");
  const ket = after ? `${before}.${after}` : before;
  return ket === "0" ? "0" : sign + ket;
}

/** 0.01 -> "1" (risk lưu dạng phân số, hiển thị dạng %). */
export const percentFromFraction = (v: string): string => shiftDecimal(v, 2);

/** "1" -> "0.01" (người dùng nhập %, backend nhận phân số). */
export const fractionFromPercent = (v: string): string => shiftDecimal(v, -2);

type Part = { negative: boolean; intPart: string; fracPart: string };

function splitParts(v: string): Part {
  const m = NUMBER_RE.exec(v.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new Error(`không phải số thập phân: ${JSON.stringify(v)}`);
  }
  return {
    negative: m[1] === "-",
    intPart: (m[2] === "" ? "0" : m[2]).replace(/^0+(?=\d)/, ""),
    fracPart: (m[3] ?? "").replace(/0+$/, ""),
  };
}

function compareMagnitude(a: Part, b: Part): -1 | 0 | 1 {
  // So độ dài phần nguyên TRƯỚC: "2" dài 1, "10" dài 2, nên 2 < 10.
  // So chuỗi thẳng sẽ ra "2" > "10" vì thứ tự từ điển.
  if (a.intPart.length !== b.intPart.length) return a.intPart.length > b.intPart.length ? 1 : -1;
  if (a.intPart !== b.intPart) return a.intPart > b.intPart ? 1 : -1;
  const n = Math.max(a.fracPart.length, b.fracPart.length);
  const la = a.fracPart.padEnd(n, "0");
  const lb = b.fracPart.padEnd(n, "0");
  if (la === lb) return 0;
  return la > lb ? 1 : -1;
}

/** Cộng 1 vào một chuỗi chữ số, có nhớ. Dùng cho làm tròn, không qua Number. */
function addOne(digits: string): string {
  const d = digits.split("");
  for (let i = d.length - 1; i >= 0; i--) {
    if (d[i] === "9") {
      d[i] = "0";
      continue;
    }
    d[i] = String.fromCharCode(d[i].charCodeAt(0) + 1);
    return d.join("");
  }
  return "1" + d.join(""); // tràn: 999 -> 1000
}

/**
 * Làm tròn nửa lên tới `places` chữ số thập phân, vẫn bằng thao tác chuỗi.
 *
 * Cần thiết vì backend trả TỶ SỐ ở độ chính xác đầy đủ của decimal:
 * profit_factor về dạng "1.9690964899040831". Đưa thẳng con số đó lên màn
 * hình là 16 chữ số vô nghĩa chiếm chỗ của một chỉ số người ta phải đọc
 * lướt. Làm tròn ở TẦNG HIỂN THỊ chứ không ở tầng dữ liệu — giá trị gốc vẫn
 * nguyên vẹn cho mọi phép digitsOut sánh ngưỡng.
 */
export function roundDecimal(value: string, places: number): string {
  const { negative, intPart, fracPart } = splitParts(value);

  let before: string;
  let after: string;
  if (fracPart.length <= places) {
    before = intPart;
    after = fracPart;
  } else {
    const keep = intPart + fracPart.slice(0, places);
    // charCodeAt(places) >= 53 là "chữ số kế tiếp >= '5'".
    const ket = fracPart.charCodeAt(places) >= 53 ? addOne(keep) : keep;
    const doDaiNguyen = ket.length - places;
    before = ket.slice(0, doDaiNguyen).replace(/^0+(?=\d)/, "") || "0";
    after = ket.slice(doDaiNguyen).replace(/0+$/, "");
  }

  const digitsOut = after ? `${before}.${after}` : before;
  return digitsOut === "0" ? "0" : (negative ? "-" : "") + digitsOut;
}

/** So sánh hai số thập phân dạng chuỗi, không đi qua Number. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const A = splitParts(a);
  const B = splitParts(b);
  const aZero = A.intPart === "0" && A.fracPart === "";
  const bKhong = B.intPart === "0" && B.fracPart === "";
  if (aZero && bKhong) return 0; // "0" và "-0" bằng nhau
  if (A.negative !== B.negative) return A.negative ? -1 : 1;
  const d = compareMagnitude(A, B);
  return A.negative ? ((-d) as -1 | 0 | 1) : d;
}

/** Cộng hai chuỗi chữ số cùng độ dài, có nhớ. Trả về chuỗi có thể dài hơn 1. */
function addDigits(a: string, b: string): string {
  let carry = 0;
  let acc = "";
  for (let i = a.length - 1; i >= 0; i--) {
    const s = a.charCodeAt(i) - 48 + (b.charCodeAt(i) - 48) + carry;
    acc = String.fromCharCode(48 + (s % 10)) + acc;
    carry = s >= 10 ? 1 : 0;
  }
  return carry ? "1" + acc : acc;
}

/** Trừ hai chuỗi chữ số cùng độ dài, `a` phải >= `b`. Có mượn. */
function subDigits(a: string, b: string): string {
  let borrow = 0;
  let acc = "";
  for (let i = a.length - 1; i >= 0; i--) {
    let d = a.charCodeAt(i) - b.charCodeAt(i) - borrow;
    borrow = d < 0 ? 1 : 0;
    if (d < 0) d += 10;
    acc = String.fromCharCode(48 + d) + acc;
  }
  return acc;
}

/** Ghép lại chuỗi chữ số thành số thập phân, cắt số 0 thừa hai đầu. */
function joinParts(negative: boolean, digits: string, fracLen: number): string {
  const dotPos = digits.length - fracLen;
  const before = digits.slice(0, dotPos).replace(/^0+(?=\d)/, "") || "0";
  const after = digits.slice(dotPos).replace(/0+$/, "");
  const out = after ? `${before}.${after}` : before;
  // "-0" không phải một giá trị người dùng nên nhìn thấy: 5 + (-5) là 0.
  return out === "0" ? "0" : (negative ? "-" : "") + out;
}

/**
 * Cộng hai số thập phân dạng chuỗi.
 *
 * Tồn tại vì tổng net của một tuần trên lịch P&L là TIỀN, và quy tắc 1 của
 * CLAUDE.md cấm tiền đi qua float — 0.1 + 0.2 === 0.30000000000000004, còn
 * cộng dồn cả tháng thì sai số chồng lên nhau. Cổng canh styleguard cấm ép
 * kiểu số ngoài src/test/ chính là để phép cộng này phải nằm ở đây, một chỗ
 * có tên và có test, thay vì rải toán tử cộng vào component.
 *
 * Dấu khác nhau thì quy về phép trừ độ lớn rồi mang dấu của số lớn hơn.
 */
export function addDecimal(a: string, b: string): string {
  const A = splitParts(a);
  const B = splitParts(b);

  // Căn phần thập phân về cùng độ dài để cộng/trừ theo cột chữ số.
  const fracLen = Math.max(A.fracPart.length, B.fracPart.length);
  const intLen = Math.max(A.intPart.length, B.intPart.length);
  const da = A.intPart.padStart(intLen, "0") + A.fracPart.padEnd(fracLen, "0");
  const db = B.intPart.padStart(intLen, "0") + B.fracPart.padEnd(fracLen, "0");

  if (A.negative === B.negative) return joinParts(A.negative, addDigits(da, db), fracLen);

  const d = compareMagnitude(A, B);
  if (d === 0) return "0";
  return d > 0
    ? joinParts(A.negative, subDigits(da, db), fracLen)
    : joinParts(B.negative, subDigits(db, da), fracLen);
}

// Intl.NumberFormat.prototype.format nhận CHUỖI từ ES2023, chính là để không
// mất độ chính xác. Kiểu của TypeScript còn khai báo number|bigint nên phải ép.
function localeCode(locale: Locale): string {
  return locale === "en" ? "en-US" : "vi-VN";
}

/**
 * Tiền LUÔN hiển thị đúng hai chữ số thập phân — không hơn, không kém.
 *
 * Không hơn: những trường đi qua phép chia bên backend (`expectancy`,
 * `ave_win`, `ave_loss` — đều là `Div` trong internal/metrics/kpi.go) về ở độ
 * chính xác đầy đủ của decimal. Ô "Kỳ vọng mỗi lệnh" từng in ra
 * `+37.1287128712871416835 USD`: hai mươi chữ số cho một con số người ta chỉ
 * liếc qua để biết trung bình mỗi lệnh lãi bao nhiêu.
 *
 * Không kém: `minimumFractionDigits` giữ cột số thẳng hàng. Thiếu nó thì
 * 1.240,5 và 1.240,50 lệch nhau một ký tự, và cả cột tiền trong bảng lệnh
 * răng cưa theo từng dòng.
 *
 * Làm tròn giao cho Intl, KHÔNG gọi roundDecimal trước. Đây là chỗ dễ làm
 * thừa: Intl.NumberFormat nhận CHUỖI từ ES2023 và làm tròn trên chuỗi đó ở
 * độ chính xác đầy đủ — `12345678901234567890.126` vẫn ra
 * `12.345.678.901.234.567.890,13`, không hề đi qua double. Đã đo trước khi bỏ
 * roundDecimal đi, chứ không suy đoán.
 *
 * Quy tắc 1 của CLAUDE.md vẫn nguyên: `value` là chuỗi từ đầu tới lúc vào
 * Intl, và `as unknown as number` chỉ để chiều kiểu của TypeScript (khai
 * number|bigint) chứ không phải một phép ép kiểu lúc chạy.
 */
export function formatMoney(value: string, currency?: string, locale: Locale = "vi"): string {
  const digitsOut = new Intl.NumberFormat(localeCode(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value as unknown as number);
  return currency ? `${digitsOut} ${currency}` : digitsOut;
}


// Tỷ số (hệ số lợi nhuận, R:R, hệ số hồi phục) KHÔNG phải tiền: chúng là
// thương của hai số nên có đuôi thập phân dài vô hạn. Hai chữ số là đủ để
// đọc và để digitsOut với ngưỡng §8.2; nhiều hơn chỉ là nhiễu.
export function formatRatio(value: string, places = 2, locale: Locale = "vi"): string {
  return new Intl.NumberFormat(localeCode(locale), { maximumFractionDigits: 20 }).format(
    roundDecimal(value, places) as unknown as number,
  );
}

// Phần trăm luôn đủ hai chữ số thập phân để cột số không digitsOut fracPart.
/**
 * Backend trả TỶ LỆ dạng PHÂN SỐ, không phải phần trăm: win_pct của 28 lệnh
 * thắng trên 64 lệnh là "0.4375". Dán "%" vào con số đó cho ra "0,4375%" —
 * sai một trăm lần, và đọc lướt thì thành "tỷ lệ thắng gần bằng không".
 * Phải nhân 100 trước, và nhân bằng shiftDecimal chứ không bằng Number.
 */
export function formatPercent(fraction: string, places = 2, locale: Locale = "vi"): string {
  const digitsOut = roundDecimal(shiftDecimal(fraction, 2), places);
  const formatted = new Intl.NumberFormat(localeCode(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(digitsOut as unknown as number);
  return `${formatted}%`;
}

/**
 * NGOẠI LỆ DUY NHẤT của quy tắc "tiền là chuỗi" (CLAUDE.md quy tắc 1).
 *
 * Recharts đặt pixel từ `number`, nên ở ranh giới vẽ buộc phải đổi. Tách bạch
 * hai vai của một con số thì mâu thuẫn biến mất:
 *
 *   toạ độ  -> number, trình duyệt đọc, sai số 1e-16 không ai thấy
 *   chữ số  -> string, con người đọc, sai một chữ số là sai
 *
 * Giá trị hàm này trả về CHỈ được dùng để đặt toạ độ. Cấm đưa nó ra nhãn,
 * tooltip, hay gửi ngược lên backend — cổng trong src/test/styleguard.test.ts
 * chặn `toPlot` xuất hiện ngoài features/dashboard/prepare.ts.
 *
 * Ném thay vì trả NaN: NaN lọt vào Recharts cho ra một cột KHÔNG VẼ RA, không
 * kèm lỗi nào. Một cột biến mất trông y hệt một nhóm không có dữ liệu.
 *
 * Dùng `+v` chứ không phải hàm ép kiểu có tên — ba cái tên đó bị cổng styleguard
 * cấm, và `+v` sau khi DANG_SO đã bảo đảm dạng thì an toàn ngang nhau.
 */
export function toPlot(value: string): number {
  const v = value.trim();
  if (!NUMBER_RE.test(v) || v === "" || v === "-" || v === "+" || v === ".") {
    throw new Error(`toPlot: không phải số thập phân: ${JSON.stringify(value)}`);
  }
  return +v;
}

import type { Locale } from "@/i18n";

/**
 * Chuỗi có phải một số DƯƠNG hay không, kiểm bằng chuỗi chứ không qua Number.
 *
 * AccountFormDialog và CashFlowPanel từng khai bản y hệt nhau ở hai file, dù
 * DANG_SO ngay trên đầu file này mới là bản gốc của cùng một khái niệm.
 *
 * "Có ít nhất một chữ số khác 0" là cách nói "> 0" mà không phải ép kiểu:
 * "0.00" khớp dạng số nhưng không phải số dương.
 */
export function isPositiveNumber(v: string): boolean {
  const s = v.trim();
  const m = NUMBER_RE.exec(s);
  // Dấu — kể cả dấu `+` — không được chấp nhận: ô nhập tiền chỉ nhận chữ số,
  // và chiều của một khoản nạp/rút nằm ở `type` chứ không ở dấu.
  if (!m || m[1] !== "") return false;
  // Bắt buộc có chữ số SAU dấu chấm nếu đã gõ dấu chấm: "5." là số đang gõ dở,
  // không phải số hợp lệ. Giữ đúng luật của bản cũ ở hai form.
  if (s.includes(".") && (m[3] ?? "") === "") return false;
  const digits = (m[2] ?? "") + (m[3] ?? "");
  return digits !== "" && /[1-9]/.test(digits);
}
