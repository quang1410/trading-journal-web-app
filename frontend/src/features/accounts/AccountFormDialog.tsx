import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { compareDecimal, fractionFromPercent, isPositiveNumber, percentFromFraction } from "@/lib/decimal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/form/Field";
import { patchFromDirty } from "@/components/form/patchFromDirty";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
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

// Mọi thông điệp dưới đây khớp ràng buộc thật của backend
// (service/account.go). Chặn ở client là để phản hồi nhanh, không phải thay.
function makeSchema(t: Translate) {
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
    initial_balance: z.string().refine(isPositiveNumber, t("accounts.initialBalancePositive")),
    risk_percent: z
      .string()
      .refine(isPositiveNumber, t("accounts.riskPositive"))
      .refine((v) => compareDecimal(v, "100") <= 0, t("accounts.riskMax")),
  });
}

type Fields = z.infer<ReturnType<typeof makeSchema>>;

// Danh sách IANA lấy thẳng từ trình duyệt, không cần thư viện.
const TIMEZONES: string[] = Array.from(
  new Set(
    typeof Intl.supportedValuesOf === "function"
      ? [...Intl.supportedValuesOf("timeZone"), "UTC"]
      : ["Asia/Ho_Chi_Minh", "UTC"],
  ),
).sort();

const DEFAULTS: Fields = {
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
  const [open, setMo] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { locale, t } = useI18n();
  const create = useCreateAccount();
  const update = useUpdateAccount();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<Fields>({
    resolver: zodResolver(makeSchema(t)),
    defaultValues: account ? tuAccount(account) : DEFAULTS,
  });

  async function submit(v: Fields) {
    setErrorMsg(null);
    try {
      if (account) {
        // Chỉ gửi field đã đổi: PATCH của backend dùng con trỏ, khoá vắng
        // mặt nghĩa là "không đổi". Gửi cả bảng biến một lần sửa tên thành
        // một lần ghi đè toàn bộ.
        const patch = patchFromDirty<Fields, AccountPatch>(dirtyFields, v, {
          code: (x) => ({ key: "code", value: x.trim() }),
          name: (x) => ({ key: "name", value: x.trim() }),
          currency: (x) => ({ key: "currency", value: x.trim() }),
          timezone: (x) => ({ key: "timezone", value: x }),
          initial_balance: (x) => ({ key: "initial_balance", value: x.trim() }),
          // Form hỏi phần trăm, API nhận phân số — đổi cả tên khoá lẫn hình.
          risk_percent: (x) => ({ key: "risk_per_trade", value: fractionFromPercent(x.trim()) }),
        });
        await update.mutateAsync({ id: account.id, patch });
      } else {
        const body: AccountCreate = {
          code: v.code.trim(),
          name: v.name.trim(),
          currency: v.currency.trim(),
          timezone: v.timezone,
          initial_balance: v.initial_balance.trim(),
          risk_per_trade: fractionFromPercent(v.risk_percent.trim()),
        };
        await create.mutateAsync(body);
      }
      setMo(false);
      reset(account ? undefined : DEFAULTS);
    } catch (e) {
      setErrorMsg(errorMessage(e, locale, t));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setMo}>
      <DialogTrigger asChild>
        <Button variant={account ? "outline" : "default"} size={account ? "sm" : "default"}>
          {account ? t("accounts.edit", { code: account.code }) : t("accounts.add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? t("accounts.formTitleEdit") : t("accounts.formTitleAdd")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <Field name="code" label={t("accounts.accountCode")} errorMsg={errors.code?.message} register={register("code")} />
          <Field name="name" label={t("accounts.name")} errorMsg={errors.name?.message} register={register("name")} />
          <Field
            name="currency"
            label={t("accounts.currency")}
            errorMsg={errors.currency?.message}
            register={register("currency")}
          />
          <Field
            name="initial_balance"
            label={t("accounts.initialBalance")}
            errorMsg={errors.initial_balance?.message}
            register={register("initial_balance")}
          />
          <Field
            name="risk_percent"
            label={t("accounts.riskPerTrade")}
            errorMsg={errors.risk_percent?.message}
            register={register("risk_percent")}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timezone">{t("accounts.timezone")}</Label>
            <Controller
              control={control}
              name="timezone"
              render={({ field }) => (
                <SearchableSelect
                  id="timezone"
                  value={field.value}
                  options={TIMEZONES}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={t("accounts.timezone")}
                  searchPlaceholder={t("accounts.timezoneSearch")}
                  emptyMessage={t("accounts.timezoneNoResults")}
                  aria-invalid={Boolean(errors.timezone)}
                />
              )}
            />
            {errors.timezone && (
              <p role="alert" className="text-sm text-destructive">
                {errors.timezone.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("accounts.timezoneHint")}
            </p>
          </div>

          {errorMsg && (
            <Alert variant="destructive">
              <AlertDescription>{errorMsg}</AlertDescription>
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

