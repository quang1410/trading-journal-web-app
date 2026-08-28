import { Loading } from "@/components/Loading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Control } from "react-hook-form";
import { z } from "zod";
import { instantToWall, nowInZone, wallToInstant } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMetaEnums, type MetaEnums } from "@/features/meta/hooks";
import type { Account } from "@/features/accounts/types";
import { useCreateTrade, useUpdateTrade } from "./hooks";
import type { Trade, TradeCreate, TradePatch } from "./types";
import { useI18n, type Translate } from "@/i18n";
import { enumLabel, type EnumField } from "@/i18n/enumLabels";
import { errorMessage } from "@/i18n/errors";
import { patchFromDirty } from "@/components/form/patchFromDirty";
import { Field } from "@/components/form/Field";

// Kiểm số mà KHÔNG ép kiểu: một chuỗi chữ số hợp lệ, cho phép dấu trừ.
// Lãi lỗ âm là bình thường, phí âm cũng không bị backend cấm — FE không
// được bịa thêm ràng buộc backend không có.
const isNumber = (v: string) => /^-?\d*\.?\d+$/.test(v.trim());
const isNumberOrEmpty = (v: string) => v.trim() === "" || isNumber(v);

// Mọi thông điệp dưới đây khớp ràng buộc thật của backend
// (validateTradeInput trong service/trade.go). Chặn ở client là để phản hồi
// nhanh, không phải để thay.
function makeSchema(t: Translate) {
  return z.object({
  entered_at: z.string().min(1, t("tradeForm.enteredAtRequired")),
  symbol: z.string().trim().min(1, t("tradeForm.symbolRequired")),
  direction: z.string().min(1, t("tradeForm.directionRequired")),
  timeframe: z.string(),
  setup: z.string(),
  entry: z.string().refine(isNumberOrEmpty, t("tradeForm.entryNumber")),
  exit: z.string().refine(isNumberOrEmpty, t("tradeForm.exitNumber")),
  volume: z.string().refine(isNumberOrEmpty, t("tradeForm.volumeNumber")),
  profit: z.string().refine(isNumber, t("tradeForm.profitNumber")),
  profit_theory: z.string().refine(isNumberOrEmpty, t("tradeForm.profitTheoryNumber")),
  fee: z.string().refine(isNumber, t("tradeForm.feeNumber")),
  entry_quality: z.string(),
  in_trade_quality: z.string(),
  exit_quality: z.string(),
  psychology: z.string(),
  notes: z.string(),
  });
}

type Fields = z.infer<ReturnType<typeof makeSchema>>;

/** Ô rỗng của bốn cột NULLable gửi null; mọi ô khác gửi chuỗi đã cắt trắng. */
const emptyToNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

