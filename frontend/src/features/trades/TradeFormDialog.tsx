import { DangTai } from "@/components/DangTai";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Control, type UseFormRegisterReturn } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
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

// Kiểm số mà KHÔNG ép kiểu: một chuỗi chữ số hợp lệ, cho phép dấu trừ.
// Lãi lỗ âm là bình thường, phí âm cũng không bị backend cấm — FE không
// được bịa thêm ràng buộc backend không có.
const laSo = (v: string) => /^-?\d*\.?\d+$/.test(v.trim());
const laSoHoacRong = (v: string) => v.trim() === "" || laSo(v);

// Mọi thông điệp dưới đây khớp ràng buộc thật của backend
// (validateTradeInput trong service/trade.go). Chặn ở client là để phản hồi
// nhanh, không phải để thay.
function taoSchema(t: Translate) {
  return z.object({
  entered_at: z.string().min(1, t("tradeForm.enteredAtRequired")),
  symbol: z.string().trim().min(1, t("tradeForm.symbolRequired")),
  direction: z.string().min(1, t("tradeForm.directionRequired")),
  timeframe: z.string(),
  setup: z.string(),
  entry: z.string().refine(laSoHoacRong, t("tradeForm.entryNumber")),
  exit: z.string().refine(laSoHoacRong, t("tradeForm.exitNumber")),
  volume: z.string().refine(laSoHoacRong, t("tradeForm.volumeNumber")),
  profit: z.string().refine(laSo, t("tradeForm.profitNumber")),
  profit_theory: z.string().refine(laSoHoacRong, t("tradeForm.profitTheoryNumber")),
  fee: z.string().refine(laSo, t("tradeForm.feeNumber")),
  entry_quality: z.string(),
  in_trade_quality: z.string(),
  exit_quality: z.string(),
  psychology: z.string(),
  notes: z.string(),
  });
}

type Fields = z.infer<ReturnType<typeof taoSchema>>;

