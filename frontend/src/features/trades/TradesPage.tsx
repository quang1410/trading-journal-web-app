import { DangTai } from "@/components/DangTai";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDeferredValue, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { useActiveAccount } from "@/features/accounts/activeAccount";
import type { Account } from "@/features/accounts/types";
import { FilterBar } from "./FilterBar";
import { StatsStrip } from "./StatsStrip";
import { TradeFormDialog } from "./TradeFormDialog";
import { TradeTable } from "./TradeTable";
import { EMPTY_FILTER, readFilter, readPage, writeParams, type TradeFilter } from "./filters";
import { useDeleteTrade, useStats, useTrades } from "./hooks";
import type { Trade } from "./types";
import { useI18n } from "@/i18n";
import { useMetaEnums } from "@/features/meta/hooks";
import { errorMessage } from "@/i18n/errors";

/**
 * Vỏ ngoài chỉ lo chuyện "có account chưa".
 *
 * Tách hẳn khỏi NhatKyLenh vì mọi hook lệnh đều cần `account.id`: gọi chúng
 * rồi mới return sớm là vi phạm quy tắc hook, còn return sớm rồi mới gọi thì
 * số lượng hook đổi giữa các lần render.
 */
export function TradesPage() {
  const { account, isPending } = useActiveAccount();
  const { t } = useI18n();

  if (isPending) return <DangTai dong={1} />;

  if (!account) {
    return (
      <p className="text-muted-foreground">
         {t("trades.noAccount")} {" "}
         <Link to="/accounts" className="text-primary underline underline-offset-4">
           {t("trades.createAccount")}
         </Link>{" "}
         {t("trades.startJournal")}
      </p>
    );
  }

  return <NhatKyLenh account={account} />;
}

