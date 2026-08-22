import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const filter = readFilter(sp);
  const page = readPage(sp);

  const ds = useTrades(account.id, filter, page);
  const kpi = useStats(account.id, filter);
  const xoa = useDeleteTrade(account.id);

  const [dangSua, setDangSua] = useState<Trade | undefined>(undefined);
  const [moForm, setMoForm] = useState(false);
  const [sapXoa, setSapXoa] = useState<Trade | null>(null);

  // Đổi bộ lọc thì về trang 1: lọc lại mà vẫn đứng ở trang 7 sẽ cho một
  // trang trống, và người dùng đọc nó thành "không có kết quả nào".
  function datFilter(f: TradeFilter) {
    setSp(writeParams(f, 1));
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
        <p role="alert" className="text-destructive">
          {ds.error.message}
        </p>
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

      <Dialog open={sapXoa !== null} onOpenChange={(v) => !v && setSapXoa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá lệnh?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {sapXoa
              ? `Lệnh ${sapXoa.stt} · ${sapXoa.symbol}. Lệnh chuyển vào thùng rác và khôi phục lại được.`
              : ""}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSapXoa(null)}>
              Huỷ
            </Button>
            <Button
              onClick={async () => {
                if (sapXoa) await xoa.mutateAsync(sapXoa.id);
                setSapXoa(null);
              }}
            >
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
