// Tiền từ backend là CHUỖI (shopspring/decimal marshal ra chuỗi JSON) và phải
// ở nguyên dạng chuỗi cho tới lúc gửi lại. Mọi phép biến đổi ở đây làm bằng
// thao tác chuỗi, không mượn Number: 0.29 * 100 === 28.999999999999996.

const DANG_SO = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/** Dịch dấu chấm thập phân đi `places` chữ số. Dương là nhân 10^places. */
export function shiftDecimal(value: string, places: number): string {
  const m = DANG_SO.exec(value.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new Error(`không phải số thập phân: ${JSON.stringify(value)}`);
  }
  const dau = m[1] === "-" ? "-" : "";
  const nguyen = m[2] === "" ? "0" : m[2];
  const le = m[3] ?? "";

  let chuSo = nguyen + le;
  let cham = nguyen.length + places; // vị trí dấu chấm trong `chuSo`

  if (cham < 0) {
    chuSo = "0".repeat(-cham) + chuSo;
    cham = 0;
  }
  if (cham > chuSo.length) {
    chuSo = chuSo + "0".repeat(cham - chuSo.length);
  }

  const truoc = chuSo.slice(0, cham).replace(/^0+(?=\d)/, "") || "0";
  const sau = chuSo.slice(cham).replace(/0+$/, "");
  const ket = sau ? `${truoc}.${sau}` : truoc;
  return ket === "0" ? "0" : dau + ket;
}

/** 0.01 -> "1" (risk lưu dạng phân số, hiển thị dạng %). */
export const percentFromFraction = (v: string): string => shiftDecimal(v, 2);

/** "1" -> "0.01" (người dùng nhập %, backend nhận phân số). */
export const fractionFromPercent = (v: string): string => shiftDecimal(v, -2);

type Phan = { am: boolean; nguyen: string; le: string };

function tach(v: string): Phan {
  const m = DANG_SO.exec(v.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new Error(`không phải số thập phân: ${JSON.stringify(v)}`);
  }
  return {
    am: m[1] === "-",
    nguyen: (m[2] === "" ? "0" : m[2]).replace(/^0+(?=\d)/, ""),
    le: (m[3] ?? "").replace(/0+$/, ""),
  };
}

function soSanhDoLon(a: Phan, b: Phan): -1 | 0 | 1 {
  // So độ dài phần nguyên TRƯỚC: "2" dài 1, "10" dài 2, nên 2 < 10.
  // So chuỗi thẳng sẽ ra "2" > "10" vì thứ tự từ điển.
  if (a.nguyen.length !== b.nguyen.length) return a.nguyen.length > b.nguyen.length ? 1 : -1;
  if (a.nguyen !== b.nguyen) return a.nguyen > b.nguyen ? 1 : -1;
  const n = Math.max(a.le.length, b.le.length);
  const la = a.le.padEnd(n, "0");
  const lb = b.le.padEnd(n, "0");
  if (la === lb) return 0;
  return la > lb ? 1 : -1;
}

/** Cộng 1 vào một chuỗi chữ số, có nhớ. Dùng cho làm tròn, không qua Number. */
function congMot(chuSo: string): string {
  const d = chuSo.split("");
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
 * nguyên vẹn cho mọi phép so sánh ngưỡng.
 */
export function roundDecimal(value: string, places: number): string {
  const { am, nguyen, le } = tach(value);

  let truoc: string;
  let sau: string;
  if (le.length <= places) {
    truoc = nguyen;
    sau = le;
  } else {
    const giu = nguyen + le.slice(0, places);
    // charCodeAt(places) >= 53 là "chữ số kế tiếp >= '5'".
    const ket = le.charCodeAt(places) >= 53 ? congMot(giu) : giu;
    const doDaiNguyen = ket.length - places;
    truoc = ket.slice(0, doDaiNguyen).replace(/^0+(?=\d)/, "") || "0";
    sau = ket.slice(doDaiNguyen).replace(/0+$/, "");
  }

  const so = sau ? `${truoc}.${sau}` : truoc;
  return so === "0" ? "0" : (am ? "-" : "") + so;
}

/** So sánh hai số thập phân dạng chuỗi, không đi qua Number. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const A = tach(a);
  const B = tach(b);
  const aKhong = A.nguyen === "0" && A.le === "";
  const bKhong = B.nguyen === "0" && B.le === "";
  if (aKhong && bKhong) return 0; // "0" và "-0" bằng nhau
  if (A.am !== B.am) return A.am ? -1 : 1;
  const d = soSanhDoLon(A, B);
  return A.am ? ((-d) as -1 | 0 | 1) : d;
}

// Intl.NumberFormat.prototype.format nhận CHUỖI từ ES2023, chính là để không
// mất độ chính xác. Kiểu của TypeScript còn khai báo number|bigint nên phải ép.
function localeCode(locale: Locale): string {
  return locale === "en" ? "en-US" : "vi-VN";
}

export function formatMoney(value: string, currency?: string, locale: Locale = "vi"): string {
  const so = new Intl.NumberFormat(localeCode(locale), { maximumFractionDigits: 20 }).format(
    value as unknown as number,
  );
  return currency ? `${so} ${currency}` : so;
}


// Tỷ số (hệ số lợi nhuận, R:R, hệ số hồi phục) KHÔNG phải tiền: chúng là
// thương của hai số nên có đuôi thập phân dài vô hạn. Hai chữ số là đủ để
// đọc và để so với ngưỡng §8.2; nhiều hơn chỉ là nhiễu.
export function formatRatio(value: string, places = 2, locale: Locale = "vi"): string {
  return new Intl.NumberFormat(localeCode(locale), { maximumFractionDigits: 20 }).format(
    roundDecimal(value, places) as unknown as number,
  );
}

// Phần trăm luôn đủ hai chữ số thập phân để cột số không so le.
/**
 * Backend trả TỶ LỆ dạng PHÂN SỐ, không phải phần trăm: win_pct của 28 lệnh
 * thắng trên 64 lệnh là "0.4375". Dán "%" vào con số đó cho ra "0,4375%" —
 * sai một trăm lần, và đọc lướt thì thành "tỷ lệ thắng gần bằng không".
 * Phải nhân 100 trước, và nhân bằng shiftDecimal chứ không bằng Number.
 */
export function formatPercent(fraction: string, places = 2, locale: Locale = "vi"): string {
  const so = roundDecimal(shiftDecimal(fraction, 2), places);
  const formatted = new Intl.NumberFormat(localeCode(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(so as unknown as number);
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
  if (!DANG_SO.test(v) || v === "" || v === "-" || v === "+" || v === ".") {
    throw new Error(`toPlot: không phải số thập phân: ${JSON.stringify(value)}`);
  }
  return +v;
}

import type { Locale } from "@/i18n";