export function TradeFormDialog({
  account,
  trade,
  open,
  onOpenChange,
}: {
  account: Account;
  trade?: Trade;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: enums } = useMetaEnums();
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {trade ? t("tradeForm.editTitle", { stt: trade.stt }) : t("tradeForm.addTitle")}
          </DialogTitle>
        </DialogHeader>
        {/*
          Hai điều kiện, mỗi cái vì một lý do riêng.

          `open`: Radix gỡ hẳn DialogContent khỏi cây khi đóng, nên useForm bên
          trong dựng lại defaultValues MỖI LẦN MỞ — "bây giờ" luôn là bây giờ
          thật, không phải lúc trang được tải.

          `enums`: mặc định của ô chiều lệnh là `directions[0]`, mà danh sách
          đó tải về không đồng bộ. Dựng form trước khi nó về thì mặc định là
          chuỗi rỗng, và người dùng ăn lỗi "chiều lệnh phải là Long hoặc
          Short" trên một ô họ chưa hề đụng vào. Chờ ở đây thay vì trông vào
          việc trang cha đã nạp sẵn cache — component này phải tự đứng được.
        */}
        {open && enums === undefined && <Loading row={4} />}
        {open && enums !== undefined && (
          <FormLenh
            account={account}
            trade={trade}
            enums={enums}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormLenh({
  account,
  trade,
  enums,
  onDone,
}: {
  account: Account;
  trade?: Trade;
  enums: MetaEnums;
  onDone: () => void;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { locale, t: translate } = useI18n();
  const create = useCreateTrade(account.id);
  const update = useUpdateTrade(account.id);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<Fields>({
    resolver: zodResolver(makeSchema(translate)),
    // `enums` chắc chắn đã có: TradeFormDialog không dựng component này cho
    // tới khi /meta/enums về. Nhờ vậy mặc định tính đúng ngay lần đầu, không
    // cần effect nào reset lại form.
    defaultValues: trade
      ? tuTrade(trade, account.timezone)
      : defaults(account.timezone, enums.directions[0] ?? ""),
  });

  /**
   * MỘT bảng cho cả tạo mới lẫn sửa: mỗi field khai đúng một lần cách nó biến
   * thành dữ liệu API. Trước đây 16 dòng `if (dirtyFields.X)` và 16 dòng dựng
   * body nằm cạnh nhau, và hai bên phải khớp nhau bằng mắt — quên một dòng ở
   * nhánh patch thì field đó lặng lẽ không bao giờ lưu.
   */
  const transforms = {
    entered_at: (x: string) => ({ key: "entered_at" as const, value: wallToInstant(x, account.timezone) }),
    symbol: (x: string) => ({ key: "symbol" as const, value: x.trim() }),
    direction: (x: string) => ({ key: "direction" as const, value: x }),
    entry: (x: string) => ({ key: "entry" as const, value: emptyToNull(x) }),
    exit: (x: string) => ({ key: "exit" as const, value: emptyToNull(x) }),
    volume: (x: string) => ({ key: "volume" as const, value: emptyToNull(x) }),
    profit: (x: string) => ({ key: "profit" as const, value: x.trim() }),
    profit_theory: (x: string) => ({ key: "profit_theory" as const, value: emptyToNull(x) }),
    fee: (x: string) => ({ key: "fee" as const, value: x.trim() }),
    setup: (x: string) => ({ key: "setup" as const, value: x.trim() }),
    timeframe: (x: string) => ({ key: "timeframe" as const, value: x }),
    entry_quality: (x: string) => ({ key: "entry_quality" as const, value: x }),
    in_trade_quality: (x: string) => ({ key: "in_trade_quality" as const, value: x }),
    exit_quality: (x: string) => ({ key: "exit_quality" as const, value: x }),
    psychology: (x: string) => ({ key: "psychology" as const, value: x }),
    notes: (x: string) => ({ key: "notes" as const, value: x.trim() }),
  };

  async function submit(v: Fields) {
    setErrorMsg(null);
    try {
      if (trade) {
        // Chỉ gửi trường đã đổi: khoá vắng mặt nghĩa là "không đổi".
        const patch = patchFromDirty<Fields, TradePatch>(dirtyFields, v, transforms);
        await update.mutateAsync({ id: trade.id, patch });
      } else {
        // Tạo mới thì MỌI field đều "đổi" — cùng một bảng, khác tập khoá.
        const fresh = Object.fromEntries(
          Object.keys(transforms).map((k) => [k, true]),
        ) as Partial<Record<keyof Fields, boolean>>;
        const body = patchFromDirty<Fields, TradeCreate>(fresh, v, transforms);
        await create.mutateAsync(body);
      }
      onDone();
    } catch (e) {
      setErrorMsg(errorMessage(e, locale, translate));
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
      <Group label={translate("tradeForm.orderGroup")}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entered-at">{translate("tradeForm.enteredAt")}</Label>
          <Controller
            control={control}
            name="entered_at"
            render={({ field }) => (
              <DateTimePicker
                id="entered-at"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={translate("tradeForm.chooseDateTime")}
                ariaLabel={translate("tradeForm.enteredAt")}
                timeLabel={translate("tradeForm.entryTime")}
                aria-invalid={Boolean(errors.entered_at)}
              />
            )}
          />
          {errors.entered_at && (
            <p role="alert" className="text-sm text-destructive">
              {errors.entered_at.message}
            </p>
          )}
        </div>
        <Field
          name="symbol"
           label={translate("tradeForm.symbol")}
          errorMsg={errors.symbol?.message}
          register={register("symbol")}
        />
        <EnumSelect
          name="direction"
           label={translate("tradeForm.direction")}
          control={control}
          item={enums.directions}
           errorMsg={errors.direction?.message}
           enumField="direction"
        />
        <EnumSelect
          name="timeframe"
           label={translate("tradeForm.timeframe")}
          control={control}
          item={enums.timeframes}
           choPhepRong
           enumField="timeframe"
        />
        <Field name="setup" label="Setup" register={register("setup")} />
      </Group>

       <Group label={translate("tradeForm.moneyGroup")}>
         <Field name="entry" label={translate("tradeForm.entry")} errorMsg={errors.entry?.message} register={register("entry")} />
         <Field name="exit" label={translate("tradeForm.exit")} errorMsg={errors.exit?.message} register={register("exit")} />
        <Field
          name="volume"
           label={translate("tradeForm.volume")}
          errorMsg={errors.volume?.message}
          register={register("volume")}
        />
         <Field name="profit" label={translate("tradeForm.profit")} errorMsg={errors.profit?.message} register={register("profit")} />
        <Field
          name="profit_theory"
           label={translate("tradeForm.profitTheory")}
          errorMsg={errors.profit_theory?.message}
          register={register("profit_theory")}
        />
         <Field name="fee" label={translate("tradeForm.fee")} errorMsg={errors.fee?.message} register={register("fee")} />
      </Group>

       <Group label={translate("tradeForm.reviewGroup")}>
        <EnumSelect
          name="entry_quality"
           label={translate("tradeForm.entryQuality")}
          control={control}
          item={enums.entry_qualities}
           choPhepRong
           enumField="entry_quality"
        />
        <EnumSelect
          name="in_trade_quality"
           label={translate("tradeForm.inTradeQuality")}
          control={control}
          item={enums.in_trade_qualities}
           choPhepRong
           enumField="in_trade_quality"
        />
        <EnumSelect
          name="exit_quality"
           label={translate("tradeForm.exitQuality")}
          control={control}
          item={enums.exit_qualities}
           choPhepRong
           enumField="exit_quality"
        />
        <EnumSelect
          name="psychology"
           label={translate("tradeForm.psychology")}
          control={control}
          item={enums.psychologies}
           choPhepRong
           enumField="psychology"
        />
      </Group>

      <div className="flex flex-col gap-1.5">
         <Label htmlFor="notes">{translate("tradeForm.notes")}</Label>
        <Textarea id="notes" {...register("notes")} />
      </div>

      <p className="text-xs text-muted-foreground">
         {translate("tradeForm.emptyReviewHint")}
      </p>

      {errorMsg && (
        <Alert variant="destructive">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
         <Button type="submit">{translate("common.save")}</Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Giá trị mặc định khi thêm lệnh mới.
 *
 * `chieuMacDinh` là phần tử đầu của /meta/enums chứ không phải chuỗi "Long"
 * chép cứng — spec §8 đòi mặc định là `directions[0]`, và chép cứng sẽ vướng
 * cổng styleguard lẫn quy tắc 5 của CLAUDE.md.
 */
function defaults(tz: string, defaultDirection: string): Fields {
  return {
    entered_at: nowInZone(tz),
    symbol: "",
    direction: defaultDirection,
    timeframe: "",
    setup: "",
    entry: "",
    exit: "",
    volume: "",
    profit: "",
    profit_theory: "",
    fee: "0",
    entry_quality: "",
    in_trade_quality: "",
    exit_quality: "",
    psychology: "",
    notes: "",
  };
}

function tuTrade(t: Trade, tz: string): Fields {
  return {
    entered_at: instantToWall(t.entered_at, tz),
    symbol: t.symbol,
    direction: t.direction,
    timeframe: t.timeframe,
    setup: t.setup,
    entry: t.entry ?? "",
    exit: t.exit ?? "",
    volume: t.volume ?? "",
    profit: t.profit,
    profit_theory: t.profit_theory ?? "",
    fee: t.fee,
    entry_quality: t.entry_quality,
    in_trade_quality: t.in_trade_quality,
    exit_quality: t.exit_quality,
    psychology: t.psychology,
    notes: t.notes,
  };
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

// Radix Select không phải input thật nên register() không gắn vào được —
// phải đi qua Controller. Và nó không nhận Item mang value rỗng, nên "chưa
// chọn" dùng một giá trị canh gác rồi dịch ngược ngay tại chỗ.
const NOT_SELECTED = "__chua_chon__";

function EnumSelect({
  name,
  label,
  control,
  item,
  errorMsg,
  choPhepRong = false,
  enumField,
}: {
  name: keyof Fields;
  label: string;
  control: Control<Fields>;
  item: string[];
  errorMsg?: string;
  choPhepRong?: boolean;
  enumField: EnumField;
}) {
  const { locale, t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={field.value === "" ? NOT_SELECTED : field.value}
            onValueChange={(v) => field.onChange(v === NOT_SELECTED ? "" : v)}
          >
            <SelectTrigger id={name}>
             <SelectValue placeholder={t("tradeForm.choose")} />
            </SelectTrigger>
            <SelectContent>
               {choPhepRong && <SelectItem value={NOT_SELECTED}>{t("tradeForm.notRated")}</SelectItem>}
               {item.map((m) => (
                 <SelectItem key={m} value={m}>
                   {enumLabel(enumField, m, locale, item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {errorMsg && (
        <p role="alert" className="text-sm text-destructive">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
