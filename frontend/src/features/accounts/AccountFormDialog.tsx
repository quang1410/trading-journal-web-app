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
import { Segmented } from "@/components/ui/segmented";
import { useMetaEnums } from "@/features/meta/hooks";
import { enumLabel } from "@/i18n/enumLabels";
import {
  PERCENT_PLACES,
  fitsPercentScale,
  isOptionalPercent,
  percentOrNull,
  statusAfterPhaseChange,
  statusOptionsFor,
} from "./challenge";
import { CHALLENGE_PHASES, CHALLENGE_STATUSES, type AccountType } from "./types";

// Mọi thông điệp dưới đây khớp ràng buộc thật của backend
// (service/account.go). Chặn ở client là để phản hồi nhanh, không phải thay.
function makeSchema(t: Translate) {
  return z
    .object({
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
      account_type: z.string(),
      prop_firm: z.string(),
      challenge_phase: z.enum(CHALLENGE_PHASES),
      challenge_status: z.enum(CHALLENGE_STATUSES),
      profit_target_percent: z.string(),
      max_drawdown_percent: z.string(),
    })
    // Nhóm quỹ CHỈ được kiểm khi loại là Quỹ. Kiểm cả khi đã chuyển sang Cá
    // nhân thì một ô đã bị gỡ khỏi màn hình chặn nút Lưu mà không có lời nào
    // hiện ra — và account cá nhân không gửi các trường này lên đâu.
    .superRefine((v, ctx) => {
      if (v.account_type !== "prop") return;
      if (v.prop_firm.trim().length > 64) {
        ctx.addIssue({ code: "custom", message: t("accounts.propFirmMax"), path: ["prop_firm"] });
      }
      for (const key of ["profit_target_percent", "max_drawdown_percent"] as const) {
        if (!isOptionalPercent(v[key])) {
          ctx.addIssue({ code: "custom", message: t("accounts.percentRange"), path: [key] });
        } else if (!fitsPercentScale(v[key])) {
          ctx.addIssue({ code: "custom", message: t("accounts.percentScale", { n: PERCENT_PLACES }), path: [key] });
        }
      }
      // Trùng CHECK accounts_funded_not_passed của migration 0006. UI đã giấu
      // lựa chọn "Đã qua" ở Funded, nên nhánh này chỉ bắt được khi ai đó sửa
      // UI mà quên luật — rẻ để giữ.
      if (v.challenge_phase === "funded" && v.challenge_status === "passed") {
        ctx.addIssue({ code: "custom", message: t("accounts.fundedNotPassed"), path: ["challenge_status"] });
      }
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
  account_type: "personal",
  prop_firm: "",
  challenge_phase: "phase_1",
  challenge_status: "in_progress",
  profit_target_percent: "",
  max_drawdown_percent: "",
};

function fieldsFromAccount(a: Account): Fields {
  return {
    code: a.code,
    name: a.name,
    currency: a.currency,
    timezone: a.timezone,
    initial_balance: a.initial_balance,
    risk_percent: percentFromFraction(a.risk_per_trade),
    account_type: a.account_type,
    prop_firm: a.prop_firm,
    // Account cá nhân vẫn cần giá trị khởi đầu: người dùng có thể chuyển nó
    // sang Quỹ ngay trong form này.
    challenge_phase: a.challenge_phase ?? "phase_1",
    challenge_status: a.challenge_status ?? "in_progress",
    profit_target_percent: a.profit_target ? percentFromFraction(a.profit_target) : "",
    max_drawdown_percent: a.max_drawdown_limit ? percentFromFraction(a.max_drawdown_limit) : "",
  };
}

export function AccountFormDialog({ account }: { account?: Account }) {
  const [open, setOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { locale, t } = useI18n();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  // Chỉ tải khi dialog mở: nút "Thêm tài khoản" luôn nằm trên trang, kể cả
  // khi danh sách rỗng, và không cần enum cho tới lúc người dùng bấm vào.
  const { data: enums } = useMetaEnums({ enabled: open });

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<Fields>({
    resolver: zodResolver(makeSchema(t)),
    defaultValues: account ? fieldsFromAccount(account) : DEFAULTS,
  });

  const accountType = watch("account_type");
  const phase = watch("challenge_phase");
  const phases = enums?.challenge_phases ?? [];
  const statuses = statusOptionsFor(enums?.challenge_statuses ?? [], phase);

  // Nạp lại form từ account HIỆN TẠI mỗi lần mở. defaultValues của useForm
  // chỉ được đọc lúc mount, mà hàng không mount lại khi account đổi (menu ⋯
  // đổi trạng thái ngay trên hàng) — không nạp lại thì dialog hiện giá trị
  // cũ, và chọn lại đúng giá trị cũ đó thì không có gì được gửi đi.
  function onOpenChange(next: boolean) {
    if (next) {
      reset(account ? fieldsFromAccount(account) : DEFAULTS);
      setErrorMsg(null);
    }
    setOpen(next);
  }

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
          account_type: (x) => ({ key: "account_type", value: x as AccountType }),
          prop_firm: (x) => ({ key: "prop_firm", value: x.trim() }),
          challenge_phase: (x) => ({ key: "challenge_phase", value: x }),
          challenge_status: (x) => ({ key: "challenge_status", value: x }),
          // Ô trống là "quỹ không đặt luật này": gửi null để backend xoá, không
          // bỏ khoá — bỏ khoá nghĩa là "giữ số cũ".
          profit_target_percent: (x) => ({ key: "profit_target", value: percentOrNull(x) }),
          max_drawdown_percent: (x) => ({ key: "max_drawdown_limit", value: percentOrNull(x) }),
        });
        // Vòng đổi thì gửi kèm trạng thái ĐANG HIỆN, dù nó có "dirty" hay
        // không: backend tự đưa về in_progress khi chỉ nhận vòng, và điều đó
        // không được xảy ra ngầm sau lưng thứ người dùng đang nhìn.
        if (dirtyFields.challenge_phase && patch.challenge_status === undefined) {
          patch.challenge_status = v.challenge_status;
        }
        await update.mutateAsync({ id: account.id, patch });
      } else {
        const body: AccountCreate = {
          code: v.code.trim(),
          name: v.name.trim(),
          currency: v.currency.trim(),
          timezone: v.timezone,
          initial_balance: v.initial_balance.trim(),
          risk_per_trade: fractionFromPercent(v.risk_percent.trim()),
          account_type: v.account_type as AccountType,
          // Account cá nhân KHÔNG gửi trường quỹ nào: form vẫn giữ giá trị
          // khởi đầu phase_1/in_progress cho chúng, và gửi lên là nói dối.
          ...(v.account_type === "prop"
            ? {
                prop_firm: v.prop_firm.trim(),
                challenge_phase: v.challenge_phase,
                challenge_status: v.challenge_status,
                profit_target: percentOrNull(v.profit_target_percent),
                max_drawdown_limit: percentOrNull(v.max_drawdown_percent),
              }
            : {}),
        };
        await create.mutateAsync(body);
      }
      setOpen(false);
      reset(account ? undefined : DEFAULTS);
    } catch (e) {
      setErrorMsg(errorMessage(e, locale, t));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={account ? "outline" : "default"} size={account ? "sm" : "default"}>
          {account ? t("accounts.edit", { code: account.code }) : t("accounts.add")}
        </Button>
      </DialogTrigger>
      {/* sm:max-w-xl phải có tiền tố sm: — max-w-xl trần thua sm:max-w-lg
          của shadcn ở mọi màn hình >= sm. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{account ? t("accounts.formTitleEdit") : t("accounts.formTitleAdd")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <span id="account-type-label" className="text-sm font-medium">
              {t("accounts.type")}
            </span>
            <Controller
              control={control}
              name="account_type"
              render={({ field }) => (
                <Segmented
                  ariaLabelledBy="account-type-label"
                  value={field.value}
                  onChange={field.onChange}
                  options={enums?.account_types ?? []}
                  renderOption={(o) => enumLabel("account_type", o, locale, enums?.account_types)}
                />
              )}
            />
          </div>
          {/* Ô ngắn đi thành cặp: nhóm Thử thách quỹ làm form dài gấp rưỡi,
              một cột thì phải cuộn ngay trên màn hình laptop. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="code" label={t("accounts.accountCode")} errorMsg={errors.code?.message} register={register("code")} />
            <Field name="name" label={t("accounts.name")} errorMsg={errors.name?.message} register={register("name")} />
            <Field
              name="initial_balance"
              label={t("accounts.initialBalance")}
              numeric
              inputMode="decimal"
              errorMsg={errors.initial_balance?.message}
              register={register("initial_balance")}
            />
            <Field
              name="currency"
              label={t("accounts.currency")}
              errorMsg={errors.currency?.message}
              register={register("currency")}
            />
            <Field
              name="risk_percent"
              label={t("accounts.riskPerTrade")}
              numeric
              inputMode="decimal"
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
          </div>

          {accountType === "prop" && (
            <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-semibold">{t("accounts.challengeSection")}</legend>

              <Field
                name="prop_firm"
                label={t("accounts.propFirm")}
                placeholder="FTMO"
                errorMsg={errors.prop_firm?.message}
                register={register("prop_firm")}
              />

              <div className="flex flex-col gap-1.5">
                <span id="challenge-phase-label" className="text-sm font-medium">
                  {t("accounts.phase")}
                </span>
                <Controller
                  control={control}
                  name="challenge_phase"
                  render={({ field }) => (
                    <Segmented
                      ariaLabelledBy="challenge-phase-label"
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next);
                        // Cũng lo luôn Funded: "Đã qua" không bao giờ sống
                        // sót, vì sang Funded luôn là đổi vòng.
                        const saved = account ? fieldsFromAccount(account) : DEFAULTS;
                        setValue(
                          "challenge_status",
                          statusAfterPhaseChange(next, { phase: saved.challenge_phase, status: saved.challenge_status }),
                          { shouldDirty: true },
                        );
                      }}
                      options={phases}
                      renderOption={(o) => enumLabel("challenge_phase", o, locale, phases)}
                    />
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span id="challenge-status-label" className="text-sm font-medium">
                  {t("accounts.status")}
                </span>
                <Controller
                  control={control}
                  name="challenge_status"
                  render={({ field }) => (
                    <Segmented
                      ariaLabelledBy="challenge-status-label"
                      value={field.value}
                      onChange={field.onChange}
                      options={statuses}
                      renderOption={(o) =>
                        phase === "funded" && o === "in_progress"
                          ? t("accounts.fundedActive")
                          : enumLabel("challenge_status", o, locale, enums?.challenge_statuses)
                      }
                    />
                  )}
                />
                {errors.challenge_status && (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.challenge_status.message}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  name="profit_target_percent"
                  label={t("accounts.profitTarget")}
                  numeric
                  inputMode="decimal"
                  errorMsg={errors.profit_target_percent?.message}
                  register={register("profit_target_percent")}
                />
                <Field
                  name="max_drawdown_percent"
                  label={t("accounts.maxDrawdown")}
                  numeric
                  inputMode="decimal"
                  errorMsg={errors.max_drawdown_percent?.message}
                  register={register("max_drawdown_percent")}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("accounts.ruleHint")}</p>
            </fieldset>
          )}

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

