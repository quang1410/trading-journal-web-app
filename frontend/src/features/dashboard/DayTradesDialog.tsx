import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ErrorBlock } from "@/components/AccountGate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addDecimal, formatMoney, formatPrice } from "@/lib/decimal";
import { formatTimeOfDay } from "@/lib/datetime";
import { formatDateWithWeekday } from "@/lib/format";
import { useTrades } from "@/features/trades/hooks";
import { writeParams, type TradeFilter } from "@/features/trades/filters";
import type { Trade } from "@/features/trades/types";
import { useI18n } from "@/i18n";
import { textClassBySign } from "./palette";

/**
 * Bao nhiêu lệnh lấy mỗi lượt.
 *
 * Một ngày giao dịch bình thường nằm gọn dưới ngưỡng này, nên hầu hết lần mở
 * là một request và không có nút "tải thêm". Ngày scalping vài trăm lệnh thì
 * vẫn mở ra được, chỉ là đọc dần — hơn hẳn việc dựng một bảng 400 dòng mà
 * người ta chỉ nhìn mười dòng đầu.
 */
const PAGE = 50;

/**
 * Toàn bộ lệnh của MỘT ngày, mở từ ô lịch P&L.
 *
 * Vì sao là modal chứ không phải mở rộng ô lịch tại chỗ: bảng này rộng bảy cột
 * và dài bằng số lệnh trong ngày, còn ô lịch rộng một phần bảy của thẻ. Nhét
 * nó vào lưới sẽ đẩy các tuần bên dưới xuống và làm mất chính cái hình dạng
 * tháng mà người ta đang đọc.
 *
 * Quan hệ với tooltip: tooltip là bản XEM TRƯỚC — năm dòng, chỉ mã và lãi ròng,
 * hiện ra khi rê chuột. Đây là bản ĐẦY ĐỦ — mọi lệnh, kèm giá vào/ra và khối
 * lượng, mở ra khi bấm. Hai mức chi tiết cho hai mức chủ đích, không phải hai
 * bản sao của nhau.
 *
 * Bộ lọc của trang GIỮ NGUYÊN, chỉ ghi đè from/to — cùng lý do như DayTradeList
 * trong MonthCalendarCard: ô lịch đếm theo bộ lọc, nên danh sách chi tiết phải
 * đếm theo đúng bộ lọc đó, không thì hai con số cãi nhau.
 */
