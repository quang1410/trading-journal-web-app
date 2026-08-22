import { useState, type ReactNode } from "react";
import { ChevronDownIcon, MoveDownRightIcon, MoveUpRightIcon } from "lucide-react";
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
import { formatDateOnly } from "@/lib/format";
import { compareDecimal, formatMoney } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import type { MetaEnums } from "@/features/meta/hooks";
import type { Trade } from "./types";

const SO_COT = 11;

// Bốn trục chấm điểm, mỗi trục tối đa 25 (internal/scoring). Thứ tự là thứ tự
// XẢY RA của một lệnh — vào, trong, thoát, tâm lý — nên dải điểm đọc từ trái
// sang phải chính là đọc lại vòng đời của lệnh đó.
const DIEM_TOI_DA_MOI_TRUC = 25;

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
function Tien({ value, currency, locale }: { value: string; currency?: string; locale: "vi" | "en" }) {
  const { dau, lop } = dauVaMau(value);
  return <span className={`num ${lop}`}>{`${dau}${formatMoney(value, currency, locale)}`}</span>;
}

/** Số tiền trung tính, không mang nghĩa lãi/lỗ (phí, giá vào, lũy kế…). */
function So({ value, locale, noValue }: { value: string | null; locale: "vi" | "en"; noValue: string }) {
  return <span className="num">{value === null ? noValue : formatMoney(value, undefined, locale)}</span>;
}

/**
 * Dải kỷ luật — bốn vạch, mỗi vạch một trục chấm điểm.
 *
 * Đây là thứ mà con số tổng không nói được. "40 điểm" là một con số phải dịch;
 * bốn vạch cho biết NGAY hỏng ở khâu nào, và khi đọc dọc cả cột thì một cột
 * vạch đỏ ở đúng vị trí thứ tư hiện ra thành một mẫu hình: tâm lý là chỗ hỏng
 * lặp đi lặp lại, chứ không phải kỹ thuật vào lệnh.
 *
 * aria-hidden vì con số tổng ngay cạnh đã là nội dung khả truy cập, và bốn ô
 * div rỗng thì không đọc thành lời được. Bản chữ đầy đủ nằm ở khối chi tiết.
 */
function DaiKyLuat({ t }: { t: Trade }) {
  const truc = [t.score_entry, t.score_in_trade, t.score_exit, t.score_psych];
  const chuaCham = t.score_total === null;

  return (
    <span aria-hidden className="flex gap-[3px]">
      {truc.map((diem, i) => (
        <span
          key={i}
          className={cn(
            "h-4 w-[5px] rounded-[1px]",
            chuaCham
              ? "bg-border"
              : diem >= DIEM_TOI_DA_MOI_TRUC
                ? "bg-primary"
                : diem > 0
                  ? "bg-warning"
                  : "bg-destructive",
          )}
        />
      ))}
    </span>
  );
}

