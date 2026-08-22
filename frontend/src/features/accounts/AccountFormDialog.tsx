import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { compareDecimal, fractionFromPercent, percentFromFraction } from "@/lib/decimal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateAccount, useUpdateAccount } from "./hooks";
import type { Account, AccountCreate, AccountPatch } from "./types";
import { useI18n, type Translate } from "@/i18n";
import { errorMessage } from "@/i18n/errors";

// Kiểm số dương mà KHÔNG dùng Number: một chuỗi chữ số hợp lệ và có ít nhất
// một chữ số khác 0.
const laSoDuong = (v: string) => /^\d*\.?\d+$/.test(v.trim()) && /[1-9]/.test(v);

// Mọi thông điệp dưới đây khớp ràng buộc thật của backend
// (service/account.go). Chặn ở client là để phản hồi nhanh, không phải thay.
function taoSchema(t: Translate) {
  return z.object({
    code: z
      .string()
      .trim()
      .min(1, t("accounts.codeRequired"))
      .max(32, t("accounts.codeMax")),
    name: z.string().trim(),
    currency: z
      .string()
      .trim()
      .min(1, t("accounts.currencyRequired"))
      .max(8, t("accounts.currencyMax")),
    timezone: z.string().min(1, t("accounts.timezoneRequired")),
    initial_balance: z.string().refine(laSoDuong, t("accounts.initialBalancePositive")),
    risk_percent: z
      .string()
      .refine(laSoDuong, t("accounts.riskPositive"))
      .refine((v) => compareDecimal(v, "100") <= 0, t("accounts.riskMax")),
  });
}

type Fields = z.infer<ReturnType<typeof taoSchema>>;

// Danh sách IANA lấy thẳng từ trình duyệt, không cần thư viện.
const MUI_GIO: string[] =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["Asia/Ho_Chi_Minh", "UTC"];

const MAC_DINH: Fields = {
  code: "",
  name: "",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  initial_balance: "",
  risk_percent: "1",
};

function tuAccount(a: Account): Fields {
  return {
    code: a.code,
    name: a.name,
    currency: a.currency,
    timezone: a.timezone,
    initial_balance: a.initial_balance,
    risk_percent: percentFromFraction(a.risk_per_trade),
  };
}

export function AccountFormDialog({ account }: { account?: Account }) {
  const [mo, setMo] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const { locale, t } = useI18n();
  const taoMoi = useCreateAccount();
  const capNhat = useUpdateAccount();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<Fields>({
    resolver: zodResolver(taoSchema(t)),
    defaultValues: account ? tuAccount(account) : MAC_DINH,
  });

  async function gui(v: Fields) {
    setLoi(null);
    try {
      if (account) {
        // Chỉ gửi field đã đổi: PATCH của backend dùng con trỏ, khoá vắng
        // mặt nghĩa là "không đổi". Gửi cả bảng biến một lần sửa tên thành
        // một lần ghi đè toàn bộ.
        const patch: AccountPatch = {};
        if (dirtyFields.code) patch.code = v.code.trim();
        if (dirtyFields.name) patch.name = v.name.trim();
        if (dirtyFields.currency) patch.currency = v.currency.trim();
        if (dirtyFields.timezone) patch.timezone = v.timezone;
        if (dirtyFields.initial_balance) patch.initial_balance = v.initial_balance.trim();
        if (dirtyFields.risk_percent)
          patch.risk_per_trade = fractionFromPercent(v.risk_percent.trim());
        await capNhat.mutateAsync({ id: account.id, patch });
      } else {
        const body: AccountCreate = {
          code: v.code.trim(),
          name: v.name.trim(),
          currency: v.currency.trim(),
          timezone: v.timezone,
          initial_balance: v.initial_balance.trim(),
          risk_per_trade: fractionFromPercent(v.risk_percent.trim()),
        };
        await taoMoi.mutateAsync(body);
      }
      setMo(false);
      reset(account ? undefined : MAC_DINH);
    } catch (e) {
      setLoi(errorMessage(e, locale, t));
    }
  }

  return (
    <Dialog open={mo} onOpenChange={setMo}>
      <DialogTrigger asChild>
        <Button variant={account ? "outline" : "default"} size={account ? "sm" : "default"}>
          {account ? t("accounts.edit", { code: account.code }) : t("accounts.add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? t("accounts.formTitleEdit") : t("accounts.formTitleAdd")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(gui)} className="flex flex-col gap-3" noValidate>
          <O ten="code" nhan={t("accounts.accountCode")} loi={errors.code?.message} dangKy={register("code")} />
          <O ten="name" nhan={t("accounts.name")} loi={errors.name?.message} dangKy={register("name")} />
          <O
            ten="currency"
            nhan={t("accounts.currency")}
            loi={errors.currency?.message}
            dangKy={register("currency")}
          />
          <O
            ten="initial_balance"
            nhan={t("accounts.initialBalance")}
            loi={errors.initial_balance?.message}
            dangKy={register("initial_balance")}
          />
          <O
            ten="risk_percent"
            nhan={t("accounts.riskPerTrade")}
            loi={errors.risk_percent?.message}
            dangKy={register("risk_percent")}
          />

          <div className="flex flex-col gap-1.5">
             <Label htmlFor="timezone">{t("accounts.timezone")}</Label>
            {/* NGOẠI LỆ CÓ CHỦ Ý: ô này giữ <select> native trong khi hai ô
                chọn khác của dự án đã đổi sang Select của shadcn.
                Intl.supportedValuesOf("timeZone") trả về 417 mục; Radix Select
                dựng cả 417 node vào DOM mỗi lần mở, còn <select> native thì
                trình duyệt lo. Đừng "dọn nốt" chỗ này. */}
            <select
              id="timezone"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("timezone")}
            >
              {MUI_GIO.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
               {t("accounts.timezoneHint")}
            </p>
          </div>

          {loi && (
            <Alert variant="destructive">
              <AlertDescription>{loi}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
           <Button type="submit">{t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function O({
  ten,
  nhan,
  loi,
  dangKy,
}: {
  ten: string;
  nhan: string;
  loi?: string;
  dangKy: UseFormRegisterReturn;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ten}>{nhan}</Label>
      <Input id={ten} {...dangKy} />
      {loi && (
        <p role="alert" className="text-sm text-destructive">
          {loi}
        </p>
      )}
    </div>
  );
}
