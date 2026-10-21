import type { Bars } from "./types";

export const DEMO_NAMES = ["DEMO US100", "DEMO US500"] as const;

/**
 * Hai bước ngẫu nhiên tương quan với nhau (≈ NQ và ES), Chủ nhật 18:00 – thứ Sáu 17:00 giờ
 * New York, nghỉ 1 tiếng mỗi ngày, 60 ngày từ 04/01/2026. Chỉ để thử app khi chưa có data thật.
 * `random` truyền vào được để test ra kết quả cố định.
 */
export function makeDemoBars(random: () => number = Math.random): [Bars, Bars] {
  const a: number[][] = [];
  const b: number[][] = [];
  let pa = 21000;
  let pb = 6100;
  let t = Math.floor(Date.UTC(2026, 0, 4, 23, 0) / 60000) * 60;
  const end = t + 60 * 86400;
  const bar = (o: number, c: number, vol: number) => [o, Math.max(o, c) + random() * vol, Math.min(o, c) - random() * vol, c];
  while (t < end) {
    const ny = new Date((t - 5 * 3600) * 1000);
    const dow = ny.getUTCDay();
    const hr = ny.getUTCHours();
    const open = !(dow === 6 || (dow === 5 && hr >= 17) || (dow === 0 && hr < 18) || hr === 17);
    if (open) {
      const vol = hr >= 9 && hr < 16 ? 6 : 2.5;
      const shock = (random() - 0.5) * vol * 2 + Math.sin(t / 9000) * 0.3;
      const ca = pa + shock;
      const cb = pb + shock * 0.27 + (random() - 0.5) * vol * 0.2;
      a.push([t, ...bar(pa, ca, vol)]);
      b.push([t, ...bar(pb, cb, vol * 0.27)]);
      pa = ca;
      pb = cb;
    }
    t += 60;
  }
  return [toBars(a), toBars(b)];
}

function toBars(rows: number[][]): Bars {
  const n = rows.length;
  const col = (k: number) => Float64Array.from(rows, (r) => r[k]);
  return { n, T: col(0), O: col(1), H: col(2), L: col(3), C: col(4), V: new Float64Array(n) };
}
