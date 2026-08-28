import { Loading } from "@/components/Loading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";
import { formatDateOnly } from "@/lib/format";
import { MoneyText } from "@/components/MoneyText";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { enumLabel } from "@/i18n/enumLabels";
import { isPositiveNumber } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/i18n/errors";

// Nhãn hiển thị cho giá trị enum của backend. Giá trị ("deposit"/"withdraw")
// là hợp đồng; nhãn là chữ. Loại lạ thì hiện nguyên giá trị chứ không nuốt.
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

export function CashFlowPanel({ account }: { account: Account }) {
  const { data: enums } = useMetaEnums();
  const { data, isPending } = useCashFlows(account.id);
  const themMoi = useCreateCashFlow(account.id);
  const remove = useDeleteCashFlow(account.id);

  const [date, setNgay] = useState("");
  const [amount, setSoTien] = useState("");
  const [kind, setLoai] = useState("deposit");
  const [note, setGhiChu] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sapXoa, setSapXoa] = useState<number | null>(null);
  const { locale, t } = useI18n();

  const isValidType = enums?.cash_flow_types ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!isDate(date)) return setErrorMsg(t("cashflow.dateFormat"));
    if (!isPositiveNumber(amount)) return setErrorMsg(t("cashflow.amountPositive"));
    try {
      await themMoi.mutateAsync({
        date: date.trim(),
        amount: amount.trim(),
        type: kind,
        note: note.trim(),
      });
      setNgay("");
      setSoTien("");
      setGhiChu("");
    } catch (err) {
      setErrorMsg(errorMessage(err, locale, t));
    }
  }

  const isRemoving = data?.find((cf) => cf.id === sapXoa) ?? null;

  return (
    <section className="flex flex-col gap-3">
       <h2 className="text-lg font-semibold">{t("cashflow.title", { code: account.code })}</h2>

      {isPending && <Loading row={3} />}

       {data && data.length === 0 && <p className="text-muted-foreground">{t("cashflow.empty")}</p>}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                 <TableHead>{t("cashflow.date")}</TableHead>
                 <TableHead>{t("cashflow.type")}</TableHead>
                 <TableHead>{t("cashflow.amount")}</TableHead>
                 <TableHead>{t("cashflow.note")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((cf) => (
                <TableRow key={cf.id}>
                   <TableCell className="num">{formatDateOnly(cf.date, locale)}</TableCell>
                   <TableCell>{enumLabel("cash_flow_type", cf.type, locale)}</TableCell>
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
                       aria-label={t("cashflow.deleteLabel", {
                         date: formatDateOnly(cf.date, locale),
                       })}
                      onClick={() => setSapXoa(cf.id)}
                    >
                       {t("common.delete")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="flex flex-col gap-1.5">
           <Label htmlFor="cf-ngay">{t("cashflow.date")}</Label>
          <DatePicker
            id="cf-ngay"
            value={date}
            onChange={setNgay}
             placeholder={t("cashflow.chooseDate")}
             ariaLabel={t("cashflow.date")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
           <Label htmlFor="cf-tien">{t("cashflow.amount")}</Label>
          <Input id="cf-tien" value={amount} onChange={(e) => setSoTien(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
           <Label htmlFor="cf-loai">{t("cashflow.type")}</Label>
          <Select value={kind} onValueChange={setLoai}>
            <SelectTrigger id="cf-loai" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {isValidType.map((t) => (
                <SelectItem key={t} value={t}>
                   {enumLabel("cash_flow_type", t, locale, isValidType)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
           <Label htmlFor="cf-note">{t("cashflow.note")}</Label>
          <Input id="cf-note" value={note} onChange={(e) => setGhiChu(e.target.value)} />
        </div>
       <Button type="submit">{t("cashflow.add")}</Button>
      </form>

      {errorMsg && (
        <Alert variant="destructive">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <Dialog open={sapXoa !== null} onOpenChange={(v) => !v && setSapXoa(null)}>
        <DialogContent>
          <DialogHeader>
             <DialogTitle>{t("cashflow.deleteTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {isRemoving
               ? t("cashflow.deleteDescription", {
                   type: enumLabel("cash_flow_type", isRemoving.type, locale),
                   amount: isRemoving.amount,
                   currency: account.currency,
                   date: formatDateOnly(isRemoving.date, locale),
                 })
              : ""}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSapXoa(null)}>
               {t("common.cancel")}
            </Button>
            <Button
              onClick={async () => {
                if (sapXoa !== null) await remove.mutateAsync(sapXoa);
                setSapXoa(null);
              }}
            >
               {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
