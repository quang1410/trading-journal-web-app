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
const DINH_DANG = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 20 });

export function formatMoney(value: string, currency?: string): string {
  const so = DINH_DANG.format(value as unknown as number);
  return currency ? `${so} ${currency}` : so;
}
