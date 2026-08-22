import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDeferredValue, useMemo, useState } from "react";
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
import { useActiveAccount } from "@/features/accounts/activeAccount";
import type { Account } from "@/features/accounts/types";
import { FilterBar } from "./FilterBar";
import { StatsStrip } from "./StatsStrip";
import { TradeFormDialog } from "./TradeFormDialog";
import { TradeTable } from "./TradeTable";
import { readFilter, readPage, writeParams, type TradeFilter } from "./filters";
import { useDeleteTrade, useStats, useTrades } from "./hooks";
import type { Trade } from "./types";

/**
 * Vỏ ngoài chỉ lo chuyện "có account chưa".
 *
 * Tách hẳn khỏi NhatKyLenh vì mọi hook lệnh đều cần `account.id`: gọi chúng
 * rồi mới return sớm là vi phạm quy tắc hook, còn return sớm rồi mới gọi thì
 * số lượng hook đổi giữa các lần render.
 */
export function TradesPage() {
  const { account, isPending } = useActiveAccount();

  if (isPending) return <p role="status">Đang tải…</p>;

  if (!account) {
    return (
      <p className="text-muted-foreground">
        Chưa có tài khoản giao dịch nào.{" "}
        <Link to="/accounts" className="text-primary underline underline-offset-4">
          Tạo tài khoản giao dịch
        </Link>{" "}
        để bắt đầu ghi nhật ký.
      </p>
    );
  }

  return <NhatKyLenh account={account} />;
}

function NhatKyLenh({ account }: { account: Account }) {
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

  function datPage(p: number) {
    setSp(writeParams(filter, p));
  }

  const size = ds.data?.size ?? 50;
  const tong = ds.data?.total ?? 0;
  const soTrang = Math.max(1, Math.ceil(tong / size));

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Nhật ký lệnh</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/trades/trash"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Thùng rác
          </Link>
          <Button
            onClick={() => {
              setDangSua(undefined);
              setMoForm(true);
            }}
          >
            Thêm lệnh
          </Button>
        </div>
      </header>

      {kpi.data && <StatsStrip stats={kpi.data} currency={account.currency} />}

      <FilterBar value={filter} onChange={datFilter} />

      {ds.isPending && <p role="status">Đang tải…</p>}
      {ds.error && (
        <Alert variant="destructive">
          <AlertDescription>{ds.error.message}</AlertDescription>
        </Alert>
      )}

      {ds.data && ds.data.items.length === 0 && (
        <p className="text-muted-foreground">
          Không có lệnh nào khớp bộ lọc. Thêm lệnh đầu tiên hoặc nới bộ lọc ra.
        </p>
      )}

      {ds.data && ds.data.items.length > 0 && (
        <>
          <TradeTable
            rows={ds.data.items}
            timezone={account.timezone}
            currency={account.currency}
            onSua={(t) => {
              setDangSua(t);
              setMoForm(true);
            }}
            onXoa={(t) => setSapXoa(t)}
          />

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => datPage(page - 1)}
            >
              Trang trước
            </Button>
            <span className="text-sm text-muted-foreground">
              Trang {page} / {soTrang} · {tong} lệnh
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= soTrang}
              onClick={() => datPage(page + 1)}
            >
              Trang sau
            </Button>
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
            <AlertDialogTitle>Xoá lệnh?</AlertDialogTitle>
            <AlertDialogDescription>
              {sapXoa
                ? `Lệnh ${sapXoa.stt} · ${sapXoa.symbol}. Lệnh chuyển vào thùng rác và khôi phục lại được.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (sapXoa) await xoa.mutateAsync(sapXoa.id);
                setSapXoa(null);
              }}
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
