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
import { formatMoney } from "@/lib/decimal";
import { signAndColor } from "@/lib/thresholds";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import type { MetaEnums } from "@/features/meta/hooks";
import type { Trade } from "./types";

const COL_COUNT = 11;

// Bốn trục chấm điểm, mỗi trục tối đa 25 (internal/scoring). Thứ tự là thứ tự
// XẢY RA của một lệnh — vào, trong, thoát, tâm lý — nên dải điểm đọc từ trái
// sang phải chính là đọc lại vòng đời của lệnh đó.
const MAX_SCORE_PER_AXIS = 25;

/**
 * Một con số tiền có dấu và màu, gộp thành MỘT text node.
 *
 * Tách dấu ra khỏi số thành hai node sẽ làm getByText("+118,5") không khớp
 * được — cùng lý do đã ghi trong AccountsPage.
 */
function Money({ value, currency, locale }: { value: string; currency?: string; locale: "vi" | "en" }) {
  const { sign, colorClass } = signAndColor(value);
  return <span className={`num ${colorClass}`}>{`${sign}${formatMoney(value, currency, locale)}`}</span>;
}

/** Số tiền trung tính, không mang nghĩa lãi/lỗ (phí, giá vào, lũy kế…). */
function NumberCell({ value, locale, noValue }: { value: string | null; locale: "vi" | "en"; noValue: string }) {
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
  const axis = [t.score_entry, t.score_in_trade, t.score_exit, t.score_psych];
  const untouched = t.score_total === null;

  return (
    <span aria-hidden className="flex gap-[3px]">
      {axis.map((score, i) => (
        <span
          key={i}
          className={cn(
            "h-4 w-[5px] rounded-[1px]",
            untouched
              ? "bg-border"
              : score >= MAX_SCORE_PER_AXIS
                ? "bg-primary"
                : score > 0
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
  onEdit,
  onRemove,
}: {
  rows: Trade[];
  timezone: string;
  currency: string;
  enums?: MetaEnums;
  onEdit: (t: Trade) => void;
  onRemove: (t: Trade) => void;
}) {
  const { locale, t: translate } = useI18n();
  // Nhiều dòng cùng bung được: so sánh hai lệnh là việc thường xuyên.
  const [isOpen, setDangMo] = useState<ReadonlySet<number>>(new Set());

  function toggleStatus(id: number) {
    setDangMo((prev) => {
      const fresh = new Set(prev);
      if (!fresh.delete(id)) fresh.add(id);
      return fresh;
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
            <TableHead className="w-12 text-right">{translate("table.stt")}</TableHead>
            <TableHead>{translate("table.enteredAt")}</TableHead>
            <TableHead>{translate("accounts.code")}</TableHead>
            <TableHead>{translate("table.direction")}</TableHead>
            <TableHead className="w-[104px] text-right">{translate("table.profit")}</TableHead>
            <TableHead className="w-[72px] text-right">{translate("table.fee")}</TableHead>
            <TableHead className="w-[132px] text-right">{translate("table.net")}</TableHead>
            <TableHead className="w-[104px] text-right">{translate("table.cumulative")}</TableHead>
            <TableHead className="w-[96px] pl-4">{translate("table.discipline")}</TableHead>
            <TableHead>{translate("table.tradeClass")}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => {
            const open = isOpen.has(t.id);
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
                    <Arrow direction={t.direction} />
                     {enumLabel("direction", t.direction, locale, enums?.directions)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                   <Money value={t.profit} locale={locale} />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                   <NumberCell value={t.fee} locale={locale} noValue={translate("common.noValue")} />
                </TableCell>
                <TableCell className="text-right font-medium">
                   <Money value={t.net} currency={currency} locale={locale} />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                   <NumberCell value={t.cum_by_trade} locale={locale} noValue={translate("common.noValue")} />
                </TableCell>
                <TableCell className="pl-4">
                  <span className="flex items-center gap-2">
                    <DaiKyLuat t={t} />
                     <span className="num text-xs text-muted-foreground">
                       {t.score_total === null ? translate("common.noValue") : t.score_total}
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
                    aria-expanded={open}
                     aria-label={translate("trades.detailLabel", { stt: t.stt })}
                    onClick={() => toggleStatus(t.id)}
                  >
                    <ChevronDownIcon
                      aria-hidden
                      className={cn("size-4 transition-transform", open && "rotate-180")}
                    />
                  </Button>
                </TableCell>
              </TableRow>,

              open ? (
                <TableRow key={`${t.id}-ct`} className="hover:bg-transparent">
                  <TableCell colSpan={COL_COUNT} className="bg-muted p-0">
                     <ChiTiet t={t} onEdit={onEdit} onRemove={onRemove} locale={locale} enums={enums} />
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
function Arrow({ direction }: { direction: string }) {
  const down = direction.slice(0, 1).toLowerCase() === "s";
  const Icon = down ? MoveDownRightIcon : MoveUpRightIcon;
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
  onEdit,
  onRemove,
  locale,
  enums,
}: {
  t: Trade;
  onEdit: (t: Trade) => void;
  onRemove: (t: Trade) => void;
  locale: "vi" | "en";
  enums?: MetaEnums;
}) {
  const { t: translate } = useI18n();
  const noValue = translate("common.noValue");
  return (
    <div className="flex flex-col gap-4 border-t border-border p-4 text-sm">
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <Group title={translate("table.priceVolume")}>
          <Close label={translate("tradeForm.entry")} value={<NumberCell value={t.entry} locale={locale} noValue={noValue} />} />
          <Close label={translate("tradeForm.exit")} value={<NumberCell value={t.exit} locale={locale} noValue={noValue} />} />
          <Close label={translate("tradeForm.volume")} value={<NumberCell value={t.volume} locale={locale} noValue={noValue} />} />
          <Close label={translate("tradeForm.profitTheory")} value={<NumberCell value={t.profit_theory} locale={locale} noValue={noValue} />} />
        </Group>

        <Group title={translate("table.context")}>
          <Close label={translate("tradeForm.setup")} value={t.setup} />
          <Close label={translate("tradeForm.timeframe")} value={t.timeframe || noValue} />
          <Close label={translate("cashflow.date")} value={<span className="num">{formatDateOnly(t.day, locale)}</span>} />
          <Close label={translate("table.week")} value={t.week} />
          <Close label={translate("table.month")} value={<span className="num">{t.month}</span>} />
          <Close
            label={translate("table.weekday")}
            value={enumLabel("weekday", t.weekday, locale, enums?.weekdays)}
          />
        </Group>

        <Group
          title={
            <>
              {translate("table.discipline")} {" "}
              <span className="num">
                {t.score_total === null ? noValue : `${t.score_total}/100`}
              </span>
            </>
          }
        >
          <Close
            label={translate("tradeForm.entryQuality")}
            value={<ScoredCell text={enumLabel("entry_quality", t.entry_quality, locale, enums?.entry_qualities)} score={t.score_entry} noValue={noValue} />}
          />
          <Close
            label={translate("tradeForm.inTradeQuality")}
            value={<ScoredCell text={enumLabel("in_trade_quality", t.in_trade_quality, locale, enums?.in_trade_qualities)} score={t.score_in_trade} noValue={noValue} />}
          />
          <Close
            label={translate("tradeForm.exitQuality")}
            value={<ScoredCell text={enumLabel("exit_quality", t.exit_quality, locale, enums?.exit_qualities)} score={t.score_exit} noValue={noValue} />}
          />
          <Close
            label={translate("tradeForm.psychology")}
            value={<ScoredCell text={enumLabel("psychology", t.psychology, locale, enums?.psychologies)} score={t.score_psych} noValue={noValue} />}
          />
        </Group>

        <Group title={translate("table.cumulative")}>
          <Close label={translate("table.cumulativeByDay")} value={<NumberCell value={t.cum_by_day} locale={locale} noValue={noValue} />} />
          <Close label={translate("table.cumulativeTheory")} value={<NumberCell value={t.cum_theory} locale={locale} noValue={noValue} />} />
          <Close label={translate("table.peak")} value={<NumberCell value={t.running_peak} locale={locale} noValue={noValue} />} />
          <Close label={translate("table.drawdown")} value={<NumberCell value={t.drawdown} locale={locale} noValue={noValue} />} />
        </Group>
      </div>

      {t.notes !== "" && (
        <p className="max-w-prose border-l-2 border-border pl-3 text-muted-foreground">
           {translate("table.notePrefix")} {t.notes}
        </p>
      )}

      <div className="flex gap-2">
        {/* Nhãn có kèm STT: một trang 50 dòng thì 50 nút "Sửa" trùng tên nhau
            khi test truy theo role. */}
        <Button
          variant="outline"
          size="sm"
           aria-label={translate("trades.editLabel", { stt: t.stt })}
          onClick={() => onEdit(t)}
        >
           {translate("common.edit")}
        </Button>
        <Button
          variant="outline"
          size="sm"
           aria-label={translate("trades.deleteLabel", { stt: t.stt })}
          onClick={() => onRemove(t)}
        >
           {translate("common.delete")}
        </Button>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow border-b border-border pb-1.5">{title}</span>
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
function Close({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{value}</span>
    </span>
  );
}

/**
 * Một trục chấm điểm: chữ đánh giá kèm điểm của nó.
 *
 * Điểm tô theo bậc chứ không tô đều, để trục hỏng tự nổi lên trong bốn dòng.
 */
function ScoredCell({ text, score, noValue }: { text: string; score: number; noValue: string }) {
  const colorClass =
    score >= MAX_SCORE_PER_AXIS
      ? "text-primary"
      : score > 0
        ? "text-warning"
        : "text-destructive";
  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5">
       <span>{text || noValue}</span>
      <span className={`num shrink-0 text-xs ${colorClass}`}>{score}</span>
    </span>
  );
}
