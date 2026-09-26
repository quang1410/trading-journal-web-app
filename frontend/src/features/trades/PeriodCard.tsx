import { useState, type ReactNode } from "react";
import { ChevronRightIcon, NotebookPenIcon, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/MoneyText";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";
import { formatMoney, formatPercent, formatRatio } from "@/lib/decimal";
import { formatDuration } from "@/lib/format";
import { colorBySign, textClassBySign } from "@/features/dashboard/palette";
import { isEmptyNote, noteToOneLine } from "@/lib/richText";
import { cn } from "@/lib/utils";
import { useSavePeriodNote } from "./periodHooks";
import { PeriodNoteDialog } from "./PeriodNoteDialog";
import { PeriodRange } from "./PeriodRange";
import { PeriodSparkline } from "./PeriodSparkline";
import type { PeriodKind, PeriodNote, PeriodStat } from "./periodTypes";

/**
 * Một kỳ — một ngày hoặc một tuần — trên tab Ngày/Tuần.
 *
 * GẬP LẠI theo mặc định. Mở sẵn mọi thẻ thì mười ngày là mười màn hình cuộn và
 * không so sánh được hai ngày cách nhau một tuần. Tầng đầu mang đúng ba thứ
 * người ta cuộn để tìm: kỳ nào, lãi lỗ bao nhiêu, mấy lệnh.
 *
 * Trạng thái gập KHÔNG lưu vào URL: nó là thói quen đọc trong một phiên, không
 * phải nội dung của trang — nhồi mười khoá mở/đóng vào query string làm link
 * dài ra mà người nhận không quan tâm.
 */
export function PeriodCard({
  accountId,
  stat,
  note,
  period,
  intensity,
  currency,
  label,
}: {
  accountId: number;
  stat: PeriodStat;
  note: PeriodNote | undefined;
  period: PeriodKind;
  /** 0..1 — độ lớn của kỳ này so với kỳ mạnh nhất đang hiện. */
  intensity: number;
  currency: string;
  /** Nhãn kỳ đã format theo locale, ví dụ "21/09/2026" hay "21/09 – 27/09". */
  label: string;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Mutation sống ở THẺ, không ở hộp soạn: lưu lạc quan nên hộp đóng ngay, và
  // lỗi mạng đến khi hộp đã unmount — chỉ thẻ còn đó để hiện Alert (QĐ-10).
  const save = useSavePeriodNote(accountId, period);
  const saveNote = (bodyHtml: string) => save.mutate({ key: stat.key, bodyHtml });
  const failedDelete = save.variables !== undefined && isEmptyNote(save.variables.bodyHtml);

  const net = stat.kpi.net_profit;

  return (
    <article className="relative overflow-hidden rounded-md border border-border bg-surface-base">
      {/*
        Dải màu mép trái: cuộn nhanh qua ba tháng là đọc được nhịp lời/lỗ mà
        không đọc một chữ số nào.

        Nó KHÔNG phải kênh thông tin duy nhất — con số net đứng ngay cạnh, cùng
        màu và cùng dấu — nên người không phân biệt được teal với đỏ vẫn đọc
        được thẻ. aria-hidden vì nó không thêm gì cho người dùng trình đọc.
      */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          // colorBySign, không phải một phép so chuỗi tự chế: nó đã có ba
          // nhánh đúng (lãi / lỗ / HOÀ) và đã được test. "0.00" là hoà, và
          // một hàm viết vội ở đây rất dễ đọc nó thành lãi.
          background: `color-mix(in srgb, ${colorBySign(net)} ${25 + intensity * 75}%, transparent)`,
        }}
      />

      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3 pl-4 pr-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? t("periods.collapse") : t("periods.expand")}
          className="flex flex-1 cursor-pointer items-start gap-2 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          {/*
            HAI tầng, không phải một hàng chạy dài. Bản trước xếp ngày, tiền và
            số lệnh cùng một cỡ chữ trên một dòng, nên mắt phải đọc hết cả dòng
            mới biết kỳ này lãi hay lỗ — đúng thứ người ta cuộn để tìm.

            Giờ ngày là nhãn nhỏ ở trên, con số net chiếm cỡ chữ lớn nhất của
            thẻ. Cuộn qua hai mươi thẻ là đọc được hai mươi con số mà không đọc
            một chữ nào khác.
          */}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="flex flex-wrap items-baseline gap-x-2">
              {/*
                whitespace-nowrap trên CẢ hai: ở bề ngang điện thoại, "308,85
                US$" bị ngắt giữa số và đơn vị, và "12 lệnh" rơi xuống dòng
                riêng — con số quan trọng nhất của thẻ vỡ làm đôi.
              */}
              <span
                className={cn(
                  "whitespace-nowrap text-2xl font-semibold tracking-tight",
                  textClassBySign(net),
                )}
              >
                <MoneyText value={net} currency={currency} />
              </span>
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {t("periods.tradeCount", { n: String(stat.kpi.total_trades) })}
              </span>
            </span>
          </span>
        </button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-0.5"
          onClick={() => setEditing(true)}
        >
          <NotebookPenIcon aria-hidden />
          {note ? t("periods.editNote") : t("periods.addNote")}
        </Button>
      </header>

      {/*
        Alert ở ngoài phần gập: lỗi lưu phải thấy được cả khi thẻ đang đóng,
        vì bản lạc quan đã bị hoàn lại và người dùng cần biết vì sao.
      */}
      {save.error != null && (
        <div className="px-4 pb-3">
          <Alert variant="destructive">
            <AlertDescription>
              {t(failedDelete ? "periods.deleteError" : "periods.saveError", {
                reason: errorMessage(save.error, locale, t),
              })}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          {/*
            Một điểm không vẽ thành đường. Giữ cột trái trống khi đó là để lại
            một mảng rỗng bằng nửa thẻ — kỳ một lệnh trông như thẻ hỏng. Bỏ hẳn
            cột, cho ô KPI chiếm trọn bề ngang.
          */}
          <div
            className={cn(
              "grid gap-4",
              stat.points.length >= 2 && "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] sm:items-center",
            )}
          >
            {stat.points.length >= 2 && <PeriodSparkline points={stat.points} netProfit={net} />}

            {/*
              Ô CHÌM, và chia HAI BẬC. Bản trước đổ mười hai cặp nhãn/số vào một
              lưới 3×4 đều tăm tắp: mọi con số cùng cỡ chữ, cùng màu, nên không
              có con nào nổi lên và mắt phải đọc tuần tự cả mười hai.

              Bậc trên là ba con số trả lời "kỳ này tốt không" — thắng/thua,
              tỷ lệ thắng, profit factor. Bậc dưới là phần tra cứu, chữ nhỏ
              hơn, cho lúc đã quyết định đọc kỹ kỳ này.
            */}
            <div className="flex flex-col gap-3 rounded-md bg-surface-sunken px-4 py-3">
              <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3 min-[420px]:gap-4">
                <Stat label={t("periods.winners")} size="lg">
                  <span className="num">
                    {stat.kpi.win_count} / {stat.kpi.loss_count}
                  </span>
                </Stat>
                <Stat label={t("periods.winRate")} size="lg">
                  <span className="num">
                    {stat.kpi.win_pct === null
                      ? t("common.noValue")
                      : formatPercent(stat.kpi.win_pct, 2, locale)}
                  </span>
                </Stat>
                <Stat label={t("periods.profitFactor")} size="lg">
                  <span className="num">
                    {stat.kpi.profit_factor === null
                      ? t("common.noValue")
                      : formatRatio(stat.kpi.profit_factor, 2, locale)}
                  </span>
                </Stat>
              </dl>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border-muted pt-3 sm:grid-cols-3">
                <Stat label={t("periods.grossProfit")}>
                  <MoneyText value={stat.kpi.total_win} currency={currency} />
                </Stat>
                <Stat label={t("periods.grossLoss")}>
                  <MoneyText value={stat.kpi.total_loss} currency={currency} />
                </Stat>
                <Stat label={t("periods.fees")}>
                  <MoneyText value={stat.kpi.total_fees} currency={currency} />
                </Stat>
                {/*
                  Volume KHÔNG đi qua MoneyText: nó là khối lượng (lot), không
                  phải tiền, nên gắn ký hiệu tiền tệ vào sẽ đọc thành một số đô
                  la. formatMoney với currency = undefined chỉ làm việc tách
                  nhóm chữ số, giống cột Volume của bảng lệnh.
                */}
                <Stat label={t("periods.volume")}>
                  <span className="num">{formatMoney(stat.volume, undefined, locale)}</span>
                </Stat>
                {/*
                  Bốn ô còn lại dùng nhãn "kpi.*" của dải KPI dashboard thay vì
                  đặt "periods.*" song song: cùng một đại lượng phải mang cùng
                  một tên ở mọi màn hình, nếu không người dùng học hai từ vựng
                  cho một khái niệm.

                  Chúng có thể null — kỳ chưa có lệnh thua thì không có "lỗ
                  trung bình". Hiện dấu "chưa có" chứ không phải 0: 0 là một
                  con số khẳng định, còn ở đây ta không biết.
                */}
                <Stat label={t("kpi.aveWin")}>
                  <MoneyOrDash value={stat.kpi.ave_win} currency={currency} dash={t("common.noValue")} />
                </Stat>
                <Stat label={t("kpi.aveLoss")}>
                  <MoneyOrDash value={stat.kpi.ave_loss} currency={currency} dash={t("common.noValue")} />
                </Stat>
                <Stat label={t("kpi.expectancy")}>
                  <MoneyOrDash value={stat.kpi.expectancy} currency={currency} dash={t("common.noValue")} />
                </Stat>
                {/*
                  Sụt giảm ĐO TRONG KỲ, không phải lát cắt của đường equity toàn
                  cục — xem aggregate.periodKPI. Luôn là số không âm nên không
                  cần MoneyOrDash: kỳ không tụt đồng nào thì nó bằng 0, và 0 ở
                  đây là một khẳng định đúng, không phải "chưa biết".
                */}
                <Stat label={t("kpi.maxDrawdown")}>
                  <MoneyText value={stat.kpi.max_drawdown} currency={currency} />
                </Stat>
                <Stat label={t("kpi.avgHold")}>
                  <span className="num">
                    {stat.kpi.avg_hold_seconds === null
                      ? t("common.noValue")
                      : formatDuration(stat.kpi.avg_hold_seconds, locale)}
                  </span>
                </Stat>
              </dl>
            </div>
          </div>

          {/*
            Dải biên độ chỉ dựng khi có CẢ HAI đầu mút: một kỳ toàn lệnh thắng
            không có "lỗ sâu nhất", và vẽ dải thiếu một đầu là vẽ một khoảng
            không tồn tại.
          */}
          {stat.kpi.biggest_loser !== null && stat.kpi.biggest_winner !== null && (
            <PeriodRange
              biggestLoser={stat.kpi.biggest_loser}
              biggestWinner={stat.kpi.biggest_winner}
              aveWin={stat.kpi.ave_win}
              currency={currency}
            />
          )}

          {/*
            Ghi chú chỉ xuất hiện khi CÓ nội dung: một ô rỗng trên mỗi thẻ là
            một ô rỗng giả vờ là dữ liệu.

            Một dòng rút gọn chứ không phải HTML đầy đủ: thẻ là nơi LƯỚT, và
            nội dung đầy đủ nằm sau nút "Sửa ghi chú" cách đó một cú bấm.
          */}
          {note && (
            <div className="flex items-start gap-2 border-t border-border pt-3">
              <p className="line-clamp-2 min-w-0 flex-1 text-sm text-muted-foreground">
                {/*
                  Text thuần, KHÔNG dangerouslySetInnerHTML: đây là dòng xem
                  lướt, không phải chỗ đọc ghi chú — cùng lựa chọn với thùng rác
                  và bảng quản lý mẫu.

                  line-clamp-2 chứ không truncate: thẻ rộng hơn một ô bảng nên
                  hai dòng vẫn gọn, và thiếu nó thì một ghi chú dài đẩy thẻ cao
                  lên gấp mấy lần, phá đúng cái nhịp mà danh sách thẻ tạo ra.
                */}
                {noteToOneLine(note.body_html)}
              </p>
              {/*
                Xoá nằm cạnh nội dung nó xoá, và hỏi lại trước khi làm: ghi chú
                là chữ người dùng tự viết, không có thùng rác nào để lấy lại.
              */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2Icon aria-hidden />
                {t("periods.deleteNote")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/*
        Dựng hộp CHỈ khi mở: PeriodNoteDialog khởi tạo nội dung soạn thảo từ
        prop đúng một lần, nên gắn nó thường trú sẽ khiến ghi chú vừa lưu không
        xuất hiện ở lần mở sau.
      */}
      {editing && (
        <PeriodNoteDialog
          period={period}
          periodKey={stat.key}
          title={label}
          initialHtml={note?.body_html ?? ""}
          open
          onOpenChange={setEditing}
          onSave={saveNote}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("periods.deleteConfirmTitle", { period: label })}</AlertDialogTitle>
            <AlertDialogDescription>{t("periods.deleteConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => saveNote("")}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

/**
 * Tiền, hoặc dấu "chưa có" khi backend trả null.
 *
 * null ở đây nghĩa là KHÔNG TÍNH ĐƯỢC (kỳ chưa có lệnh thua nào thì không có
 * lỗ trung bình), khác hẳn 0. Đổ null vào formatMoney sẽ cho "NaN".
 */
function MoneyOrDash({
  value,
  currency,
  dash,
}: {
  value: string | null;
  currency: string;
  dash: string;
}) {
  if (value === null) return <span className="num">{dash}</span>;
  return <MoneyText value={value} currency={currency} />;
}

/**
 * Một ô chỉ số. `size="lg"` cho bậc trên — ba con số trả lời "kỳ này tốt
 * không"; mặc định cho bậc tra cứu bên dưới.
 *
 * Nhãn dùng .eyebrow (11px in hoa, giãn chữ) chứ không phải text-xs thường:
 * cả trang đã dạy mắt rằng "chữ nhỏ in hoa = tên trường", và thẻ kỳ không
 * phải chỗ để dạy lại một quy ước thứ hai.
 */
function Stat({
  label,
  size = "sm",
  children,
}: {
  label: string;
  size?: "sm" | "lg";
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="eyebrow">{label}</dt>
      <dd className={cn("font-medium", size === "lg" ? "text-lg" : "text-sm")}>{children}</dd>
    </div>
  );
}
