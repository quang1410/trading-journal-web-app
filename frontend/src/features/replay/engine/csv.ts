import type { Bars } from "./types";

/**
 * Đọc file CSV nến: time,open,high,low,close[,volume]. Cột time là Unix giây, Unix mili-giây
 * hoặc ngày giờ (coi là UTC nếu không ghi múi giờ). Dòng header, dòng hỏng và dòng trùng / lùi thời
 * gian bị bỏ qua. Ngăn cách bằng dấu phẩy, chấm phẩy hoặc tab.
 */
export function parseCsv(text: string): Bars {
  let cap = 1 << 16;
  let n = 0;
  let T = new Float64Array(cap);
  let O = new Float64Array(cap);
  let H = new Float64Array(cap);
  let L = new Float64Array(cap);
  let C = new Float64Array(cap);
  let V = new Float64Array(cap);
  const grow = () => {
    cap *= 2;
    const g = (a: Float64Array) => {
      const b = new Float64Array(cap);
      b.set(a);
      return b;
    };
    T = g(T);
    O = g(O);
    H = g(H);
    L = g(L);
    C = g(C);
    V = g(V);
  };
  let pos = 0;
  while (pos < text.length) {
    let end = text.indexOf("\n", pos);
    if (end < 0) end = text.length;
    const line = text.slice(pos, end).trim();
    pos = end + 1;
    if (!line) continue;
    const f = line.split(/[,;\t]/);
    if (f.length < 5) continue;
    let t = +f[0];
    if (!Number.isFinite(t) || f[0].trim() === "") {
      const raw = f[0].trim();
      const ms = Date.parse(raw.includes("T") || raw.endsWith("Z") ? raw : `${raw.replace(" ", "T")}Z`);
      if (!Number.isFinite(ms)) continue; // header
      t = ms / 1000;
    } else if (t > 1e11) t /= 1000; // mili-giây → giây
    const o = +f[1];
    const h = +f[2];
    const l = +f[3];
    const c = +f[4];
    if (![o, h, l, c].every(Number.isFinite)) continue;
    if (n > 0 && t <= T[n - 1]) continue;
    if (n >= cap) grow();
    T[n] = t;
    O[n] = o;
    H[n] = h;
    L[n] = l;
    C[n] = c;
    V[n] = f[5] ? +f[5] || 0 : 0;
    n++;
  }
  // slice (không phải subarray) để lưu vào IndexedDB chỉ phần đã dùng của buffer
  return { n, T: T.slice(0, n), O: O.slice(0, n), H: H.slice(0, n), L: L.slice(0, n), C: C.slice(0, n), V: V.slice(0, n) };
}