/** Ô rỗng của bốn cột NULLable gửi null; mọi ô khác gửi chuỗi đã cắt trắng. */
const rongThanhNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

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
        {open && enums === undefined && <DangTai dong={4} />}
        {open && enums !== undefined && (
          <FormLenh
            account={account}
            trade={trade}
            enums={enums}
            onXong={() => onOpenChange(false)}
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
  onXong,
}: {
  account: Account;
  trade?: Trade;
  enums: MetaEnums;
  onXong: () => void;
}) {
  const [loi, setLoi] = useState<string | null>(null);
  const { locale, t: dich } = useI18n();
  const taoMoi = useCreateTrade(account.id);
  const capNhat = useUpdateTrade(account.id);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<Fields>({
    resolver: zodResolver(taoSchema(dich)),
    // `enums` chắc chắn đã có: TradeFormDialog không dựng component này cho
    // tới khi /meta/enums về. Nhờ vậy mặc định tính đúng ngay lần đầu, không
    // cần effect nào reset lại form.
    defaultValues: trade
      ? tuTrade(trade, account.timezone)
      : macDinh(account.timezone, enums.directions[0] ?? ""),
  });

  async function gui(v: Fields) {
    setLoi(null);
    try {
      if (trade) {
        // Chỉ gửi trường đã đổi: khoá vắng mặt nghĩa là "không đổi".
        const patch: TradePatch = {};
        if (dirtyFields.entered_at)
          patch.entered_at = wallToInstant(v.entered_at, account.timezone);
        if (dirtyFields.symbol) patch.symbol = v.symbol.trim();
        if (dirtyFields.direction) patch.direction = v.direction;
        if (dirtyFields.entry) patch.entry = rongThanhNull(v.entry);
        if (dirtyFields.exit) patch.exit = rongThanhNull(v.exit);
        if (dirtyFields.volume) patch.volume = rongThanhNull(v.volume);
        if (dirtyFields.profit) patch.profit = v.profit.trim();
        if (dirtyFields.profit_theory) patch.profit_theory = rongThanhNull(v.profit_theory);
        if (dirtyFields.fee) patch.fee = v.fee.trim();
        if (dirtyFields.setup) patch.setup = v.setup.trim();
        if (dirtyFields.timeframe) patch.timeframe = v.timeframe;
        if (dirtyFields.entry_quality) patch.entry_quality = v.entry_quality;
        if (dirtyFields.in_trade_quality) patch.in_trade_quality = v.in_trade_quality;
        if (dirtyFields.exit_quality) patch.exit_quality = v.exit_quality;
        if (dirtyFields.psychology) patch.psychology = v.psychology;
        if (dirtyFields.notes) patch.notes = v.notes.trim();
        await capNhat.mutateAsync({ id: trade.id, patch });
      } else {
        const body: TradeCreate = {
          entered_at: wallToInstant(v.entered_at, account.timezone),
          symbol: v.symbol.trim(),
          direction: v.direction,
          entry: rongThanhNull(v.entry),
          exit: rongThanhNull(v.exit),
          volume: rongThanhNull(v.volume),
          profit: v.profit.trim(),
          profit_theory: rongThanhNull(v.profit_theory),
          fee: v.fee.trim(),
          setup: v.setup.trim(),
          timeframe: v.timeframe,
          entry_quality: v.entry_quality,
          in_trade_quality: v.in_trade_quality,
          exit_quality: v.exit_quality,
          psychology: v.psychology,
          notes: v.notes.trim(),
        };
        await taoMoi.mutateAsync(body);
      }
      onXong();
    } catch (e) {
      setLoi(errorMessage(e, locale, dich));
    }
  }

  return (
    <form onSubmit={handleSubmit(gui)} className="flex flex-col gap-4" noValidate>
      <Nhom ten={dich("tradeForm.orderGroup")}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entered-at">{dich("tradeForm.enteredAt")}</Label>
          <Controller
            control={control}
            name="entered_at"
            render={({ field }) => (
              <DateTimePicker
                id="entered-at"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={dich("tradeForm.chooseDateTime")}
                ariaLabel={dich("tradeForm.enteredAt")}
                timeLabel={dich("tradeForm.entryTime")}
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
        <O
          ten="symbol"
           nhan={dich("tradeForm.symbol")}
          loi={errors.symbol?.message}
          dangKy={register("symbol")}
        />
        <Chon
          ten="direction"
           nhan={dich("tradeForm.direction")}
          control={control}
          muc={enums.directions}
           loi={errors.direction?.message}
           enumField="direction"
        />
        <Chon
          ten="timeframe"
           nhan={dich("tradeForm.timeframe")}
          control={control}
          muc={enums.timeframes}
           choPhepRong
           enumField="timeframe"
        />
        <O ten="setup" nhan="Setup" dangKy={register("setup")} />
      </Nhom>

       <Nhom ten={dich("tradeForm.moneyGroup")}>
         <O ten="entry" nhan={dich("tradeForm.entry")} loi={errors.entry?.message} dangKy={register("entry")} />
         <O ten="exit" nhan={dich("tradeForm.exit")} loi={errors.exit?.message} dangKy={register("exit")} />
        <O
          ten="volume"
           nhan={dich("tradeForm.volume")}
          loi={errors.volume?.message}
          dangKy={register("volume")}
        />
         <O ten="profit" nhan={dich("tradeForm.profit")} loi={errors.profit?.message} dangKy={register("profit")} />
        <O
          ten="profit_theory"
           nhan={dich("tradeForm.profitTheory")}
          loi={errors.profit_theory?.message}
          dangKy={register("profit_theory")}
        />
         <O ten="fee" nhan={dich("tradeForm.fee")} loi={errors.fee?.message} dangKy={register("fee")} />
      </Nhom>

       <Nhom ten={dich("tradeForm.reviewGroup")}>
        <Chon
          ten="entry_quality"
           nhan={dich("tradeForm.entryQuality")}
          control={control}
          muc={enums.entry_qualities}
           choPhepRong
           enumField="entry_quality"
        />
        <Chon
          ten="in_trade_quality"
           nhan={dich("tradeForm.inTradeQuality")}
          control={control}
          muc={enums.in_trade_qualities}
           choPhepRong
           enumField="in_trade_quality"
        />
        <Chon
          ten="exit_quality"
           nhan={dich("tradeForm.exitQuality")}
          control={control}
          muc={enums.exit_qualities}
           choPhepRong
           enumField="exit_quality"
        />
        <Chon
          ten="psychology"
           nhan={dich("tradeForm.psychology")}
          control={control}
          muc={enums.psychologies}
           choPhepRong
           enumField="psychology"
        />
      </Nhom>

      <div className="flex flex-col gap-1.5">
         <Label htmlFor="notes">{dich("tradeForm.notes")}</Label>
        <Textarea id="notes" {...register("notes")} />
      </div>

      <p className="text-xs text-muted-foreground">
         {dich("tradeForm.emptyReviewHint")}
      </p>

      {loi && (
        <Alert variant="destructive">
          <AlertDescription>{loi}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
         <Button type="submit">{dich("common.save")}</Button>
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
function macDinh(tz: string, chieuMacDinh: string): Fields {
  return {
    entered_at: nowInZone(tz),
    symbol: "",
    direction: chieuMacDinh,
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

function Nhom({ ten, children }: { ten: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {ten}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function O({
  ten,
  nhan,
  loi,
  dangKy,
  loai = "text",
}: {
  ten: string;
  nhan: string;
  loi?: string;
  dangKy: UseFormRegisterReturn;
  loai?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ten}>{nhan}</Label>
      <Input id={ten} type={loai} {...dangKy} />
      {loi && (
        <p role="alert" className="text-sm text-destructive">
          {loi}
        </p>
      )}
    </div>
  );
}

// Radix Select không phải input thật nên register() không gắn vào được —
// phải đi qua Controller. Và nó không nhận Item mang value rỗng, nên "chưa
// chọn" dùng một giá trị canh gác rồi dịch ngược ngay tại chỗ.
const CHUA_CHON = "__chua_chon__";

function Chon({
  ten,
  nhan,
  control,
  muc,
  loi,
  choPhepRong = false,
  enumField,
}: {
  ten: keyof Fields;
  nhan: string;
  control: Control<Fields>;
  muc: string[];
  loi?: string;
  choPhepRong?: boolean;
  enumField: EnumField;
}) {
  const { locale, t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ten}>{nhan}</Label>
      <Controller
        control={control}
        name={ten}
        render={({ field }) => (
          <Select
            value={field.value === "" ? CHUA_CHON : field.value}
            onValueChange={(v) => field.onChange(v === CHUA_CHON ? "" : v)}
          >
            <SelectTrigger id={ten}>
             <SelectValue placeholder={t("tradeForm.choose")} />
            </SelectTrigger>
            <SelectContent>
               {choPhepRong && <SelectItem value={CHUA_CHON}>{t("tradeForm.notRated")}</SelectItem>}
               {muc.map((m) => (
                 <SelectItem key={m} value={m}>
                   {enumLabel(enumField, m, locale, muc)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {loi && (
        <p role="alert" className="text-sm text-destructive">
          {loi}
        </p>
      )}
    </div>
  );
}
