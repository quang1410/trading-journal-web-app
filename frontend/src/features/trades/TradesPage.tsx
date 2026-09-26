import { AccountGate, ErrorBlock } from "@/components/AccountGate";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage } from "@/i18n/errors";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { Suspense, lazy, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, PlusIcon } from "lucide-react";
import { Link } from "react-router";
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
import { downloadTradesCsv } from "./exportCsv";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Account } from "@/features/accounts/types";
import { FilterBar } from "@/components/FilterBar";
import { Segmented } from "@/components/ui/segmented";
import { StatsStrip } from "./StatsStrip";
import { TradeFormDialog } from "./TradeFormDialog";
import { TradeTable } from "./TradeTable";
import {
  EMPTY_FILTER,
  PAGE_SIZES,
  readPage,
  readSize,
  readView,
  writeParams,
  type TradeView,
} from "./filters";
import { useFilterParams } from "./useFilterParams";
import { useDeleteTrade, useStats, useTrades } from "./hooks";
import type { Trade } from "./types";
import { useI18n } from "@/i18n";
import { useMetaEnums } from "@/features/meta/hooks";

// Tab Ngày/Tuần là chunk riêng. PeriodList kéo theo recharts (qua
// PeriodSparkline), mà tab Lệnh — tab mặc định — không vẽ biểu đồ nào. Import
// tĩnh thì ai mở /trades cũng phải tải recharts trước khi thấy bảng lệnh, và
// chính độ trễ đó làm switchAccount.test.tsx quá hạn 1s của findByText trên CI.
const PeriodList = lazy(() =>
  import("./PeriodList").then((m) => ({ default: m.PeriodList })),
);

/**
 * Vỏ ngoài chỉ lo chuyện "có account chưa".
 *
 * Tách hẳn khỏi NhatKyLenh vì mọi hook lệnh đều cần `account.id`: gọi chúng
 * rồi mới return sớm là vi phạm quy tắc hook, còn return sớm rồi mới gọi thì
 * số lượng hook đổi giữa các lần render.
 */
export function TradesPage() {
  return <AccountGate>{(account) => <NhatKyLenh account={account} />}</AccountGate>;
}