function NhatKyLenh({ account }: { account: Account }) {
  const { locale, t } = useI18n();
  const [sp, setSp] = useSearchParams();
  // useMemo vì readFilter dựng object MỚI ở mỗi lần render, mà object đó là
  // đầu vào của useDeferredValue ngay bên dưới — so sánh bằng Object.is thì
  // "mới mỗi lần" nghĩa là "luôn khác", và cơ chế hoãn không bao giờ bắt kịp.
  const filter = useMemo(() => readFilter(sp), [sp]);
  const page = readPage(sp);

  // Ô "Mã sản phẩm" và "Setup" là ô chữ, nên mỗi phím gõ là một bộ lọc mới:
  // gõ "XAUUSD" bắn sáu request /trades cộng sáu request /stats, và năm cặp
  // đầu vô dụng vì người dùng còn đang gõ dở. Bản hoãn chỉ đuổi kịp khi React
  // rảnh tay, nên phần lớn ký tự giữa chừng không kịp thành request nào; còn
  // URL và chính ô nhập vẫn đổi tức thì theo `filter`.
  const filterHoan = useDeferredValue(filter);
  const { data: enums } = useMetaEnums();

  const ds = useTrades(account.id, filterHoan, page);
  const kpi = useStats(account.id, filterHoan);
  const xoa = useDeleteTrade(account.id);

  const [dangSua, setDangSua] = useState<Trade | undefined>(undefined);
  const [moForm, setMoForm] = useState(false);
  const [sapXoa, setSapXoa] = useState<Trade | null>(null);

  // Đổi bộ lọc thì về trang 1: lọc lại mà vẫn đứng ở trang 7 sẽ cho một
  // trang trống, và người dùng đọc nó thành "không có kết quả nào".
  // replace chứ không push: gõ mười ký tự vào ô mã sản phẩm mà đẩy mười mục
  // vào history thì nút Back của trình duyệt phải bấm mười lần mới rời khỏi
  // trang. Phân trang bên dưới vẫn push — quay lại trang trước là thao tác
  // người dùng thật sự mong đợi ở nút Back.
  function datFilter(f: TradeFilter) {
    setSp(writeParams(f, 1), { replace: true });
  }

  // Số trang thành ĐƯỜNG DẪN chứ không phải hàm onClick: bộ lọc đã nằm hết
  // trên query string, nên trang kế tiếp vốn dĩ đã có URL riêng. Trả nó về
  // đúng dạng href thì copy được, mở tab mới được, và nút back của trình
  // duyệt đi đúng một bước.
  function duongDan(p: number) {
    const sp = writeParams(filter, p);
    const q = sp.toString();
    return q === "" ? "/trades" : `/trades?${q}`;
  }

  const coLoc = Object.values(filter).some((v) => v !== "");
  const size = ds.data?.size ?? 50;
  const tong = ds.data?.total ?? 0;
  const soTrang = Math.max(1, Math.ceil(tong / size));

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
        <Button
          onClick={() => {
            setDangSua(undefined);
            setMoForm(true);
          }}
        >
          <PlusIcon aria-hidden />
           {t("trades.add")}
        </Button>
      </header>

      {kpi.data && <StatsStrip stats={kpi.data} currency={account.currency} />}

      <FilterBar value={filter} onChange={datFilter} />

      {ds.isPending && <DangTai dong={6} />}
      {ds.error && (
        <Alert variant="destructive">
           <AlertDescription>
             {errorMessage(ds.error, locale, t)}
           </AlertDescription>
        </Alert>
      )}

      {/* Màn hình rỗng là lời mời làm việc, không phải câu thông báo cụt.
          Nó cũng phân biệt hai tình huống khác hẳn nhau: chưa ghi lệnh nào bao
          giờ, và có lệnh nhưng bộ lọc đang cắt hết. */}
      {ds.data && ds.data.items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-14 text-center">
          <p className="font-medium">
             {coLoc ? t("trades.noMatch") : t("trades.empty")}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {coLoc
               ? t("trades.noMatchHint")
               : t("trades.emptyHint")}
          </p>
          {coLoc ? (
            <Button variant="outline" onClick={() => datFilter(EMPTY_FILTER)}>
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
        </div>
      )}

      {ds.data && ds.data.items.length > 0 && (
        <>
          <TradeTable
            rows={ds.data.items}
            timezone={account.timezone}
            currency={account.currency}
            enums={enums}
            onSua={(t) => {
              setDangSua(t);
              setMoForm(true);
            }}
            onXoa={(t) => setSapXoa(t)}
          />

          {/* Số tổng nằm bên trái, điều khiển nằm bên phải: cái thứ nhất là
              thông tin đọc một lần, cái thứ hai là chỗ tay bấm nhiều lần. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
               {t("trades.pageSummary", { total: tong, page, pages: soTrang })}
            </span>

            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                 <NutTrang nhan={t("trades.previousPage")} den={page > 1 ? duongDan(page - 1) : null} />
                </PaginationItem>
                <PaginationItem>
                  <NutTrang
                     nhan={t("trades.nextPage")}
                    den={page < soTrang ? duongDan(page + 1) : null}
                    phai
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </>
      )}

      <TradeFormDialog
        account={account}
        trade={dangSua}
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
                if (sapXoa) await xoa.mutateAsync(sapXoa.id);
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

/**
 * Một đầu của thanh phân trang.
 *
 * `den === null` nghĩa là đã ở đầu hoặc cuối dãy. Lúc đó thẻ vẫn được dựng
 * chứ không biến mất: chỗ ngồi của nút giữ nguyên nên mắt không phải tìm
 * lại sau mỗi lần sang trang. Nhưng nó thôi là <a> — một link không có href
 * vẫn nhận được focus và vẫn bấm được, chỉ là không đi đâu cả.
 */
function NutTrang({ nhan, den, phai }: { nhan: string; den: string | null; phai?: boolean }) {
  const mui = phai ? <ChevronRightIcon /> : <ChevronLeftIcon />;
  const noiDung = phai ? (
    <>
      {nhan}
      {mui}
    </>
  ) : (
    <>
      {mui}
      {nhan}
    </>
  );

  if (den === null) {
    return (
      <PaginationLink
        asChild={false}
        size="default"
        aria-disabled
        className="gap-1 px-2.5 opacity-50"
      >
        <span aria-label={nhan}>{noiDung}</span>
      </PaginationLink>
    );
  }

  return (
    <PaginationLink asChild size="default" className="gap-1 px-2.5">
      <Link to={den} aria-label={nhan}>
        {noiDung}
      </Link>
    </PaginationLink>
  );
}
