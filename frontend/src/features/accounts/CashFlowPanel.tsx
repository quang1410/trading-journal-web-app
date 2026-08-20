import { useState } from "react";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/format";
import { MoneyText } from "@/components/MoneyText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMetaEnums } from "@/features/meta/hooks";
import { useCashFlows, useCreateCashFlow, useDeleteCashFlow } from "./cashflowHooks";
import type { Account } from "./types";

// Nhãn hiển thị cho giá trị enum của backend. Giá trị ("deposit"/"withdraw")
// là hợp đồng; nhãn là chữ. Loại lạ thì hiện nguyên giá trị chứ không nuốt.
const NHAN: Record<string, string> = { deposit: "Nạp", withdraw: "Rút" };
const nhan = (v: string) => NHAN[v] ?? v;

const laSoDuong = (v: string) => /^\d*\.?\d+$/.test(v.trim()) && /[1-9]/.test(v);
const laNgay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

export function CashFlowPanel({ account }: { account: Account }) {
  const { data: enums } = useMetaEnums();
  const { data, isPending } = useCashFlows(account.id);
  const themMoi = useCreateCashFlow(account.id);
  const xoa = useDeleteCashFlow(account.id);

  const [ngay, setNgay] = useState("");
  const [soTien, setSoTien] = useState("");
  const [loai, setLoai] = useState("deposit");
  const [ghiChu, setGhiChu] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [sapXoa, setSapXoa] = useState<number | null>(null);

  const loaiHopLe = enums?.cash_flow_types ?? [];

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    setLoi(null);
    if (!laNgay(ngay)) return setLoi("ngày phải theo định dạng YYYY-MM-DD");
    if (!laSoDuong(soTien)) return setLoi("số tiền phải lớn hơn 0");
    try {
      await themMoi.mutateAsync({
        date: ngay.trim(),
        amount: soTien.trim(),
        type: loai,
        note: ghiChu.trim(),
      });
      setNgay("");
      setSoTien("");
      setGhiChu("");
    } catch (err) {
      setLoi(err instanceof ApiError ? err.msg : "không kết nối được máy chủ");
    }
  }

  const dangXoa = data?.find((cf) => cf.id === sapXoa) ?? null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Nạp / rút — {account.code}</h2>

      {isPending && <p role="status">Đang tải…</p>}

      {data && data.length === 0 && (
        <p className="text-muted-foreground">Chưa có giao dịch tiền nào cho tài khoản này.</p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Số tiền</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((cf) => (
                <TableRow key={cf.id}>
                  <TableCell className="num">{formatDateOnly(cf.date)}</TableCell>
                  <TableCell>{nhan(cf.type)}</TableCell>
                  <TableCell>
                    <MoneyText value={cf.amount} currency={account.currency} />
                  </TableCell>
                  <TableCell>{cf.note}</TableCell>
                  <TableCell>
                    {/* Chữ hiển thị ngắn, tên trợ năng đầy đủ: nhờ vậy nút
                        xoá ở hàng và nút Xoá trong hộp xác nhận không trùng
                        tên nhau khi test truy theo role. */}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Xoá giao dịch ngày ${formatDateOnly(cf.date)}`}
                      onClick={() => setSapXoa(cf.id)}
                    >
                      Xoá
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <form onSubmit={gui} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-ngay">Ngày</Label>
          <Input
            id="cf-ngay"
            value={ngay}
            onChange={(e) => setNgay(e.target.value)}
            placeholder="2026-03-01"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-tien">Số tiền</Label>
          <Input id="cf-tien" value={soTien} onChange={(e) => setSoTien(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-loai">Loại</Label>
          <select
            id="cf-loai"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={loai}
            onChange={(e) => setLoai(e.target.value)}
          >
            {loaiHopLe.map((t) => (
              <option key={t} value={t}>
                {nhan(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-note">Ghi chú</Label>
          <Input id="cf-note" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
        </div>
        <Button type="submit">Thêm giao dịch</Button>
      </form>

      {loi && (
        <p role="alert" className="text-sm text-destructive">
          {loi}
        </p>
      )}

      <Dialog open={sapXoa !== null} onOpenChange={(v) => !v && setSapXoa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá giao dịch tiền?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {dangXoa
              ? `${nhan(dangXoa.type)} ${dangXoa.amount} ${account.currency} ngày ${formatDateOnly(dangXoa.date)}. Thao tác này không hoàn tác được.`
              : ""}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSapXoa(null)}>
              Huỷ
            </Button>
            <Button
              onClick={async () => {
                if (sapXoa !== null) await xoa.mutateAsync(sapXoa);
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
