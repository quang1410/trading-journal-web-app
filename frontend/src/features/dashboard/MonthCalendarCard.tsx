import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/decimal";
import { formatDateWithWeekday } from "@/lib/format";
import { useTrades } from "@/features/trades/hooks";
import type { TradeFilter } from "@/features/trades/filters";
import { useI18n } from "@/i18n";
import { BareCard } from "./ChartCard";
import { textClassBySign } from "./palette";
import { DayTradesDialog } from "./DayTradesDialog";
import { listMonths, prepareMonthGrid, type DayCell } from "./heatmap";
import type { HeatmapMonth } from "./types";

const WEEKDAY_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WEEKDAY_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

/**
 * Nguồn để tooltip hỏi danh sách lệnh của một ngày.
 *
 * Dùng context chứ không xuyên props: giữa thẻ và tooltip có hai tầng trung
 * gian (WeekLine, DayBox) chẳng liên quan gì tới việc gọi API — bắt chúng
 * mang hộ hai prop chỉ để chuyển tiếp là đúng thứ prop drilling mà context
 * sinh ra để bỏ.
 *
 * null nghĩa là KHÔNG hỏi: thẻ dựng không kèm accountId (ví dụ trong test của
 * riêng nó) vẫn phải chạy, chỉ là tooltip dừng ở phần số tổng.
 */
const DaySource = createContext<{ accountId: number; filter: TradeFilter } | null>(null);

/**
 * Hàm mở bảng chi tiết một ngày, cho ô lịch gọi.
 *
 * null nghĩa là KHÔNG mở được — thẻ dựng thiếu accountId hoặc thiếu timezone.
 * Ô ngày đọc chính giá trị này để biết mình có phải một cái nút bấm được hay
 * không, nên đây phải là null chứ không phải một hàm rỗng: một hàm rỗng khiến
 * ô trông bấm được, đổi con trỏ, mời người dùng bấm, rồi không làm gì cả.
 */
const OpenDay = createContext<((day: string) => void) | null>(null);

/** Trần số lệnh liệt kê trong tooltip. Dài hơn thì tooltip cao hơn cả ô lịch. */
const TOOLTIP_TRADES = 5;

/**
 * Giữ danh sách lệnh của một ngày "còn tươi" trong 5 phút.
 *
 * Radix unmount hẳn nội dung tooltip khi đóng, nên không có mốc này thì rê
 * chuột qua lại một ô mười lần là mười request cho cùng một ngày. Năm phút là
 * dài so với một phiên rê chuột, và ngắn so với nhịp người ta thêm lệnh mới —
 * mà sửa lệnh thì `useRefresh` đã invalidate cả nhánh `tradesAll`, quét luôn
 * cache này, nên số cũ không sống sót qua một lần chỉnh sửa.
 */
const DAY_TRADES_STALE_MS = 5 * 60 * 1000;

/**
 * Lịch P&L của MỘT tháng: lưới tuần x thứ, mỗi ô là một ngày.
 *
 * Khác HeatmapChart cũ (lưới GitHub 11px cho cả dải): ô ở đây đủ lớn để mang
 * con số, nên nó trả lời được "ngày 16 lỗ bao nhiêu" chứ không chỉ "tháng này
 * nhiều ngày đỏ". Đổi lại chỉ xem được một tháng một lúc — nên có nút lật.
 *
 * Tháng đang xem là state CỦA RIÊNG component, không đẩy lên URL: bộ lọc trên
 * URL áp cho MỌI biểu đồ của trang, còn việc đang mở tháng nào chỉ là chuyện
 * của cái lịch này. Đẩy nó lên URL sẽ khiến lật tháng ở đây lọc lại toàn bộ
 * dashboard — không ai muốn thế.
 *
 * Chữ ký thị giác là THANH CƯỜNG ĐỘ bên trái mỗi ô (.cal-bar): cao thấp theo
 * độ lớn, màu theo dấu. Xem lý do ở styles/index.css.
 */