export function DayTradesDialog({
  day,
  accountId,
  filter,
  currency,
  timezone,
  onClose,
}: {
  /** null = đóng. Ngày lịch dạng "2026-08-17". */
  day: string | null;
  accountId: number;
  filter: TradeFilter;
  currency: string;
  timezone: string;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();

  return (
    <Dialog open={day !== null} onOpenChange={(open) => !open && onClose()}>
      {/* max-w có tiền tố sm: — không có nó thì sm:max-w-lg của DialogContent
          thắng ở mọi màn từ 640px trở lên và bảng bảy cột bị bóp còn 32rem. */}
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{day === null ? "" : formatDateWithWeekday(day, locale)}</DialogTitle>
          <DialogDescription>{t("dashboard.dayTrades")}</DialogDescription>
        </DialogHeader>
        {/* Dựng có điều kiện: đóng modal là unmount hẳn phần ruột, nên state
            phân trang bên trong tự về 1 mà không cần dọn tay.
            `key` chồng thêm cùng bảo đảm đó cho trường hợp đổi thẳng từ ngày
            này sang ngày khác mà KHÔNG đóng. Hôm nay lối đó chưa tồn tại — ô
            lịch nằm dưới lớp phủ nên bấm không tới — nhưng một cái nút "ngày
            sau" đặt trong chính modal này sẽ mở nó ra, và lúc đó thiếu `key`
            là bảng mới thừa hưởng số trang của bảng cũ. */}
        {day !== null && (
          <DayTradesBody
            key={day}
            day={day}
            accountId={accountId}
            filter={filter}
            currency={currency}
            timezone={timezone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DayTradesBody({
  day,
  accountId,
  filter,
  currency,
  timezone,
}: {
  day: string;
  accountId: number;
  filter: TradeFilter;
  currency: string;
  timezone: string;
}) {
  const { locale, t } = useI18n();
  // Số TRANG đang hiện, không phải trang thứ mấy: bấm "tải thêm" là nối thêm
  // vào bảng đang đọc, không phải thay nó bằng trang sau. Người ta mở khối này
  // để xem cả ngày như một khối, nên cắt nó thành các trang rời là sai nhịp.
  const [pages, setPages] = useState(1);

  const dayFilter = useMemo(() => ({ ...filter, from: day, to: day }), [filter, day]);

  const q = useTrades(accountId, dayFilter, 1, PAGE * pages);

  if (q.isError) return <ErrorBlock error={q.error} />;

  if (!q.data) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 rounded-sm" />
        ))}
      </div>
    );
  }

  // Đảo về THỜI GIAN TĂNG DẦN. Backend trả lệnh mới nhất trước
  // (service/journal.go, `Page`) — đúng cho bảng nhật ký, nơi người ta mở ra
  // để xem mình vừa làm gì. Nhưng trong phạm vi MỘT ngày thì đọc từ trên
  // xuống chính là đọc lại phiên giao dịch theo trình tự nó đã xảy ra: lệnh
  // đầu phiên, rồi những lệnh gỡ sau đó. Lật ngược trình tự ấy làm mất đúng
  // cái mạch nhân quả mà người ta mở bảng này ra để tìm.
  //
  // Sắp trên BẢN SAO: `items` là mảng nằm trong cache của TanStack, sort tại
  // chỗ sẽ sửa thẳng vào đó và mọi nơi khác đọc chung entry ấy sẽ thấy một thứ
  // tự khác đi mà không có gì báo.
  //
  // Khoá là `stt` chứ không phải `entered_at`: hai lệnh trùng khít thời điểm
  // vẫn phải có một thứ tự ổn định, và stt là thứ tự backend đã cấp.
  const rows = [...q.data.items].sort((a, b) => a.stt - b.stt);
  // Dựng một lần cho cả bảng: mọi dòng đi tới cùng một chỗ — nhật ký của
  // NGÀY này, giữ nguyên bộ lọc trang.
  const journalHref = `/trades?${writeParams(dayFilter, 1).toString()}`;
  const remaining = q.data.total - rows.length;

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("dashboard.restDay")}</p>;
  }

  // Tổng của những dòng ĐANG hiện — cộng đúng bằng mắt từ bảng ngay trên nó.
  const shownNet = rows.reduce((sum, x) => addDecimal(sum, x.net), "0");

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader>
            {/* Cột số canh phải, cột chữ canh trái — cùng quy ước với bảng
                nhật ký, để hai bảng đọc được bằng cùng một thói quen mắt. */}
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16">{t("table.enteredAt")}</TableHead>
              <TableHead>{t("accounts.code")}</TableHead>
              <TableHead>{t("table.direction")}</TableHead>
              <TableHead className="text-right">{t("dashboard.entryPrice")}</TableHead>
              <TableHead className="text-right">{t("dashboard.exitPrice")}</TableHead>
              <TableHead className="text-right">{t("dashboard.volume")}</TableHead>
              <TableHead className="text-right">{t("dashboard.net")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((x) => (
              <Row
                key={x.id}
                trade={x}
                currency={currency}
                timezone={timezone}
                journalHref={journalHref}
              />
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              {/* Còn lệnh chưa tải thì nhãn phải nói RÕ mình chỉ đếm một
                  phần. "50 lệnh" đứng trơ dưới một ngày 63 lệnh là một con số
                  sai, và nó cãi thẳng với chính con số ghi trên ô lịch mà
                  người dùng vừa bấm — ô lịch đếm cả ngày.
                  Tải hết rồi thì bỏ hẳn phần "trên N": lúc đó hai con số bằng
                  nhau, nhắc lại chỉ thêm nhiễu. */}
              <TableCell colSpan={6} className="text-xs text-muted-foreground">
                {remaining > 0
                  ? t("dashboard.partialTradeCount", { n: rows.length, total: q.data.total })
                  : t("dashboard.tradeCountOnDay", { n: rows.length })}
              </TableCell>
              <TableCell
                data-testid="day-total-net"
                className={`num text-right font-semibold ${textClassBySign(shownNet)}`}
              >
                {formatMoney(shownNet, currency, locale)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {remaining > 0 && (
        <Button variant="outline" size="sm" className="self-center" onClick={() => setPages((n) => n + 1)}>
          {t("dashboard.loadMoreTrades")} ({remaining})
        </Button>
      )}
    </div>
  );
}

function Row({
  trade,
  currency,
  timezone,
  journalHref,
}: {
  trade: Trade;
  currency: string;
  timezone: string;
  /** Đường tới nhật ký ĐÃ lọc sẵn về đúng ngày này. */
  journalHref: string;
}) {
  const { locale, t } = useI18n();

  return (
    <TableRow>
      <TableCell className="num text-xs text-muted-foreground">
        {formatTimeOfDay(trade.entered_at, timezone, locale)}
      </TableCell>
      <TableCell className="font-medium">
        {/* Mã sản phẩm là lối ra: xem đủ một lệnh (ghi chú, điểm kỷ luật, setup)
            là việc của bảng nhật ký, không phải của khối này. Bốn cột nữa nhét
            vào đây sẽ biến nó thành một bản sao xấu hơn của /trades.
            Link mang theo ĐÚNG bộ lọc đang xem, ghim về một ngày: thả người ta
            xuống một cuốn nhật ký chưa lọc thì nhãn "Mở trong nhật ký" hứa một
            đằng làm một nẻo, và họ phải tự lọc lại bằng tay đúng cái vừa bấm. */}
        <Link
          to={journalHref}
          className="rounded-sm underline decoration-transparent underline-offset-4 outline-none transition-colors hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          title={t("dashboard.openJournalRow")}
        >
          {trade.symbol}
        </Link>
      </TableCell>
      <TableCell>
        {/* Chip viền chứ không chip tô nền: hai màu tô của bảng này đã dành hết
            cho lãi và lỗ ở cột cuối. Thêm một cặp xanh/đỏ nữa cho LONG/SHORT là
            hai tín hiệu màu cùng nói chuyện trong một hàng, và cái tín hiệu
            quan trọng hơn — kết quả — thua về diện tích. */}
        <span className="num rounded-sm border border-[var(--border-input)] px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
          {trade.direction}
        </span>
      </TableCell>
      <TableCell className="num text-right text-muted-foreground">
        {trade.entry === null ? "—" : formatPrice(trade.entry, locale)}
      </TableCell>
      <TableCell className="num text-right text-muted-foreground">
        {trade.exit === null ? "—" : formatPrice(trade.exit, locale)}
      </TableCell>
      <TableCell className="num text-right text-muted-foreground">
        {trade.volume === null ? "—" : formatPrice(trade.volume, locale)}
      </TableCell>
      <TableCell className={`num text-right font-semibold ${textClassBySign(trade.net)}`}>
        {formatMoney(trade.net, currency, locale)}
      </TableCell>
    </TableRow>
  );
}