function NhatKyLenh({ account }: { account: Account }) {
  const { t, locale } = useI18n();
  const { filter, deferredFilter, setFilter, hasFilter, sp, setSp } = useFilterParams();
  const page = readPage(sp);
  const size = readSize(sp);
  const view = readView(sp);

  /**
   * Đổi tab.
   *
   * Bỏ `page` khi rời bảng lệnh: số trang không có nghĩa ở tab kỳ, và giữ lại
   * "page=7" sẽ dội ngược về trang 7 của bảng khi người dùng quay lại — một
   * trang họ chưa bao giờ chọn trong phiên này.
   *
   * `replace` chứ không `push`: ba tab là ba cách đọc cùng một tập lệnh, không
   * phải ba trang. Đẩy vào history thì bấm Back sau khi xem qua cả ba tab phải
   * bấm ba lần mới rời khỏi trang.
   */
  function setView(next: TradeView) {
    setSp(writeParams(filter, 1, size, next), { replace: true });
  }

  // `deferredFilter` giữ lại từ thời hai ô "Mã sản phẩm" và "Setup" còn là ô
  // chữ — mỗi phím gõ khi đó là một bộ lọc mới, tức một cặp request
  // /trades + /stats bị vứt đi. Giờ cả bảy ô đều là ô chọn nên không còn
  // trạng thái gõ-dở nào, nhưng nó vẫn đáng giữ: đổi bộ lọc là render lại cả
  // bảng, và useDeferredValue cho phép React vẽ ô lọc trước rồi vẽ bảng sau,
  // thay vì khoá giao diện cho tới khi hàng cuối cùng xong.
  const { data: enums } = useMetaEnums();

  const ds = useTrades(account.id, deferredFilter, page, size);
  const kpi = useStats(account.id, deferredFilter);
  const remove = useDeleteTrade(account.id);

  const [isEditing, setDangSua] = useState<Trade | undefined>(undefined);
  const [moForm, setMoForm] = useState(false);
  const [sapXoa, setSapXoa] = useState<Trade | null>(null);
  const [dangXuat, setDangXuat] = useState(false);
  // Lỗi export giữ RIÊNG, không dùng chung ErrorBlock của bảng: hai thứ hỏng
  // vì hai lý do khác nhau và ở hai chỗ khác nhau trên màn hình. Bản trước
  // không có state này vì không có `catch` nào — bấm xong mà server trả 500
  // thì nút chỉ hết xoay, không gì khác xảy ra, và người dùng không phân biệt
  // được "hỏng" với "đang tải ngầm".
  const [loiXuat, setLoiXuat] = useState<unknown>(null);

  // Đổi bộ lọc thì về trang 1 (datFilter của useFilterParams): lọc lại mà vẫn
  // đứng ở trang 7 sẽ cho một trang trống, và người dùng đọc nó thành "không
  // có kết quả nào". Phân trang bên dưới vẫn push — quay lại trang trước là
  // thao tác người dùng thật sự mong đợi ở nút Back.

  // Số trang thành ĐƯỜNG DẪN chứ không phải hàm onClick: bộ lọc đã nằm hết
  // trên query string, nên trang kế tiếp vốn dĩ đã có URL riêng. Trả nó về
  // đúng dạng href thì copy được, mở tab mới được, và nút back của trình
  // duyệt đi đúng một bước.
  function path(p: number) {
    const sp = writeParams(filter, p, size, view);
    const q = sp.toString();
    return q === "" ? "/trades" : `/trades?${q}`;
  }

  function setPageSize(next: number) {
    setSp(writeParams(filter, 1, next, view), { replace: true });
  }

  const total = ds.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / size));

  // "CHƯA BIẾT" khác "KHÔNG CÓ", và nút xuất phải phân biệt được hai thứ đó.
  //
  // `total` rơi về 0 khi `ds.data` chưa về, mà header này vẽ TRƯỚC cổng
  // `ds.isPending` ở dưới. Không tách ra thì trong lúc request đầu còn bay,
  // nút khoá lại và tooltip khẳng định "Chưa có lệnh nào để xuất" với một tài
  // khoản đang có 128 lệnh — giao diện nói một câu sai để lấp chỗ trống.
  const knowsTotal = ds.data != null;
  const noTrades = knowsTotal && total === 0;

  return (
    <section className="flex flex-col gap-4">
      {/* Thùng rác đã dời sang sidebar: nó là một TRANG, không phải một hành
          động trên trang này. Để nó cạnh nút "Thêm lệnh" làm hai thứ khác loại
          trông như hai lựa chọn ngang nhau. */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow">{account.code}</span>
           <h1 className="text-xl font-semibold tracking-tight">{t("trades.title")}</h1>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex flex-col items-start gap-1">
            <Button
              variant="outline"
              // Tooltip nói ĐÚNG phạm vi: toàn bộ tài khoản hay chỉ phần khớp
              // bộ lọc. Cùng một nút mà xuất ra hai tập rất khác nhau, nên nó
              // phải tự khai mình đang ở tình huống nào.
              title={
                !knowsTotal
                  ? t("trades.exportTitleLoading")
                  : noTrades
                    ? t("trades.exportTitleEmpty")
                    : hasFilter
                      ? t("trades.exportTitleFiltered", { n: String(total) })
                      : t("trades.exportTitleAll", { n: String(total) })
              }
              // Không có lệnh nào thì không có gì để xuất. File chỉ có mỗi
              // dòng header là một file vô nghĩa, và để nút bấm được ở đây là
              // hứa một việc không làm được.
              disabled={dangXuat || !knowsTotal || noTrades}
              onClick={async () => {
                setDangXuat(true);
                setLoiXuat(null);
                try {
                  await downloadTradesCsv(account.id, account.code, filter);
                } catch (e) {
                  setLoiXuat(e);
                } finally {
                  setDangXuat(false);
                }
              }}
            >
              <DownloadIcon aria-hidden />
              {/*
                Chưa biết tổng thì hiện nhãn trần, KHÔNG hiện "· 0 lệnh".
                Một con số sai đọc thoải mái hơn một con số thiếu, nên nó nguy
                hiểm hơn: người dùng tin ngay mà không nghĩ lại.
              */}
              {dangXuat
                ? t("trades.exporting")
                : knowsTotal
                  ? t("trades.exportCount", { n: String(total) })
                  : t("trades.export")}
            </Button>
            {/*
              Nhắc lại phạm vi bằng CHỮ, không chỉ bằng tooltip: tooltip cần
              rê chuột, mà trên điện thoại thì không có chuột nào để rê. Đây
              cũng là chỗ hiểu nhầm tốn kém nhất của tính năng — xuất nhầm tập
              dữ liệu không báo lỗi, nó chỉ cho ra file sai.
            */}
            {hasFilter && knowsTotal && total > 0 && (
              <span className="text-xs text-muted-foreground">{t("trades.exportFiltered")}</span>
            )}
          </div>
          <Button
            onClick={() => {
              setDangSua(undefined);
              setMoForm(true);
            }}
          >
            <PlusIcon aria-hidden />
            {t("trades.add")}
          </Button>
        </div>
      </header>

      {/*
        Lỗi export nằm ngay dưới nút đã gây ra nó, không lẫn vào ErrorBlock của
        bảng ở dưới: người dùng vừa bấm ở đây thì cũng nhìn ở đây. Đặt nó cạnh
        bảng lệnh sẽ đọc thành "bảng hỏng", trong khi bảng vẫn nguyên vẹn.
      */}
      {loiXuat != null && (
        <Alert variant="destructive">
          <AlertDescription>
            {t("trades.exportError", { reason: errorMessage(loiXuat, locale, t) })}
          </AlertDescription>
        </Alert>
      )}

      {kpi.data && <StatsStrip stats={kpi.data} currency={account.currency} />}

      {/*
        Ba tab là ba CÁCH ĐỌC cùng một tập lệnh, không phải ba trang khác nhau:
        bộ lọc bên dưới áp cho cả ba, và StatsStrip ở trên cũng vậy. Vì thế nó
        đứng giữa hai thứ đó chứ không nằm cạnh nút "Thêm lệnh" trên header —
        ở đó nó sẽ trông như một hành động ngang hàng với việc tạo lệnh.

        Segmented là radiogroup thật: một nấc Tab cho cả nhóm, mũi tên đổi lựa
        chọn. Dựng một hàng nút mới là dựng lại phần trợ năng đó, kém hơn.
      */}
      <Segmented<TradeView>
        value={view}
        onChange={setView}
        options={["trades", "day", "week"] as const}
        label={t("periods.viewLabel")}
        className="w-auto self-start"
        renderOption={(v) =>
          v === "trades"
            ? t("periods.tabTrade")
            : v === "day"
              ? t("periods.tabDay")
              : t("periods.tabWeek")
        }
      />

      <FilterBar accountId={account.id} value={filter} onChange={setFilter} />

      {view === "trades" && (
        <>
        {ds.isPending && <Loading row={6} />}
        {ds.error && (
          <ErrorBlock error={ds.error} />
        )}

        {/* Màn hình rỗng là lời mời làm việc, không phải câu thông báo cụt.
            Nó cũng phân biệt hai tình huống khác hẳn nhau: chưa ghi lệnh nào bao
            giờ, và có lệnh nhưng bộ lọc đang cắt hết. */}
        {ds.data && ds.data.items.length === 0 && (
          <EmptyState
            title={hasFilter ? t("trades.noMatch") : t("trades.empty")}
            hint={hasFilter ? t("trades.noMatchHint") : t("trades.emptyHint")}
          >
            {hasFilter ? (
              <Button variant="outline" onClick={() => setFilter(EMPTY_FILTER)}>
                 {t("trades.clearFilters")}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setDangSua(undefined);
                  setMoForm(true);
                }}
              >
                <PlusIcon aria-hidden />
                 {t("trades.add")}
              </Button>
            )}
          </EmptyState>
        )}

        {ds.data && ds.data.items.length > 0 && (
          <>
            <TradeTable
              rows={ds.data.items}
              timezone={account.timezone}
              currency={account.currency}
              enums={enums}
              onEdit={(t) => {
                setDangSua(t);
                setMoForm(true);
              }}
              onRemove={(t) => setSapXoa(t)}
            />

             {/* Footer tách khỏi thân bảng bằng một bậc surface nhẹ: số liệu là
                 thông tin đọc một lần, còn hai nút là vùng thao tác lặp lại. */}
             <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5 xl:flex-row xl:items-center xl:justify-between">
               <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                 <span className="text-sm text-muted-foreground">
                   {t("trades.pageSummary", { total: total, page, pages: pageCount })}
                 </span>
                 <div className="flex items-center gap-2">
                   <label htmlFor="trade-page-size" className="cursor-pointer text-xs text-muted-foreground">
                     {t("trades.pageSize")}
                   </label>
                   <Select value={String(size)} onValueChange={(value) => setPageSize(+value)}>
                     <SelectTrigger
                       id="trade-page-size"
                       className="h-8 w-[4.5rem]"
                       aria-label={t("trades.pageSize")}
                     >
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       {Array.from(new Set([...PAGE_SIZES, size])).map((option) => (
                         <SelectItem key={option} value={String(option)}>
                           {option}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
               </div>

               <Pagination className="mx-0 w-full justify-end xl:w-auto">
                 <PaginationContent className="w-full justify-end gap-1 sm:w-auto">
                   <PaginationItem className="flex-1 sm:flex-none">
                     <PageButton label={t("trades.previousPage")} to={page > 1 ? path(page - 1) : null} />
                   </PaginationItem>
                   {pageHref(page, pageCount).map((item, index) =>
                     item === "..." ? (
                       <PaginationItem key={`ellipsis-${index}`}>
                         <PaginationEllipsis />
                       </PaginationItem>
                     ) : (
                       <PaginationItem key={item}>
                         <PaginationLink
                           asChild
                           isActive={item === page}
                           size="icon-sm"
                           aria-label={t("trades.goToPage", { page: item })}
                         >
                           <Link to={path(item)}>{item}</Link>
                         </PaginationLink>
                       </PaginationItem>
                     ),
                   )}
                   <PaginationItem className="flex-1 sm:flex-none">
                     <PageButton
                       label={t("trades.nextPage")}
                       to={page < pageCount ? path(page + 1) : null}
                       right
                     />
                   </PaginationItem>
                 </PaginationContent>
               </Pagination>
             </div>
          </>
        )}
        </>
      )}

      {view !== "trades" && (
        <Suspense fallback={<Loading />}>
          <PeriodList
            account={account}
            period={view}
            filter={deferredFilter}
            hasFilter={hasFilter}
          />
        </Suspense>
      )}

      <TradeFormDialog
        account={account}
        trade={isEditing}
        open={moForm}
        onOpenChange={(v) => {
          setMoForm(v);
          if (!v) setDangSua(undefined);
        }}
      />

      {/*
        AlertDialog chứ không phải Dialog. Đây là thao tác phá huỷ, và khác
        biệt là hành vi chứ không phải giao diện: alertdialog dồn focus vào
        nút Huỷ, nên Enter theo phản xạ ngay khi hộp bật lên sẽ huỷ chứ không
        xoá mất lệnh. Nó cũng không đóng khi bấm ra ngoài.
      */}
      <AlertDialog open={sapXoa !== null} onOpenChange={(v) => !v && setSapXoa(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
           <AlertDialogTitle>{t("trades.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {sapXoa
                 ? t("trades.deleteDescription", { stt: sapXoa.stt, symbol: sapXoa.symbol })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
           <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (sapXoa) await remove.mutateAsync(sapXoa.id);
                setSapXoa(null);
              }}
            >
               {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function pageHref(page: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const visible = new Set([1, total, page]);
  if (page <= 4) {
    for (let current = 2; current <= 5; current += 1) visible.add(current);
  } else if (page >= total - 3) {
    for (let current = total - 4; current < total; current += 1) visible.add(current);
  } else {
    visible.add(page - 1);
    visible.add(page + 1);
  }

  const numbers = [...visible].sort((a, b) => a - b);
  const result: (number | "...")[] = [];
  numbers.forEach((number, index) => {
    if (index > 0 && number - numbers[index - 1] > 1) result.push("...");
    result.push(number);
  });
  return result;
}

/**
 * Một đầu của thanh phân trang.
 *
 * `den === null` nghĩa là đã ở đầu hoặc cuối dãy. Lúc đó thẻ vẫn được dựng
 * chứ không biến mất: chỗ ngồi của nút giữ nguyên nên mắt không phải tìm
 * lại sau mỗi lần sang trang. Nhưng nó thôi là <a> — một link không có href
 * vẫn nhận được focus và vẫn bấm được, chỉ là không đi đâu cả.
 */
function PageButton({ label, to, right }: { label: string; to: string | null; right?: boolean }) {
  const arrow = right ? <ChevronRightIcon /> : <ChevronLeftIcon />;
  const displayLabel = <span className="hidden sm:inline">{label}</span>;
  const content = right ? (
    <>
      {displayLabel}
      {arrow}
    </>
  ) : (
    <>
      {arrow}
      {displayLabel}
    </>
  );

  if (to === null) {
    return (
      <PaginationLink
        asChild={false}
        size="sm"
        aria-label={label}
        aria-disabled
        tabIndex={-1}
        className="h-8 w-full cursor-not-allowed gap-1.5 border border-border bg-muted px-3 text-muted-foreground opacity-100 hover:bg-muted hover:text-muted-foreground sm:w-auto sm:min-w-28"
      >
        {content}
      </PaginationLink>
    );
  }

  return (
    <PaginationLink asChild size="sm" className="h-8 w-full gap-1.5 px-3 sm:w-auto sm:min-w-28">
      <Link to={to} aria-label={label}>
        {content}
      </Link>
    </PaginationLink>
  );
}
