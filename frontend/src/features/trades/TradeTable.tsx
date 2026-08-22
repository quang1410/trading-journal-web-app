import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInstant } from "@/lib/datetime";
import { compareDecimal, formatMoney } from "@/lib/decimal";
import type { Trade } from "./types";

const KHONG_CO = "—";
const SO_COT = 11;

/**
 * Dấu và màu theo dấu của một số tiền.
 *
 * So bằng compareDecimal chứ không ép sang số: tiền tới đây dưới dạng chuỗi
 * chính vì float làm mất chữ số, và một phép so sánh chuỗi ngây thơ kiểu
 * `v !== "0"` xếp nhầm "0.00" vào nhóm lãi.
 *
 * Dấu +/− đi kèm màu chứ không để màu làm tín hiệu duy nhất — spec mẹ §8.2.
 */
function dauVaMau(v: string): { dau: string; lop: string } {
  const d = compareDecimal(v, "0");
  if (d > 0) return { dau: "+", lop: "text-primary" };
  if (d < 0) return { dau: "", lop: "text-destructive" }; // dấu trừ đã nằm trong số
  return { dau: "", lop: "text-muted-foreground" };
}

/**
 * Một con số tiền có dấu và màu, gộp thành MỘT text node.
 *
 * Tách dấu ra khỏi số thành hai node sẽ làm getByText("+118,5") không khớp
 * được — cùng lý do đã ghi trong AccountsPage.
 */
function Tien({ value, currency }: { value: string; currency?: string }) {
  const { dau, lop } = dauVaMau(value);
  return <span className={`num ${lop}`}>{`${dau}${formatMoney(value, currency)}`}</span>;
}

/** Số tiền trung tính, không mang nghĩa lãi/lỗ (phí, giá vào, lũy kế…). */
function So({ value }: { value: string | null }) {
  return <span className="num">{value === null ? KHONG_CO : formatMoney(value)}</span>;
}

export function TradeTable({
  rows,
  timezone,
  currency,
  onSua,
  onXoa,
}: {
  rows: Trade[];
  timezone: string;
  currency: string;
  onSua: (t: Trade) => void;
  onXoa: (t: Trade) => void;
}) {
  // Nhiều dòng cùng bung được: so sánh hai lệnh là việc thường xuyên.
  const [dangMo, setDangMo] = useState<ReadonlySet<number>>(new Set());

  function doiTrangThai(id: number) {
    setDangMo((cu) => {
      const moi = new Set(cu);
      if (!moi.delete(id)) moi.add(id);
      return moi;
    });
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>STT</TableHead>
            <TableHead>Thời điểm</TableHead>
            <TableHead>Mã</TableHead>
            <TableHead>Chiều</TableHead>
            <TableHead>Lãi/lỗ</TableHead>
            <TableHead>Phí</TableHead>
            <TableHead>Net</TableHead>
            <TableHead>Lũy kế</TableHead>
            <TableHead>Điểm</TableHead>
            <TableHead>Phân loại</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => {
            const mo = dangMo.has(t.id);
            return [
              <TableRow key={t.id}>
                <TableCell className="num">{t.stt}</TableCell>
                <TableCell>{formatInstant(t.entered_at, timezone)}</TableCell>
                <TableCell className="font-medium">{t.symbol}</TableCell>
                <TableCell>{t.direction}</TableCell>
                <TableCell>
                  <Tien value={t.profit} />
                </TableCell>
                <TableCell>
                  <So value={t.fee} />
                </TableCell>
                <TableCell>
                  <Tien value={t.net} currency={currency} />
                </TableCell>
                <TableCell>
                  <So value={t.cum_by_trade} />
                </TableCell>
                <TableCell className="num">
                  {t.score_total === null ? KHONG_CO : t.score_total}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{t.trade_class}</Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={mo}
                    aria-label={`Xem chi tiết lệnh ${t.stt}`}
                    onClick={() => doiTrangThai(t.id)}
                  >
                    {mo ? "Thu" : "Chi tiết"}
                  </Button>
                </TableCell>
              </TableRow>,

              mo ? (
                <TableRow key={`${t.id}-ct`}>
                  <TableCell colSpan={SO_COT}>
                    <ChiTiet t={t} onSua={onSua} onXoa={onXoa} />
                  </TableCell>
                </TableRow>
              ) : null,
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Phần còn lại của 40 trường.
 *
 * Không gọi request nào: GET /trades đã trả đủ, nên chi tiết là chuyện thuần
 * client. Các trường tuần/tháng/thứ có mặt ở đây chứ không lên cột chính —
 * chúng chỉ mang nghĩa khi gom nhóm, việc của Phase 4.
 */
function ChiTiet({
  t,
  onSua,
  onXoa,
}: {
  t: Trade;
  onSua: (t: Trade) => void;
  onXoa: (t: Trade) => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-2 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Muc nhan="Giá vào" gt={<So value={t.entry} />} />
        <Muc nhan="Giá ra" gt={<So value={t.exit} />} />
        <Muc nhan="Khối lượng" gt={<So value={t.volume} />} />
        <Muc nhan="Lãi lý thuyết" gt={<So value={t.profit_theory} />} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Muc nhan="Setup" gt={t.setup} />
        <Muc nhan="Khung thời gian" gt={t.timeframe || KHONG_CO} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Muc nhan="Vào lệnh" gt={`${t.entry_quality || KHONG_CO} (${t.score_entry})`} />
        <Muc nhan="Trong lệnh" gt={`${t.in_trade_quality || KHONG_CO} (${t.score_in_trade})`} />
        <Muc nhan="Thoát lệnh" gt={`${t.exit_quality || KHONG_CO} (${t.score_exit})`} />
        <Muc nhan="Tâm lý" gt={`${t.psychology || KHONG_CO} (${t.score_psych})`} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Muc nhan="Ngày" gt={t.day} />
        <Muc nhan="Tuần" gt={t.week} />
        <Muc nhan="Tháng" gt={t.month} />
        <Muc nhan="Thứ" gt={t.weekday} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Muc nhan="Lũy kế theo ngày" gt={<So value={t.cum_by_day} />} />
        <Muc nhan="Lũy kế lý thuyết" gt={<So value={t.cum_theory} />} />
        <Muc nhan="Đỉnh" gt={<So value={t.running_peak} />} />
        <Muc nhan="Sụt giảm" gt={<So value={t.drawdown} />} />
      </div>

      {t.notes !== "" && <p className="text-muted-foreground">Ghi chú: {t.notes}</p>}

      <div className="flex gap-2">
        {/* Nhãn có kèm STT: một trang 50 dòng thì 50 nút "Sửa" trùng tên nhau
            khi test truy theo role. */}
        <Button
          variant="outline"
          size="sm"
          aria-label={`Sửa lệnh ${t.stt}`}
          onClick={() => onSua(t)}
        >
          Sửa
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Xoá lệnh ${t.stt}`}
          onClick={() => onXoa(t)}
        >
          Xoá
        </Button>
      </div>
    </div>
  );
}

function Muc({ nhan, gt }: { nhan: string; gt: ReactNode }) {
  return (
    <span className="flex gap-1">
      <span className="text-muted-foreground">{nhan}:</span>
      {gt}
    </span>
  );
}