export function MonthCalendarCard({
  months,
  currency,
  accountId,
  filter,
  timezone,
}: {
  months: HeatmapMonth[];
  currency: string;
  /** Bỏ trống thì tooltip chỉ hiện số tổng, và ô ngày không mở bảng chi tiết. */
  accountId?: number;
  filter?: TradeFilter;
  /**
   * IANA, để in giờ vào lệnh trong bảng chi tiết ngày.
   *
   * KHÔNG có mặc định "UTC". lib/datetime.ts bắt mọi hàm nhận `tz` tường minh
   * đúng để quên là lỗi biên dịch chứ không phải một giờ sai lặng lẽ; một mặc
   * định ở đây sẽ dựng lại y nguyên cái bẫy đó cao hơn một tầng — người dùng
   * +7 thấy lệnh 21:30 hiện thành 14:30 mà không có gì báo.
   *
   * Thiếu nó thì ô ngày thôi mở bảng chi tiết, giống hệt khi thiếu accountId.
   */
  timezone?: string;
}) {
  const { locale, t } = useI18n();
  // useMemo chứ không gọi thẳng: listMonths trả mảng MỚI mỗi lần dựng, nên
  // `available` làm dependency của useEffect bên dưới sẽ không bao giờ so
  // bằng — effect chạy lại sau mọi lần render.
  const available = useMemo(() => listMonths(months), [months]);
  const [chosen, setChosen] = useState<string | null>(null);
  // Ngày đang mở bảng chi tiết. null = đóng.
  const [opened, setOpened] = useState<string | null>(null);

  // useMemo: giá trị context là object, dựng mới mỗi render sẽ bắt mọi ô ngày
  // render lại theo — 31 ô cho một thay đổi không liên quan.
  const source = useMemo(
    () =>
      accountId === undefined || filter === undefined
        ? null
        : { accountId, filter, timezone },
    [accountId, filter, timezone],
  );

  // Mở được bảng chi tiết hay không: cần cả nguồn hỏi API lẫn múi giờ để in
  // giờ vào lệnh. Một biến duy nhất cho cả hai chỗ dùng — ô ngày có bấm được
  // không, và có dựng dialog không — để chúng không bao giờ lệch nhau.
  // Giữ ở dạng OBJECT-hoặc-null chứ không phải boolean: một cờ boolean không
  // thu hẹp được kiểu của source.timezone ở chỗ dựng dialog bên dưới, và lối
  // thoát duy nhất khi đó là `!` — tức tự hứa với trình biên dịch đúng cái
  // điều kiện này, ở một chỗ cách nó bốn chục dòng.
  const openable =
    source !== null && source.timezone !== undefined
      ? { accountId: source.accountId, filter: source.filter, timezone: source.timezone }
      : null;

  // Bộ lọc đổi thì danh sách tháng đổi, và tháng đang xem có thể không còn.
  // Không có nhánh này thì lưới rỗng trơ ra mà không có gì giải thích.
  useEffect(() => {
    if (chosen !== null && !available.includes(chosen)) setChosen(null);
  }, [available, chosen]);

  if (available.length === 0) {
    // KHÔNG dùng `empty` của BareCard: nó in "chưa có lệnh nào trong nhóm
    // này" — câu dành cho một nhóm pivot rỗng, không phải cho một cái lịch.
    // Ở đây người dùng cần biết phải làm gì tiếp: nới bộ lọc ra.
    return (
      <BareCard title={t("dashboard.pnlCalendar")} empty={false}>
        <p className="text-sm text-muted-foreground">{t("dashboard.noCalendarMonth")}</p>
      </BareCard>
    );
  }

  // null nghĩa là "chưa chọn gì" — mở ở tháng gần nhất có dữ liệu.
  const current = chosen !== null && available.includes(chosen) ? chosen : available.at(-1)!;
  const at = available.indexOf(current);
  const month = months.find((x) => x.month === current)!;
  const grid = prepareMonthGrid(month);

  const weekdayLabel = locale === "en" ? WEEKDAY_KEY.map((k) => k.toUpperCase()) : WEEKDAY_VI;
  const realDay = grid.weeks.flatMap((w) => w.day).filter((o) => o.day !== null && o.count > 0);

  return (
    <BareCard title={t("dashboard.pnlCalendar")} empty={false}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("dashboard.prevMonth")}
              disabled={at <= 0}
              onClick={() => setChosen(available[at - 1])}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <span className="num text-lg font-semibold tabular-nums">{current}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("dashboard.nextMonth")}
              disabled={at >= available.length - 1}
              onClick={() => setChosen(available[at + 1])}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>

        {/* Hai con số kết luận, đặt cạnh nhau ở đầu khối: đọc trước khi soi
            vào từng ngày. Không đóng khung tile — theme phẳng, thêm khung là
            thêm một tầng viền không mang thông tin gì. */}
        <div className="flex items-end gap-6">
          <figure className="flex flex-col gap-0.5">
            <figcaption className="eyebrow">{t("dashboard.monthNet")}</figcaption>
            <span
              data-testid="cal-month-net"
              className={`num text-xl font-semibold ${textClassBySign(grid.totalNet)}`}
            >
              {formatMoney(grid.totalNet, currency, locale)}
            </span>
          </figure>
          <figure className="flex flex-col gap-0.5">
            <figcaption className="eyebrow">{t("dashboard.tradingDays")}</figcaption>
            <span data-testid="cal-trading-days" className="num text-xl font-semibold">
              {grid.tradingDays}
            </span>
          </figure>
        </div>
      </header>

      {/* delayDuration 120ms: đủ ngắn để cảm giác là tức thì khi người ta dừng
          chuột lại có chủ đích, đủ dài để lướt ngang qua bảy ô không bật ra
          bảy cái tooltip. Mặc định 300ms của shadcn chậm hơn mức cần cho một
          lưới dày như thế này.
          disableHoverableContent: tooltip ở đây chỉ để ĐỌC, không có gì bấm
          được bên trong, nên không cần giữ nó mở khi chuột chạy vào. */}
      <DaySource.Provider value={source}>
      {/* Không mở được thì KHÔNG cấp hàm mở: ô ngày đọc chính giá trị này để
          quyết định mình có phải một cái nút bấm được hay không. Cấp hàm rồi
          chặn ở nơi dựng dialog sẽ cho ra một ô đổi con trỏ, có aria-label mời
          bấm, mà bấm xong không có gì xảy ra. */}
      <OpenDay.Provider value={openable !== null ? setOpened : null}>
      <TooltipProvider delayDuration={120} skipDelayDuration={300} disableHoverableContent>
      <div className="scroll-hairline overflow-x-auto">
        <div className="grid min-w-[36rem] grid-cols-[repeat(7,minmax(0,1fr))_auto] gap-1">
          {weekdayLabel.map((d) => (
            <span key={d} className="eyebrow px-1 pb-1 text-center">
              {d}
            </span>
          ))}
          {/* Cột kết quả nằm CUỐI hàng, không phải đầu: net tuần là kết luận
              của bảy ô bên trái, đọc nó sau khi đã lướt qua chúng. */}
          <span className="eyebrow px-1 pb-1 text-right">{t("dashboard.weekNet")}</span>

          {/* Khoá là ngày thật đầu tiên của hàng, không phải w.index: index
              là vị trí trong mảng ĐÃ lọc, nên nó đổi nghĩa khi số hàng đổi. */}
          {grid.weeks
            .filter((w) => w.day.some((o) => o.inMonth))
            .map((w) => (
              <WeekLine
                key={w.day.find((o) => o.day !== null)?.day ?? w.index}
                week={w}
                currency={currency}
              />
            ))}
        </div>
      </div>
      </TooltipProvider>
      </OpenDay.Provider>
      </DaySource.Provider>

      {/* Chỉ dựng khi có ĐỦ nguồn lẫn múi giờ: thiếu accountId thì không hỏi
          được lệnh nào, thiếu timezone thì in ra giờ sai. Cả hai đều tệ hơn
          một ô không bấm được. */}
      {openable !== null && (
        <DayTradesDialog
          day={opened}
          accountId={openable.accountId}
          filter={openable.filter}
          currency={currency}
          timezone={openable.timezone}
          onClose={() => setOpened(null)}
        />
      )}

      <table className="sr-only">
        <caption>{`${t("dashboard.pnlCalendar")} ${current}`}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.day")}</th>
            <th scope="col">{t("dashboard.net")}</th>
            <th scope="col">{t("dashboard.tradeCount")}</th>
          </tr>
        </thead>
        <tbody>
          {realDay.map((o) => (
            <tr key={o.day}>
              <th scope="row">{o.day}</th>
              <td>{formatMoney(o.net ?? "0", currency, locale)}</td>
              <td>{o.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </BareCard>
  );
}


function WeekLine({
  week,
  currency,
}: {
  week: { index: number; day: DayCell[]; net: string };
  currency: string;
}) {
  const { locale, t } = useI18n();
  return (
    <>
      {week.day.map((o, i) => (
        <DayBox key={o.day ?? `pad-${week.index}-${i}`} cell={o} col={i} currency={currency} />
      ))}
      <div className="flex flex-col items-end justify-center gap-0.5 self-stretch pl-3">
        <span className="eyebrow">{t("dashboard.weekShort", { n: week.index })}</span>
        <span
          data-testid={`cal-week-net-${week.index}`}
          className={`num text-xs font-semibold ${textClassBySign(week.net)}`}
        >
          {formatMoney(week.net, currency, locale)}
        </span>
      </div>
    </>
  );
}

function DayBox({ cell, col, currency }: { cell: DayCell; col: number; currency: string }) {
  const { locale, t } = useI18n();
  const openDay = useContext(OpenDay);

  // Ô đệm đầu/cuối lưới: giữ chỗ trong grid nhưng không vẽ gì. Vẽ viền cho
  // chúng sẽ làm tháng trông như tràn sang tháng khác.
  if (!cell.inMonth || cell.day === null) return <div aria-hidden="true" />;

  const trading = cell.kind === "lai" || cell.kind === "lo";
  const bar = cell.kind === "lai" ? "bg-[var(--chart-profit)]" : "bg-[var(--chart-loss)]";
  // Bấm được khi ngày CÓ lệnh và thẻ thật sự mở được bảng chi tiết. Ngày nghỉ
  // thì bảng chi tiết của nó là một bảng rỗng, còn thiếu nguồn/múi giờ thì
  // không có bảng nào để mở.
  const hasTrades = cell.count > 0;
  const clickable = hasTrades && openDay !== null;
  const day = cell.day;

  const box = (
    <button
      type="button"
      data-testid={`cal-day-${cell.day}`}
      data-kind={cell.kind}
      // Ngày nghỉ vẫn là <button> để Radix mở được tooltip khi focus bàn phím
      // ("Ngày nghỉ — không vào lệnh nào" là câu trả lời hợp lệ), nhưng
      // disabled thì nó rơi khỏi thứ tự tab và không nhận focus. Vì thế dùng
      // aria-disabled + chặn ở handler: ô vẫn tới được bằng Tab, chỉ là bấm
      // không ra gì — đúng như trông thấy.
      aria-disabled={!clickable}
      aria-label={
        clickable ? t("dashboard.openDayTrades", { n: cell.count, day: cell.day }) : undefined
      }
      onClick={clickable ? () => openDay(day) : undefined}
      className={`relative flex min-h-20 flex-col justify-between overflow-hidden rounded-md border py-1.5 pl-3.5 pr-1.5 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
        clickable
          ? // cursor-pointer chỉ ở ô THẬT SỰ bấm được. Trước đây mọi ô đều có,
            // kể cả ngày nghỉ — con trỏ hứa một cú bấm mà không ô nào giữ lời.
            "cursor-pointer border-border bg-card hover:border-[var(--border-strong)]"
          : hasTrades
            ? // Có lệnh nhưng thẻ không mở được bảng: vẫn là một ngày giao
              // dịch, giữ nguyên nền và viền của nó, chỉ bỏ phần mời bấm.
              "cursor-default border-border bg-card"
            : // Ngày KHÔNG giao dịch vẫn là một ngày: nó phải có mặt trong
              // lưới, chỉ là lùi lại một bậc. Để trắng trơn thì lưới thủng lỗ
              // chỗ và mắt đọc ra thành ô lỗi thay vì ngày nghỉ.
              "cursor-default border-[var(--border-muted)] bg-[var(--surface-sunken)]"
      }`}
    >
      {/* Rãnh chỉ vẽ cho ngày CÓ lãi/lỗ: ngày nghỉ không có thanh nào để so,
          nên một cái rãnh rỗng ở đó chỉ là gạch trang trí. */}
      {cell.step > 0 && <span className="cal-track" aria-hidden="true" />}

      {/* Ngày HOÀ có rãnh đầy, không có thanh: có vào lệnh (nên khác ngày
          nghỉ) mà độ lớn bằng không (nên không có cột nào). Thiếu dấu này thì
          số 0 đứng trơ trong ô trắng, đọc ra thành lỗi hiển thị chứ không
          phải một kết quả. */}
      {cell.kind === "hoa" && <span className="cal-track" aria-hidden="true" />}
      {cell.step > 0 && (
        <span
          className={`cal-bar ${bar}`}
          style={
            {
              "--cal-bar-step": cell.step,
              "--cal-bar-delay": `${col * 8}ms`,
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
      )}

      <span className={`num text-[10px] ${trading ? "text-muted-foreground" : "text-disabled"}`}>
        {cell.day.slice(8).replace(/^0/, "")}
      </span>

      {hasTrades && (
        // Số tiền TRƯỚC, số lệnh SAU và nhỏ hơn: người ta liếc cái lịch để tìm
        // ngày lãi và ngày lỗ, không phải để tìm ngày bận. Đảo thứ tự hai dòng
        // này sẽ khiến mắt đọc trúng con số ít quan trọng hơn trước.
        <span className="flex flex-col gap-px">
          <span className={`num text-xs font-semibold leading-tight ${textClassBySign(cell.net ?? "0")}`}>
            {formatMoney(cell.net ?? "0", undefined, locale)}
          </span>
          <span data-testid={`cal-day-count-${cell.day}`} className="num text-[10px] leading-tight text-muted-foreground">
            {t("dashboard.tradeCountOnDay", { n: cell.count })}
          </span>
        </span>
      )}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{box}</TooltipTrigger>
      {/* Bung XUỐNG, không lên. Ngay phía trên hàng đầu của lưới là hai con số
          tổng của thẻ ("P&L tháng này", "Ngày giao dịch") — bung lên là che
          mất chúng. collisionPadding không cứu được: nó chỉ tính va chạm với
          mép viewport, mà cái bị che nằm giữa trang.
          Xuống dưới thì thứ bị che là hàng lịch kế tiếp — vẫn còn đó khi bỏ
          chuột ra, và người đang hover thì đang đọc ngày này, không đọc hàng
          dưới. */}
      <TooltipContent side="bottom" align="center" collisionPadding={16} className="p-0">
        <DayDetail cell={cell} currency={currency} />
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Nội dung tooltip của một ngày.
 *
 * Ô trên lưới chỉ chứa được ngày và một con số rút gọn (không ký hiệu tiền, cắt
 * bớt chữ số) — vừa đủ để LƯỚT. Khối này là chỗ nói đủ: ngày có thứ, số tiền
 * đầy đủ kèm đơn vị, số lệnh, và vị trí của ngày đó trong tháng.
 *
 * Hạng là thứ ô vuông không bao giờ nói được. Thanh cường độ cho biết "ngày này
 * to", nhưng "to thứ mấy trong 23 ngày" thì phải thành chữ — và đó chính là câu
 * người ta hover để hỏi.
 */
function DayDetail({ cell, currency }: { cell: DayCell; currency: string }) {
  const { locale, t } = useI18n();
  if (cell.day === null) return null;

  return (
    <div className="flex min-w-44 flex-col gap-2 p-3">
      <p className="text-xs font-semibold">{formatDateWithWeekday(cell.day, locale)}</p>

      {cell.count === 0 ? (
        <p className="text-xs text-muted-foreground">{t("dashboard.restDay")}</p>
      ) : (
        <>
          <dl className="flex flex-col gap-1">
            <Row label={t("dashboard.net")}>
              <span className={`num text-xs font-semibold ${textClassBySign(cell.net ?? "0")}`}>
                {formatMoney(cell.net ?? "0", currency, locale)}
              </span>
            </Row>
            <Row label={t("dashboard.tradeCount")}>
              <span className="num text-xs">{cell.count}</span>
            </Row>
          </dl>

          <DayTradeList day={cell.day} count={cell.count} currency={currency} />

          {cell.kind === "hoa" ? (
            <p className="text-[11px] text-muted-foreground">{t("dashboard.breakevenDay")}</p>
          ) : (
            // Nhắc lại thang đo bằng chính năm ô vuông của thanh cường độ: mắt
            // vừa nhìn thanh bên trái ô, giờ thấy lại đúng bậc đó thành chữ.
            <div className="flex items-center gap-2 border-t border-[var(--border-muted)] pt-2">
              <span className="flex gap-0.5" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-1 rounded-[1px] ${
                      i <= cell.step
                        ? cell.kind === "lai"
                          ? "bg-[var(--chart-profit)]"
                          : "bg-[var(--chart-loss)]"
                        : "bg-[var(--border-muted)]"
                    }`}
                  />
                ))}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {cell.rank === 1
                  ? t("dashboard.biggestOfMonth")
                  : t("dashboard.rankOfMonth", { n: cell.rank, total: cell.rankOf })}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="eyebrow">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}


/**
 * Từng lệnh của một ngày, hỏi lúc tooltip mở.
 *
 * Vì sao phải gọi thêm API: `/charts` chỉ trả `{day, sum_net, count}` cho mỗi
 * ngày — đủ vẽ lịch, không đủ nói "5 lệnh đó là những lệnh nào". Câu hỏi sau
 * mới là câu người ta hover để hỏi khi thấy một ngày lỗ -1.210.
 *
 * `from=to=day` khớp CHÍNH XÁC tập lệnh mà ô lịch đã đếm, và đó không phải sự
 * may mắn: backend so sánh chuỗi trên `Enriched.Day` (service/trade_filter.go),
 * mà `Day` cũng chính là khoá backend gom heatmap. Cùng một trường, cùng một
 * phép so sánh, nên không có bẫy biên múi giờ ở đây — thứ mà một bộ lọc theo
 * `entered_at` dạng thời điểm chắc chắn sẽ dính.
 *
 * Bộ lọc của trang GIỮ NGUYÊN, chỉ ghi đè from/to. Đang lọc `symbol=XAUUSD`
 * thì ô lịch chỉ đếm lệnh XAUUSD; bỏ bộ lọc đi khi hỏi chi tiết sẽ cho ra một
 * danh sách dài hơn con số ngay phía trên nó — hai con số cãi nhau trong cùng
 * một cái tooltip.
 */
function DayTradeList(props: { day: string; count: number; currency: string }) {
  const source = useContext(DaySource);
  // Chốt chặn ở ĐÂY, trước khi có hook nào của TanStack chạy.
  //
  // useQuery gọi useQueryClient vô điều kiện, kể cả với `enabled: false` —
  // nên đặt nhánh này bên trong DayTradeInner sẽ bắt mọi nơi dựng thẻ phải có
  // QueryClientProvider, chỉ để phục vụ một query không bao giờ chạy. Tách vỏ
  // ra thì thẻ không kèm accountId vẫn dựng được ở bất cứ đâu.
  if (source === null) return null;
  return <DayTradeInner {...props} source={source} />;
}

function DayTradeInner({
  day,
  count,
  currency,
  source,
}: {
  day: string;
  count: number;
  currency: string;
  source: { accountId: number; filter: TradeFilter };
}) {
  const { locale, t } = useI18n();

  const filter = useMemo(() => ({ ...source.filter, from: day, to: day }), [source, day]);

  // KHÔNG cần cờ "đã mở chưa": Radix chỉ mount TooltipContent — và cùng với
  // nó là component này — khi tooltip thật sự mở, nên chỉ ngày được hover mới
  // sinh request. Đã đo: dựng lịch mà không hover cho ra 0 request.
  //
  // Cái Radix KHÔNG lo hộ là chiều ngược lại: đóng tooltip là unmount hẳn, nên
  // hover lại lần hai sẽ hỏi lại từ đầu. staleTime chặn đúng chỗ đó.
  const q = useTrades(source.accountId, filter, 1, TOOLTIP_TRADES, DAY_TRADES_STALE_MS);

  if (q.isError) {
    return <p className="text-[11px] text-[var(--status-error)]">{t("dashboard.dayTradesFailed")}</p>;
  }

  // Chưa có dữ liệu — kể cả lúc đang refetch nền — thì dựng đúng số dòng mà
  // ô lịch đã hứa. Chiều cao tooltip không nhảy khi dữ liệu về, và khung chờ
  // nói luôn "sắp có bấy nhiêu dòng".
  if (!q.data) {
    return (
      <ul
        className="flex flex-col gap-1 border-t border-[var(--border-muted)] pt-2"
        aria-busy="true"
      >
        {Array.from({ length: Math.min(count, TOOLTIP_TRADES) }, (_, i) => (
          // Skeleton dùng chung (bg-accent) chứ không tự chế màu: --border-muted
          // ở theme tối sát nền card tới mức khung chờ gần như vô hình — nhìn ra
          // thành tooltip bị cụt, không phải tooltip đang tải.
          <li key={i}>
            <Skeleton className="h-3.5 rounded-sm" />
          </li>
        ))}
      </ul>
    );
  }

  const items = q.data.items;
  // `total` của backend là số lệnh thật khớp bộ lọc; `count` của ô lịch cũng
  // vậy. Dùng total để không nói "còn 2 lệnh nữa" dựa trên một con số khác.
  const more = q.data.total - items.length;

  return (
    <ul className="flex flex-col gap-0.5 border-t border-[var(--border-muted)] pt-2">
      {items.map((x) => (
        <li key={x.id} className="flex items-baseline gap-2">
          <span className="truncate text-[11px] font-medium">{x.symbol}</span>
          <span className="num shrink-0 rounded-sm border border-[var(--border-input)] px-1 text-[9px] uppercase text-muted-foreground">
            {x.direction}
          </span>
          <span className={`num ml-auto shrink-0 text-[11px] font-semibold ${textClassBySign(x.net)}`}>
            {formatMoney(x.net, currency, locale)}
          </span>
        </li>
      ))}
      {more > 0 && (
        <li className="pt-0.5 text-[10px] text-muted-foreground">
          {t("dashboard.andNMoreTrades", { n: more })}
        </li>
      )}
    </ul>
  );
}
