import { compareDecimal } from "@/lib/decimal";
import { MAU_HOA, MAU_KHONG_GIAO_DICH, bacNhiet } from "./palette";
import type { HeatmapCell, HeatmapMonth } from "./types";

/**
 * Gấp `HeatmapMonth[]` — mỗi tháng một mảng ô, chỉ chứa ngày CÓ giao dịch —
 * thành MỘT lưới lịch liên tục kiểu GitHub: 7 hàng (CN..T7) x n cột tuần.
 *
 * Vẽ đúng theo cấu trúc backend gửi (mười hai lưới lịch xếp dọc, mỗi tháng
 * một cái) sẽ nuốt chửng phần còn lại của trang với một năm giao dịch. Gộp
 * thành một lưới liên tục là MỘT màn hình thấy hết nhịp giao dịch — vốn là
 * điều duy nhất lịch nhiệt làm tốt hơn biểu đồ cột (spec 4b §2.2).
 *
 * KHÔNG dùng toPlot: mọi so sánh độ lớn đi qua compareDecimal trên chuỗi.
 * heatmap.ts không nạp Recharts, không cần toạ độ pixel, nên không có lý do
 * đụng tới ranh giới chuỗi->số (sửa spec §5.2 — bản spec dự đoán ngược).
 */

export type TrangThaiO = "ngoaiDai" | "khongGiaoDich" | "hoa" | "coLenh";

export type OLich = {
  /** null CHỈ khi trangThai === "ngoaiDai" — không có ngày thật để gắn nhãn. */
  day: string | null;
  trangThai: TrangThaiO;
  mau: string;
  sumNetGoc: string | null;
  count: number;
};

export type ThangNhan = { thang: string; cot: number };

export type LuoiNhiet = { cot: OLich[][]; nhanThang: ThangNhan[] };

function abs(v: string): string {
  return compareDecimal(v, "0") < 0 ? v.replace(/^-/, "") : v;
}

function ngayUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function themNgay(d: Date, soNgay: number): Date {
  const ket = new Date(d);
  ket.setUTCDate(ket.getUTCDate() + soNgay);
  return ket;
}

/**
 * Ranh giới tam phân vị theo RANK, đóng dưới: một giá trị BẰNG ranh giới thì
 * thuộc bậc TRÊN. Với dưới ba giá trị khác nhau — kể cả đúng một hoặc mọi giá
 * trị bằng nhau — công thức tự nhiên cho bậc thấp rỗng và dồn hết lên bậc cao
 * nhất, không cần nhánh riêng (spec 4b §2.5).
 */
function tinhRanhGioi(doLon: string[]): { b1: string; b2: string } {
  const sorted = [...doLon].sort(compareDecimal);
  const n = sorted.length;
  return { b1: sorted[Math.floor(n / 3)] ?? "0", b2: sorted[Math.floor((2 * n) / 3)] ?? "0" };
}

function xepBac(m: string, b1: string, b2: string): 1 | 2 | 3 {
  if (compareDecimal(m, b1) < 0) return 1;
  if (compareDecimal(m, b2) < 0) return 2;
  return 3;
}

export function chuanBiHeatmap(months: HeatmapMonth[]): LuoiNhiet {
  const cells: HeatmapCell[] = months.flatMap((m) => m.cells);
  if (cells.length === 0) return { cot: [], nhanThang: [] };

  const theoNgay = new Map(cells.map((c) => [c.day, c]));
  let ngayMin = cells[0].day;
  let ngayMax = cells[0].day;
  for (const c of cells) {
    if (c.day < ngayMin) ngayMin = c.day;
    if (c.day > ngayMax) ngayMax = c.day;
  }

  // Tam phân vị chỉ tính trên ngày CÓ LỆNH và KHÁC HOÀ — hoà đã có màu riêng
  // (MAU_HOA), không cạnh tranh bậc với những ngày thật sự lãi/lỗ.
  const doLonCoLenh = cells
    .filter((c) => compareDecimal(c.sum_net, "0") !== 0)
    .map((c) => abs(c.sum_net));
  const { b1, b2 } = tinhRanhGioi(doLonCoLenh);

  const dauDai = ngayUTC(ngayMin);
  const cuoiDai = ngayUTC(ngayMax);
  const dauLuoi = themNgay(dauDai, -dauDai.getUTCDay());
  const cuoiLuoi = themNgay(cuoiDai, 6 - cuoiDai.getUTCDay());

  const oPhang: OLich[] = [];
  for (let d = dauLuoi; d.getTime() <= cuoiLuoi.getTime(); d = themNgay(d, 1)) {
    const iso = isoUTC(d);

    if (iso < ngayMin || iso > ngayMax) {
      oPhang.push({ day: null, trangThai: "ngoaiDai", mau: "transparent", sumNetGoc: null, count: 0 });
      continue;
    }

    const o = theoNgay.get(iso);
    if (!o) {
      oPhang.push({
        day: iso,
        trangThai: "khongGiaoDich",
        mau: MAU_KHONG_GIAO_DICH,
        sumNetGoc: null,
        count: 0,
      });
      continue;
    }

    if (compareDecimal(o.sum_net, "0") === 0) {
      oPhang.push({ day: iso, trangThai: "hoa", mau: MAU_HOA, sumNetGoc: o.sum_net, count: o.count });
      continue;
    }

    const lai = compareDecimal(o.sum_net, "0") > 0;
    const bac = xepBac(abs(o.sum_net), b1, b2);
    oPhang.push({
      day: iso,
      trangThai: "coLenh",
      mau: bacNhiet(bac, lai),
      sumNetGoc: o.sum_net,
      count: o.count,
    });
  }

  const cot: OLich[][] = [];
  for (let i = 0; i < oPhang.length; i += 7) cot.push(oPhang.slice(i, i + 7));

  const nhanThang: ThangNhan[] = [];
  let thangTruoc: string | null = null;
  cot.forEach((c, idx) => {
    const ngayDau = c.find((o) => o.day)?.day;
    if (!ngayDau) return;
    const thang = ngayDau.slice(0, 7); // "YYYY-MM"
    if (thang !== thangTruoc) {
      const [y, m] = thang.split("-");
      nhanThang.push({ thang: `${m}/${y}`, cot: idx });
      thangTruoc = thang;
    }
  });

  return { cot, nhanThang };
}