export function TradeTable({
  rows,
  timezone,
  currency,
  enums,
  onSua,
  onXoa,
}: {
  rows: Trade[];
  timezone: string;
  currency: string;
  enums?: MetaEnums;
  onSua: (t: Trade) => void;
  onXoa: (t: Trade) => void;
}) {
  const { locale, t: dich } = useI18n();
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
    <div className="table-sticky overflow-hidden rounded-md border border-border bg-card">
      <Table>
        <TableHeader>
          {/* Mọi cột số canh PHẢI. Đây là quy ước của sổ sách chứ không phải
              sở thích: canh phải cộng với chữ số đều bề ngang (.num) làm hàng
              nghìn xếp thẳng cột, nên so độ lớn giữa các dòng là liếc mắt chứ
              không phải đếm chữ số. */}
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 text-right">{dich("table.stt")}</TableHead>
            <TableHead>{dich("table.enteredAt")}</TableHead>
            <TableHead>{dich("accounts.code")}</TableHead>
            <TableHead>{dich("table.direction")}</TableHead>
            <TableHead className="w-[104px] text-right">{dich("table.profit")}</TableHead>
            <TableHead className="w-[72px] text-right">{dich("table.fee")}</TableHead>
            <TableHead className="w-[132px] text-right">{dich("table.net")}</TableHead>
            <TableHead className="w-[104px] text-right">{dich("table.cumulative")}</TableHead>
            <TableHead className="w-[96px] pl-4">{dich("table.discipline")}</TableHead>
            <TableHead>{dich("table.tradeClass")}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => {
            const mo = dangMo.has(t.id);
            return [
              <TableRow key={t.id}>
                <TableCell className="num text-right text-muted-foreground">{t.stt}</TableCell>
                <TableCell className="num text-xs">
                   {formatInstant(t.entered_at, timezone, locale)}
                </TableCell>
                <TableCell className="num font-medium">{t.symbol}</TableCell>
                <TableCell>
                  {/*
                    Mũi tên chứ không phải màu. Tô Long xanh / Short đỏ đòi phải
                    so với chuỗi enum chép cứng, và chiều lệnh không phải lãi hay
                    lỗ — gán màu lãi/lỗ cho nó là dạy người đọc một quy ước sai.
                    Hướng của mũi tên nói đúng thứ cần nói mà không mượn màu.
                  */}
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MuiTen direction={t.direction} />
                     {enumLabel("direction", t.direction, locale, enums?.directions)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                   <Tien value={t.profit} locale={locale} />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                   <So value={t.fee} locale={locale} noValue={dich("common.noValue")} />
                </TableCell>
                <TableCell className="text-right font-medium">
                   <Tien value={t.net} currency={currency} locale={locale} />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                   <So value={t.cum_by_trade} locale={locale} noValue={dich("common.noValue")} />
                </TableCell>
                <TableCell className="pl-4">
                  <span className="flex items-center gap-2">
                    <DaiKyLuat t={t} />
                     <span className="num text-xs text-muted-foreground">
                       {t.score_total === null ? dich("common.noValue") : t.score_total}
                    </span>
                  </span>
                </TableCell>
                 <TableCell className="text-xs text-muted-foreground">
                   {enumLabel("trade_class", t.trade_class, locale, enums?.trade_classes)}
                 </TableCell>
                <TableCell className="text-right">
                  {/* Chỉ còn cái mũi. Chữ "Chi tiết" lặp 50 lần xuống cả cột là
                      50 lần đọc cùng một từ; hướng của mũi thì nói được cả
                      trạng thái đang mở hay đang đóng, việc mà chữ không làm. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    aria-expanded={mo}
                     aria-label={dich("trades.detailLabel", { stt: t.stt })}
                    onClick={() => doiTrangThai(t.id)}
                  >
                    <ChevronDownIcon
                      aria-hidden
                      className={cn("size-4 transition-transform", mo && "rotate-180")}
                    />
                  </Button>
                </TableCell>
              </TableRow>,

              mo ? (
                <TableRow key={`${t.id}-ct`} className="hover:bg-transparent">
                  <TableCell colSpan={SO_COT} className="bg-muted p-0">
                     <ChiTiet t={t} onSua={onSua} onXoa={onXoa} locale={locale} enums={enums} />
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
 * Mũi tên chiều lệnh.
 *
 * Chuỗi enum KHÔNG được chép vào đây (quy tắc 5). Phân biệt bằng chữ cái đầu
 * viết thường là đủ cho hai giá trị duy nhất backend phát ra, và giá trị lạ
 * rơi về mũi lên chứ không nổ.
 */
function MuiTen({ direction }: { direction: string }) {
  const xuong = direction.slice(0, 1).toLowerCase() === "s";
  const Icon = xuong ? MoveDownRightIcon : MoveUpRightIcon;
  return <Icon aria-hidden className="size-3.5 shrink-0" />;
}

/**
 * Phần còn lại của 40 trường.
 *
 * Không gọi request nào: GET /trades đã trả đủ, nên chi tiết là chuyện thuần
 * client. Chia thành bốn nhóm có tiêu đề thay vì đổ hết thành một khối chữ
 * chảy: 20 cặp "nhãn: giá trị" nối đuôi nhau thì mắt không có chỗ bám, và tìm
 * "Đỉnh" trong đó là đọc từng chữ. Bốn nhóm thì tìm nhóm trước, tìm dòng sau.
 */
function ChiTiet({
  t,
  onSua,
  onXoa,
  locale,
  enums,
}: {
  t: Trade;
  onSua: (t: Trade) => void;
  onXoa: (t: Trade) => void;
  locale: "vi" | "en";
  enums?: MetaEnums;
}) {
  const { t: dich } = useI18n();
  const noValue = dich("common.noValue");
  return (
    <div className="flex flex-col gap-4 border-t border-border p-4 text-sm">
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <Nhom tieuDe={dich("table.priceVolume")}>
          <Dong nhan={dich("tradeForm.entry")} gt={<So value={t.entry} locale={locale} noValue={noValue} />} />
          <Dong nhan={dich("tradeForm.exit")} gt={<So value={t.exit} locale={locale} noValue={noValue} />} />
          <Dong nhan={dich("tradeForm.volume")} gt={<So value={t.volume} locale={locale} noValue={noValue} />} />
          <Dong nhan={dich("tradeForm.profitTheory")} gt={<So value={t.profit_theory} locale={locale} noValue={noValue} />} />
        </Nhom>

        <Nhom tieuDe={dich("table.context")}>
          <Dong nhan={dich("tradeForm.setup")} gt={t.setup} />
          <Dong nhan={dich("tradeForm.timeframe")} gt={t.timeframe || noValue} />
          <Dong nhan={dich("cashflow.date")} gt={<span className="num">{formatDateOnly(t.day, locale)}</span>} />
          <Dong nhan={dich("table.week")} gt={t.week} />
          <Dong nhan={dich("table.month")} gt={<span className="num">{t.month}</span>} />
          <Dong
            nhan={dich("table.weekday")}
            gt={enumLabel("weekday", t.weekday, locale, enums?.weekdays)}
          />
        </Nhom>

        <Nhom
          tieuDe={
            <>
              {dich("table.discipline")} {" "}
              <span className="num">
                {t.score_total === null ? noValue : `${t.score_total}/100`}
              </span>
            </>
          }
        >
          <Dong
            nhan={dich("tradeForm.entryQuality")}
            gt={<Cham chu={enumLabel("entry_quality", t.entry_quality, locale, enums?.entry_qualities)} diem={t.score_entry} noValue={noValue} />}
          />
          <Dong
            nhan={dich("tradeForm.inTradeQuality")}
            gt={<Cham chu={enumLabel("in_trade_quality", t.in_trade_quality, locale, enums?.in_trade_qualities)} diem={t.score_in_trade} noValue={noValue} />}
          />
          <Dong
            nhan={dich("tradeForm.exitQuality")}
            gt={<Cham chu={enumLabel("exit_quality", t.exit_quality, locale, enums?.exit_qualities)} diem={t.score_exit} noValue={noValue} />}
          />
          <Dong
            nhan={dich("tradeForm.psychology")}
            gt={<Cham chu={enumLabel("psychology", t.psychology, locale, enums?.psychologies)} diem={t.score_psych} noValue={noValue} />}
          />
        </Nhom>

        <Nhom tieuDe={dich("table.cumulative")}>
          <Dong nhan={dich("table.cumulativeByDay")} gt={<So value={t.cum_by_day} locale={locale} noValue={noValue} />} />
          <Dong nhan={dich("table.cumulativeTheory")} gt={<So value={t.cum_theory} locale={locale} noValue={noValue} />} />
          <Dong nhan={dich("table.peak")} gt={<So value={t.running_peak} locale={locale} noValue={noValue} />} />
          <Dong nhan={dich("table.drawdown")} gt={<So value={t.drawdown} locale={locale} noValue={noValue} />} />
        </Nhom>
      </div>

      {t.notes !== "" && (
        <p className="max-w-prose border-l-2 border-border pl-3 text-muted-foreground">
           {dich("table.notePrefix")} {t.notes}
        </p>
      )}

      <div className="flex gap-2">
        {/* Nhãn có kèm STT: một trang 50 dòng thì 50 nút "Sửa" trùng tên nhau
            khi test truy theo role. */}
        <Button
          variant="outline"
          size="sm"
           aria-label={dich("trades.editLabel", { stt: t.stt })}
          onClick={() => onSua(t)}
        >
           {dich("common.edit")}
        </Button>
        <Button
          variant="outline"
          size="sm"
           aria-label={dich("trades.deleteLabel", { stt: t.stt })}
          onClick={() => onXoa(t)}
        >
           {dich("common.delete")}
        </Button>
      </div>
    </div>
  );
}

function Nhom({ tieuDe, children }: { tieuDe: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow border-b border-border pb-1.5">{tieuDe}</span>
      {children}
    </div>
  );
}

/**
 * Một dòng nhãn – giá trị. Giá trị canh phải để cả nhóm thành một cột số.
 *
 * Xuống dòng chứ KHÔNG cắt đuôi: chuỗi đánh giá dài nhất là "Thoát chủ động
 * (lý do kỹ thuật)", và cắt nó đi thì mất luôn điểm số nằm ngay sau — đúng
 * con số mà cả nhóm này tồn tại để cho thấy.
 */
function Dong({ nhan, gt }: { nhan: string; gt: ReactNode }) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{nhan}</span>
      <span className="min-w-0 text-right">{gt}</span>
    </span>
  );
}

/**
 * Một trục chấm điểm: chữ đánh giá kèm điểm của nó.
 *
 * Điểm tô theo bậc chứ không tô đều, để trục hỏng tự nổi lên trong bốn dòng.
 */
function Cham({ chu, diem, noValue }: { chu: string; diem: number; noValue: string }) {
  const lop =
    diem >= DIEM_TOI_DA_MOI_TRUC
      ? "text-primary"
      : diem > 0
        ? "text-warning"
        : "text-destructive";
  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5">
       <span>{chu || noValue}</span>
      <span className={`num shrink-0 text-xs ${lop}`}>{diem}</span>
    </span>
  );
}
