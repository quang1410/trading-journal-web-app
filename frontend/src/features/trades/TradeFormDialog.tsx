import { Loading } from "@/components/Loading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type UseFormRegisterReturn,
} from "react-hook-form";
import { z } from "zod";
import { instantToWall, nowInZone, wallToInstant } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { TemplateMenu } from "@/features/noteTemplates/TemplateMenu";
import { useMetaEnums, type MetaEnums } from "@/features/meta/hooks";
import type { Account } from "@/features/accounts/types";
import { useCreateTrade, useTradeFacets, useUpdateTrade } from "./hooks";
import { suggestProfit } from "./profitSuggestion";
import type { Trade, TradeCreate, TradePatch } from "./types";
import { useI18n, type Translate } from "@/i18n";
import { enumLabel, type EnumField } from "@/i18n/enumLabels";
import { errorMessage } from "@/i18n/errors";
import { cn } from "@/lib/utils";
import { noteToHtml } from "@/lib/richText";
import { useEditorLabels } from "@/components/ui/editorLabels";
import { patchFromDirty } from "@/components/form/patchFromDirty";
import { Field, FieldFoot, FieldLabel } from "@/components/form/Field";
import { SearchableSelect } from "@/components/ui/searchable-select";

// Kiểm số mà KHÔNG ép kiểu: một chuỗi chữ số hợp lệ, cho phép dấu trừ.
// Lãi lỗ âm là bình thường, phí âm cũng không bị backend cấm — FE không
// được bịa thêm ràng buộc backend không có.
const isNumber = (v: string) => /^-?\d*\.?\d+$/.test(v.trim());
const isNumberOrEmpty = (v: string) => v.trim() === "" || isNumber(v);

// Mọi thông điệp dưới đây khớp ràng buộc thật của backend
// (domain.ValidateTrade). Chặn ở client là để phản hồi nhanh, không phải để
// thay.
//
// `profit` và `fee` CHO PHÉP RỖNG, và đó là sửa lỗi chứ không phải nới lỏng:
// domain.ValidateTrade không hề đòi hai trường này, cột NUMERIC NOT NULL của
// chúng nhận 0. Bản trước bắt buộc `profit` nên không ghi nổi một lệnh vừa
// mở — nút ghi "Thêm lệnh", giờ mặc định là bây giờ, mà lại đòi con số chỉ
// có sau khi đóng lệnh. Ô rỗng gửi "0"; xem `zeroIfEmpty`.
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
  profit: z.string().refine(isNumberOrEmpty, t("tradeForm.profitNumber")),
  profit_theory: z.string().refine(isNumberOrEmpty, t("tradeForm.profitTheoryNumber")),
  fee: z.string().refine(isNumberOrEmpty, t("tradeForm.feeNumber")),
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

/** Hai cột NOT NULL: ô rỗng nghĩa là chưa có, mà chưa có tiền thì là 0. */
const zeroIfEmpty = (v: string): string => (v.trim() === "" ? "0" : v.trim());

/** Bốn ô đánh giá, gom một chỗ để đếm và để reset. */
const REVIEW_FIELDS = ["entry_quality", "in_trade_quality", "exit_quality", "psychology"] as const;

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

  // Người dùng đã gõ gì chưa — dialog hỏi lại trước khi vứt đi. Cờ nằm ở đây
  // chứ không trong FormLenh vì chính chỗ này quyết định có đóng hay không,
  // còn form bên trong bị Radix gỡ khỏi cây mỗi lần đóng.
  const [dirty, setDirty] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);

  // Mở lại là một phiên nhập mới: cờ bẩn của lần trước không được dính sang.
  useEffect(() => {
    if (open) setDirty(false);
  }, [open]);

  function requestClose(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    // Chưa gõ gì thì đóng thẳng: hỏi lại một form trống là bắt người dùng
    // trả lời một câu không có nội dung.
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    setAskDiscard(true);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        {/*
          Dialog cao tối đa 90% màn hình và CHÍNH NÓ cuộn, không phải cả trang:
          form này dài hơn một màn hình laptop, và nút Lưu nằm ở đáy một trang
          cuộn thì người dùng phải đi tìm nó. Lưới bên trong tách ba hàng —
          đầu, thân cuộn, chân dính — nên hai đầu luôn nhìn thấy được.

          `sm:max-w-3xl` chứ không phải `max-w-3xl`: lớp nền của DialogContent
          có sẵn `sm:max-w-lg`. Cơ chế là tailwind-merge trong `cn`, không
          phải thứ tự CSS — với lớp trần, tailwind-merge coi hai lớp là khác
          breakpoint nên GIỮ CẢ HAI, và từ 640px nền thắng; chỉ lớp CÙNG
          breakpoint mới xoá được `sm:max-w-lg`. Vì thiếu chữ `sm:` này, form
          đã chạy ở 448px trên màn 1440px suốt từ đầu — mọi ô bị bóp lại còn
          hơn nửa bề ngang nó cần, và đó là lý do thật khiến form trông chật.
        */}
        <DialogContent className="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-3xl">
          {/*
            Tiêu đề và mô tả nằm trong header; phần huy hiệu trạng thái do
            TradeForm vẽ vì chỉ nó mới biết người dùng đã điền lãi/lỗ chưa.
            `pr-14` chừa chỗ cho nút đóng của Radix ở góc phải.
          */}
          <DialogHeader className="border-b border-border px-6 pt-6 pb-4 pr-14">
            <DialogTitle>
              {trade ? t("tradeForm.editTitle", { stt: trade.stt }) : t("tradeForm.addTitle")}
            </DialogTitle>
            {/*
              Không liệt kê lại ba ô bắt buộc ở đây: cả ba đã mang dấu sao đỏ
              ngay trên chính chúng, và nhắc lần thứ hai ở đầu dialog bắt
              người dùng ghi nhớ một danh sách rồi tự đối chiếu xuống dưới —
              trong khi thứ họ cần chỉ là nhìn thấy dấu sao lúc đi tới ô đó.
              Mô tả nói việc cần làm tiếp theo thay vì nhắc luật.
            */}
            <DialogDescription>
              {trade ? t("tradeForm.editSubtitle") : t("tradeForm.addSubtitle")}
            </DialogDescription>
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
          {open && enums === undefined && (
            <div className="px-6 py-6">
              <Loading row={4} />
            </div>
          )}
          {open && enums !== undefined && (
            <TradeForm
              account={account}
              trade={trade}
              enums={enums}
              onDirtyChange={setDirty}
              onDone={() => onOpenChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={askDiscard} onOpenChange={setAskDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tradeForm.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("tradeForm.discardBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("tradeForm.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAskDiscard(false);
                onOpenChange(false);
              }}
            >
              {t("tradeForm.discardConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TradeForm({
  account,
  trade,
  enums,
  onDone,
  onDirtyChange,
}: {
  account: Account;
  trade?: Trade;
  enums: MetaEnums;
  onDone: () => void;
  onDirtyChange: (v: boolean) => void;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const { locale, t: translate } = useI18n();
  const create = useCreateTrade(account.id);
  const update = useUpdateTrade(account.id);
  // Setup và mã sản phẩm người dùng đã dùng, để chọn lại thay vì gõ lại. Gõ
  // "Breakout" hôm nay và "breakout" ngày mai là hai nhóm trong thống kê, và
  // không có gì báo cho người dùng biết điều đó.
  const { data: facets } = useTradeFacets(account.id);
  const editorLabels = useEditorLabels();
  // Tăng lên mỗi lần xoá form để dựng lại ô soạn thảo — xem chú thích ở chỗ
  // dùng nó bên dưới.
  const [editorKey, setEditorKey] = useState(0);
  const symbolRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, dirtyFields, isDirty, isSubmitting },
  } = useForm<Fields>({
    resolver: zodResolver(makeSchema(translate)),
    // Kiểm lúc RỜI Ô, không dồn tới lúc bấm Lưu: bản trước để mặc định
    // ("onSubmit") nên người dùng điền hết mười sáu ô rồi mới biết ô thứ hai
    // sai. Sau lần submit đầu thì đổi sang kiểm mỗi lần gõ, để chữ đỏ biến
    // mất ngay khi họ sửa xong chứ không đợi rời ô lần nữa.
    mode: "onBlur",
    reValidateMode: "onChange",
    // `enums` chắc chắn đã có: TradeFormDialog không dựng component này cho
    // tới khi /meta/enums về. Nhờ vậy mặc định tính đúng ngay lần đầu, không
    // cần effect nào reset lại form.
    defaultValues: trade
      ? fromTrade(trade, account.timezone)
      : defaults(account.timezone, enums.directions[0] ?? ""),
  });

  // Báo lên dialog cha để nó biết có phải hỏi lại trước khi đóng không.
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  /**
   * Chèn một mẫu ghi chú bằng cách NỐI HTML rồi bump editorKey.
   *
   * RichTextEditor là component KHÔNG kiểm soát: nó đọc defaultValue đúng một
   * lần lúc dựng và không có API nào chèn từ ngoài vào. Dựng lại editor là cơ
   * chế sẵn có của form này (xem editorKey ở nút "Lưu và thêm tiếp"), nên chèn
   * mẫu dùng lại đúng nó thay vì mở một API mệnh lệnh mới trên một component
   * dùng chung đã đủ tinh tế.
   *
   * Nối vào CUỐI, không thay thế: chữ người dùng đã gõ không bao giờ mất. Và
   * vì nối vào cuối nên không cần biết con trỏ đang ở đâu — đó chính là điều
   * kiện để việc dựng lại editor không làm mất gì.
   *
   * shouldDirty BẮT BUỘC: patchFromDirty chỉ gửi những field đã dirty, nên
   * thiếu cờ này thì sửa một lệnh cũ sẽ KHÔNG lưu được ghi chú vừa chèn, và
   * không có lỗi nào bật ra.
   */
  function insertTemplate(bodyHtml: string) {
    const current = getValues("notes");
    setValue("notes", current === "" ? bodyHtml : current + bodyHtml, { shouldDirty: true });
    setEditorKey((k) => k + 1);
  }

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
    profit: (x: string) => ({ key: "profit" as const, value: zeroIfEmpty(x) }),
    profit_theory: (x: string) => ({ key: "profit_theory" as const, value: emptyToNull(x) }),
    fee: (x: string) => ({ key: "fee" as const, value: zeroIfEmpty(x) }),
    setup: (x: string) => ({ key: "setup" as const, value: x.trim() }),
    timeframe: (x: string) => ({ key: "timeframe" as const, value: x }),
    entry_quality: (x: string) => ({ key: "entry_quality" as const, value: x }),
    in_trade_quality: (x: string) => ({ key: "in_trade_quality" as const, value: x }),
    exit_quality: (x: string) => ({ key: "exit_quality" as const, value: x }),
    psychology: (x: string) => ({ key: "psychology" as const, value: x }),
    // Editor đã trả "" cho ô rỗng và đã lọc thẻ; ở đây chỉ cắt trắng hai đầu.
    notes: (x: string) => ({ key: "notes" as const, value: x.trim() }),
  };

  // Nhập nhiều lệnh một lượt: giữ dialog mở, xoá phần riêng của lệnh vừa lưu
  // nhưng GIỮ LẠI thời điểm, chiều, mã sản phẩm, khung thời gian và setup —
  // một phiên giao dịch thường lặp đúng những thứ đó, bắt gõ lại là bắt làm
  // lại việc vừa làm.
  const keepOpenRef = useRef(false);

  async function submit(v: Fields) {
    setErrorMsg(null);
    setSavedMsg(null);
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
      if (keepOpenRef.current) {
        reset({
          ...v,
          entry: "",
          exit: "",
          volume: "",
          profit: "",
          profit_theory: "",
          notes: "",
          entry_quality: "",
          in_trade_quality: "",
          exit_quality: "",
          psychology: "",
        });
        setEditorKey((k) => k + 1);
        setSavedMsg(translate("tradeForm.savedToast", { symbol: v.symbol.trim() }));
        symbolRef.current?.focus();
        return;
      }
      onDone();
    } catch (e) {
      setErrorMsg(errorMessage(e, locale, translate));
    } finally {
      keepOpenRef.current = false;
    }
  }

  const submitOnce = handleSubmit(submit);
  const saveAndNew = () => {
    keepOpenRef.current = true;
    return submitOnce();
  };

  // Cmd/Ctrl+Enter lưu từ bất cứ ô nào, kể cả ô ghi chú nhiều dòng nơi Enter
  // xuống dòng chứ không gửi.
  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submitOnce();
    }
  }

  const symbolReg = register("symbol");
  // Nút "Mã đã dùng" cần biết ô đang mang gì để tô đúng mục đang chọn.
  const watchedSymbol = useWatch({ control, name: "symbol" }) ?? "";
  // Có lãi/lỗ nghĩa là lệnh đã đóng. Một chỗ tính, hai chỗ dùng: huy hiệu
  // trạng thái ở đầu form và câu dặn của băng "Đóng lệnh".
  const closed = (useWatch({ control, name: "profit" }) ?? "").trim() !== "";

  return (
    <form
      onSubmit={submitOnce}
      onKeyDown={onKeyDown}
      className="contents"
      noValidate
    >
      <div className="scroll-hairline flex flex-col overflow-y-auto">
        {/*
          Hai băng theo VÒNG ĐỜI của lệnh chứ không theo cột của bảng tính.
          "Lệnh" và "Tiền" là tên hai nhóm cột trong file Excel gốc; chúng
          không nói gì với người đang nhập. "Mở lệnh" và "Đóng lệnh" thì nói
          đúng một điều có ích: băng dưới CHƯA cần điền nếu lệnh còn đang
          chạy, và đó chính là câu hỏi khiến người dùng ngần ngừ ở form cũ.
        */}
        <Band
          label={translate("tradeForm.openBand")}
          state={<TradeState closed={closed} />}
        >
          <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="entered-at" label={translate("tradeForm.enteredAt")} required />
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
              <FieldFoot errorId="entered-at-error" errorMsg={errors.entered_at?.message} />
            </div>
            {/*
              Mã sản phẩm có gợi ý từ những mã ĐÃ dùng, cùng lý do như setup:
              gõ tay mỗi lần là cách chắc chắn nhất để "XAUUSD" và "xauusd"
              thành hai nhóm trong thống kê. Danh sách này backend đã trả sẵn
              trong /trades/facets, form cũ chỉ chưa dùng tới.
            */}
            <PickableField
              name="symbol"
              label={translate("tradeForm.symbol")}
              required
              errorMsg={errors.symbol?.message}
              placeholder={translate("tradeForm.symbolPlaceholder")}
              options={facets?.symbols ?? []}
              pickLabel={translate("tradeForm.symbolPick")}
              value={watchedSymbol}
              onPick={(v) => setValue("symbol", v, { shouldDirty: true, shouldValidate: true })}
              register={{
                ...symbolReg,
                ref: (el: HTMLInputElement | null) => {
                  symbolReg.ref(el);
                  symbolRef.current = el;
                },
              }}
              // Chỉ in hoa CHỮ ĐÃ GÕ, không đụng placeholder: `uppercase`
              // trần biến "Ví dụ: XAUUSD" thành "VÍ DỤ: XAUUSD", tức là quát
              // vào mặt người dùng một câu gợi ý.
              inputClassName="uppercase placeholder:normal-case"
            />
          </div>

          {/*
            Chiều lệnh là câu hỏi hệ trọng nhất của cả form và chỉ có hai đáp
            án — giấu nó sau một dropdown là bắt trả hai lần bấm để trả lời
            một câu nhị phân, đồng thời che mất đáp án còn lại. Bày ngang, tô
            đúng hai màu mà cả app đã dùng cho lãi và lỗ.
          */}
          <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <DirectionField
              control={control}
              options={enums.directions}
              errorMsg={errors.direction?.message}
              onChange={(v) => setValue("direction", v, { shouldDirty: true, shouldValidate: true })}
            />
            <TimeframeField
              control={control}
              options={enums.timeframes}
              onChange={(v) => setValue("timeframe", v, { shouldDirty: true })}
            />
          </div>

          <SetupField
            control={control}
            options={facets?.setups ?? []}
            errorMsg={errors.setup?.message}
            onPick={(v) => setValue("setup", v, { shouldDirty: true })}
            register={register("setup")}
          />
        </Band>

        {/*
          Câu "chưa đóng thì để trống" chỉ đúng khi lệnh CHƯA đóng. Để nó nằm
          đó sau khi người dùng đã điền lãi/lỗ là dặn họ làm một việc họ vừa
          làm xong — nên nó biến mất đúng lúc nó hết đúng.
        */}
        <Band
          label={translate("tradeForm.closeBand")}
          note={closed ? undefined : translate("tradeForm.closeBandOptional")}
        >
          {/*
            Ba ô giá đứng cùng một hàng vì chúng là MỘT phép tính: giá vào,
            giá ra, khối lượng cho ra lãi/lỗ. Form cũ rải chúng qua hai hàng
            hai cột nên quan hệ ấy biến mất, và ô gợi ý "Từ giá" ở dưới không
            còn chỉ vào đâu cả.
          */}
          <div className="grid grid-cols-2 items-start gap-x-4 gap-y-4 sm:grid-cols-3">
            <Field
              name="entry"
              label={translate("tradeForm.entry")}
              errorMsg={errors.entry?.message}
              register={register("entry")}
              inputMode="decimal"
              numeric
            />
            <Field
              name="exit"
              label={translate("tradeForm.exit")}
              errorMsg={errors.exit?.message}
              register={register("exit")}
              inputMode="decimal"
              numeric
            />
            <Field
              name="volume"
              label={translate("tradeForm.volume")}
              errorMsg={errors.volume?.message}
              register={register("volume")}
              inputMode="decimal"
              numeric
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-3">
            <ProfitField
              control={control}
              errorMsg={errors.profit?.message}
              register={register("profit")}
              currency={account.currency}
              longValue={enums.directions[0] ?? ""}
              onUse={(v) => setValue("profit", v, { shouldDirty: true, shouldValidate: true })}
              current={() => getValues("profit")}
            />
            <Field
              name="fee"
              label={translate("tradeForm.fee")}
              errorMsg={errors.fee?.message}
              register={register("fee")}
              unit={account.currency}
              hint={translate("tradeForm.feeHint")}
              inputMode="decimal"
              numeric
            />
            <Field
              name="profit_theory"
              label={translate("tradeForm.profitTheory")}
              errorMsg={errors.profit_theory?.message}
              register={register("profit_theory")}
              unit={account.currency}
              hint={translate("tradeForm.profitTheoryHint")}
              inputMode="decimal"
              numeric
            />
          </div>
        </Band>

        {/*
          Băng thứ ba KHÔNG có nhãn "Đánh giá" in hoa như hai băng trên: chấm
          điểm và ghi chú đều là việc làm SAU, và cả hai đã tự nói ra điều đó
          bằng chữ trên chính chúng.
        */}
        <div className="flex flex-col gap-4 border-t border-border px-6 py-5">
          <ReviewGroup control={control} enums={enums} hasTrade={Boolean(trade)} />

          <div className="flex flex-col gap-1.5">
            {/*
              Nút chèn mẫu nằm CÙNG HÀNG với nhãn, căn phải: nó là việc làm
              trước khi gõ ghi chú, nên đặt ở nơi mắt đã hướng tới khi bắt đầu
              điền ô này.
            */}
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="notes">{translate("tradeForm.notes")}</Label>
              <TemplateMenu onInsert={insertTemplate} />
            </div>
          {/*
            Ô soạn thảo là component KHÔNG kiểm soát (xem RichTextEditor), nên
            nó không nhận `register` mà đi qua Controller như Radix Select.
            `defaultValue` đọc một lần lúc dựng; ghi chú cũ ở dạng text thuần
            được `noteToHtml` bọc thành đoạn văn để mở lên đúng.
          */}
            <Controller
              control={control}
              name="notes"
              render={({ field }) => (
                <RichTextEditor
                  // `key` đổi sau mỗi lần "Lưu và thêm tiếp" để React DỰNG LẠI
                  // editor. Bắt buộc phải có: RichTextEditor là component không
                  // kiểm soát, nó đọc `defaultValue` đúng một lần lúc dựng, nên
                  // `reset()` của react-hook-form xoá giá trị trong form mà
                  // không chạm được vào nội dung Quill đang hiển thị — ghi chú
                  // của lệnh vừa lưu sẽ nằm nguyên đó và đi theo lệnh kế tiếp.
                  key={editorKey}
                  id="notes"
                  defaultValue={noteToHtml(field.value)}
                  onChange={field.onChange}
                  placeholder={translate("tradeForm.notesPlaceholder")}
                  ariaLabel={translate("tradeForm.notes")}
                  labels={editorLabels}
                />
              )}
            />
          </div>

          {errorMsg && (
            <Alert variant="destructive">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/*
        Chân form DÍNH và có viền trên: hai nút lưu phải luôn nhìn thấy được,
        không phải cuộn xuống mới gặp.
      */}
      <DialogFooter className="flex-row items-center gap-3 border-t border-border bg-surface-raised px-4 py-3 sm:justify-between sm:px-6 sm:py-4">
        {/*
          `aria-live`: sau khi "Lưu và thêm tiếp" xoá form, thứ duy nhất báo
          rằng lệnh ĐÃ lưu là dòng này. Không có nó thì người dùng trình đọc
          màn hình chỉ thấy form trống trơn và không biết chuyện gì xảy ra.
        */}
        <p aria-live="polite" className="sr-only text-xs text-muted-foreground sm:not-sr-only">
          {savedMsg}
        </p>
        <div className="flex flex-1 gap-2 sm:flex-none">
          {/* Chỉ khi TẠO MỚI: sửa một lệnh rồi "thêm tiếp" là hai việc khác nhau. */}
          {!trade && (
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={saveAndNew}
              className="flex-1 sm:flex-none"
            >
              {translate("tradeForm.saveAndNew")}
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting} className="flex-1 sm:flex-none">
            {isSubmitting ? translate("tradeForm.saving") : translate("common.save")}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

/**
 * Ô lãi lỗ, kèm gợi ý tính từ giá vào, giá ra và khối lượng.
 *
 * Gợi ý chỉ ĐỀ NGHỊ, không bao giờ tự ghi vào ô — xem profitSuggestion.ts.
 * Nó THAY CHỖ câu gợi ý tĩnh chứ không xếp thêm một dòng nữa: hai câu chồng
 * nhau dưới cùng một ô thì cả hai đều bị đọc lướt, và ô bên cạnh bị đẩy lệch
 * theo. Câu tĩnh nói về ô lúc rỗng, gợi ý nói về đúng ba con số vừa nhập —
 * cái cụ thể hơn thắng.
 *
 * Gợi ý cũng biến mất khi ô đã mang đúng con số đó: một nút không làm gì cả
 * vẫn mời người ta bấm.
 */
function ProfitField({
  control,
  errorMsg,
  register,
  currency,
  longValue,
  onUse,
  current,
}: {
  control: Control<Fields>;
  errorMsg?: string;
  register: UseFormRegisterReturn;
  currency: string;
  longValue: string;
  onUse: (v: string) => void;
  current: () => string;
}) {
  const { t } = useI18n();
  const [entry, exit, volume, direction, profit] = useWatch({
    control,
    name: ["entry", "exit", "volume", "direction", "profit"],
  });
  const suggestion = suggestProfit({
    entry: entry ?? "",
    exit: exit ?? "",
    volume: volume ?? "",
    direction: direction ?? "",
    longValue,
  });
  // `profit` đọc qua useWatch chỉ để component vẽ lại khi ô đổi; giá trị thật
  // lấy từ current() để không lệ thuộc thứ tự cập nhật của react-hook-form.
  void profit;
  const show = suggestion !== null && current().trim() !== suggestion;
  const shown = show ? `${suggestion} ${currency}` : "";

  return (
    <Field
      name="profit"
      label={t("tradeForm.profit")}
      errorMsg={errorMsg}
      register={register}
      unit={currency}
      inputMode="decimal"
      numeric
      hint={
        show ? (
          <button
            type="button"
            onClick={() => onUse(suggestion)}
            aria-label={t("tradeForm.suggestProfitAria", { value: shown })}
            className="cursor-pointer rounded-md text-left text-xs text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {t("tradeForm.suggestProfit", { value: shown })} · {t("tradeForm.useSuggestion")}
          </button>
        ) : (
          // Không lặp lại "chưa đóng thì để trống" ở đây: câu đó đã là lời
          // của CẢ băng "Đóng lệnh". Nói hai lần thì cả hai lần đều bị lướt.
          undefined
        )
      }
    />
  );
}

/**
 * Ô setup: nhập tự do, kèm danh sách đã dùng để chọn lại.
 *
 * Người dùng đặt tên setup của riêng họ, nên đây là ô tự do chứ không phải
 * enum. Nhưng gõ lại bằng tay mỗi lần là cách chắc chắn nhất để "Breakout" và
 * "breakout" thành hai nhóm trong thống kê.
 */
function SetupField({
  control,
  options,
  errorMsg,
  onPick,
  register,
}: {
  control: Control<Fields>;
  options: string[];
  errorMsg?: string;
  onPick: (v: string) => void;
  register: UseFormRegisterReturn;
}) {
  const { t } = useI18n();
  const value = useWatch({ control, name: "setup" }) ?? "";
  return (
    <PickableField
      name="setup"
      label={t("tradeForm.setup")}
      errorMsg={errorMsg}
      placeholder={t("tradeForm.setupPlaceholder")}
      options={options}
      pickLabel={t("tradeForm.pickSetup")}
      value={value}
      onPick={onPick}
      register={register}
      hint={options.length > 0 ? t("tradeForm.setupHint") : undefined}
    />
  );
}

/**
 * Bốn ô chấm điểm, GẬP LẠI khi chưa dùng tới.
 *
 * Lệnh chưa đánh giá là trạng thái hợp lệ (quyết định #8 của spec mẹ), và
 * ngay sau khi đóng lệnh thì phần lớn người dùng chưa chấm điểm. Bốn ô "Chưa
 * đánh giá" xếp thẳng đứng chiếm gần nửa form để nói đúng một điều: chưa có
 * gì ở đây. Gập lại thì phần bắt buộc lên trên màn hình đầu tiên.
 *
 * Mở sẵn khi ĐANG SỬA một lệnh đã chấm: giấu đi mất chính là thứ người ta mở
 * form ra để xem.
 */
function ReviewGroup({
  control,
  enums,
  hasTrade,
}: {
  control: Control<Fields>;
  enums: MetaEnums;
  hasTrade: boolean;
}) {
  const { t } = useI18n();
  const values = useWatch({ control, name: [...REVIEW_FIELDS] });
  const scored = values.filter((v) => (v ?? "") !== "").length;
  const [open, setOpen] = useState(hasTrade && scored > 0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  return (
    <section className="rounded-md border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="review-fields"
        onClick={() => {
          const next = !open;
          setOpen(next);
          // Nhóm nằm gần đáy form; mở ra mà không cuộn thì người dùng chỉ
          // thấy hai chữ ló lên ở mép dưới và tưởng nút không ăn.
          if (next) {
            requestAnimationFrame(() =>
              panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
            );
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-4 py-3 text-left outline-none hover:bg-interactive-bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{t("tradeForm.reviewToggle")}</span>
          <span className="text-xs text-muted-foreground">{t("tradeForm.reviewHint")}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
          {t("tradeForm.reviewScored", { count: String(scored) })}
        </span>
      </button>
      {/*
        `hidden` chứ không phải gỡ khỏi cây: các ô vẫn đăng ký với form, nên
        gập lại giữa chừng không xoá mất điểm vừa chấm.
      */}
      <div
        id="review-fields"
        ref={panelRef}
        hidden={!open}
        className="grid grid-cols-1 gap-3 border-t border-border px-4 py-4 sm:grid-cols-2"
      >
        <EnumSelect
          name="entry_quality"
          label={t("tradeForm.entryQuality")}
          control={control}
          item={enums.entry_qualities}
          allowEmpty
          enumField="entry_quality"
        />
        <EnumSelect
          name="in_trade_quality"
          label={t("tradeForm.inTradeQuality")}
          control={control}
          item={enums.in_trade_qualities}
          allowEmpty
          enumField="in_trade_quality"
        />
        <EnumSelect
          name="exit_quality"
          label={t("tradeForm.exitQuality")}
          control={control}
          item={enums.exit_qualities}
          allowEmpty
          enumField="exit_quality"
        />
        <EnumSelect
          name="psychology"
          label={t("tradeForm.psychology")}
          control={control}
          item={enums.psychologies}
          allowEmpty
          enumField="psychology"
        />
      </div>
    </section>
  );
}

/**
 * Giá trị mặc định khi thêm lệnh mới.
 *
 * `defaultDirection` là phần tử đầu của /meta/enums chứ không phải chuỗi
 * "Long" chép cứng — spec §8 đòi mặc định là `directions[0]`, và chép cứng sẽ
 * vướng cổng styleguard lẫn quy tắc 5 của CLAUDE.md.
 *
 * `fee` để RỖNG chứ không phải "0": ô rỗng vẫn gửi "0" (zeroIfEmpty), nhưng
 * một ô mang sẵn số 0 trông như đã điền và người dùng lướt qua nó.
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
    fee: "",
    entry_quality: "",
    in_trade_quality: "",
    exit_quality: "",
    psychology: "",
    notes: "",
  };
}

function fromTrade(t: Trade, tz: string): Fields {
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

/**
 * Một băng của form, đặt tên theo một MỐC trong vòng đời của lệnh.
 *
 * Băng ngăn nhau bằng đường kẻ chạy hết bề ngang chứ không bằng khoảng trắng:
 * form này có mười sáu ô, và khoảng trắng đơn thuần không nói được ô nào
 * thuộc nhóm nào khi người dùng cuộn tới giữa chừng.
 *
 * `note` là câu nói cho cả băng — dùng đúng một lần, ở băng "Đóng lệnh", để
 * nói rằng cả băng đó có thể bỏ trống. Đặt ở đây thay vì lặp lại dưới từng ô
 * là cách duy nhất nói điều đó MỘT lần.
 */
function Band({
  label,
  note,
  state,
  children,
}: {
  label: string;
  note?: string;
  state?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-4 border-b border-border px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <legend className="eyebrow float-left">{label}</legend>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {state}
      </div>
      {children}
    </fieldset>
  );
}

/**
 * Huy hiệu "Đang mở / Đã đóng", suy từ chính ô lãi/lỗ.
 *
 * Đây là câu trả lời cho nỗi ngần ngừ thật của người dùng ở form cũ: "chưa
 * biết lãi lỗ thì tôi có được bấm Lưu không?". Form cũ trả lời bằng cách
 * KHÔNG báo lỗi, tức là không trả lời gì cả — người dùng phải bấm thử mới
 * biết. Ở đây trạng thái được nói thẳng ra trước khi họ phải hỏi.
 *
 * Không phải một ô nhập: người dùng không chọn trạng thái này, nó là hệ quả
 * của những gì họ đã điền. Vì thế nó chỉ đọc, và `aria-live` để trình đọc
 * màn hình biết nó vừa đổi.
 */
function TradeState({ closed }: { closed: boolean }) {
  const { t } = useI18n();
  return (
    <p
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        closed
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border-strong bg-surface-sunken text-muted-foreground",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", closed ? "bg-primary" : "bg-current")} />
      {closed ? t("tradeForm.stateClosed") : t("tradeForm.stateOpen")}
      <span className="sr-only">
        {" — "}
        {closed ? t("tradeForm.stateClosedHint") : t("tradeForm.stateOpenHint")}
      </span>
    </p>
  );
}

/**
 * Chiều lệnh: hai ô bày ngang, tô đúng hai màu mà cả app dùng cho lãi và lỗ.
 *
 * Rơi về Select khi danh sách KHÔNG phải hai lựa chọn. Ràng buộc "Long hoặc
 * Short" là của backend (`/meta/enums`), không phải của component này, nên
 * component không được chết cứng vào con số hai — nếu ngày nào đó backend
 * thêm một chiều thứ ba, ô này tự quay về dropdown thay vì vỡ giao diện.
 */
function DirectionField({
  control,
  options,
  errorMsg,
  onChange,
}: {
  control: Control<Fields>;
  options: string[];
  errorMsg?: string;
  onChange: (v: string) => void;
}) {
  const { locale, t } = useI18n();
  const value = useWatch({ control, name: "direction" }) ?? "";

  if (options.length !== 2) {
    return (
      <EnumSelect
        name="direction"
        label={t("tradeForm.direction")}
        control={control}
        item={options}
        errorMsg={errorMsg}
        enumField="direction"
        required
      />
    );
  }

  const [long] = options;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1">
        <span id="direction-label" className="text-sm font-medium">
          {t("tradeForm.direction")}
        </span>
        <span aria-hidden className="leading-none text-destructive">
          *
        </span>
      </span>
      <Segmented
        id="direction"
        value={value}
        options={options}
        onChange={onChange}
        ariaLabelledBy="direction-label"
        renderOption={(o) => enumLabel("direction", o, locale, options)}
        optionClassName={(o, selected) =>
          selected
            ? o === long
              ? "bg-primary/12 text-primary"
              : "bg-destructive/12 text-destructive"
            : undefined
        }
      />
      <FieldFoot errorId="direction-error" errorMsg={errorMsg} />
    </div>
  );
}

/**
 * Khung thời gian: tám lựa chọn ngắn, bày hết ra một hàng.
 *
 * Thêm một ô "—" ở đầu cho "không ghi": bỏ trống là trạng thái hợp lệ, và
 * người đã lỡ chọn M15 phải có đường quay lại. Ở dropdown việc đó là một mục
 * trong danh sách; ở đây phải là một ô thật.
 */
function TimeframeField({
  control,
  options,
  onChange,
}: {
  control: Control<Fields>;
  options: string[];
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const value = useWatch({ control, name: "timeframe" }) ?? "";
  const all = ["", ...options];
  return (
    <div className="flex flex-col gap-1.5">
      <span id="timeframe-label" className="text-sm font-medium">
        {t("tradeForm.timeframe")}
      </span>
      <Segmented
        id="timeframe"
        value={value}
        options={all}
        onChange={onChange}
        ariaLabelledBy="timeframe-label"
        renderOption={(o) => (o === "" ? <span aria-label={t("tradeForm.noTimeframe")}>—</span> : o)}
        className="overflow-x-auto"
        optionClassName={(o) => (o === "" ? "shrink-0 grow-0 px-2" : "px-1.5")}
      />
    </div>
  );
}

/**
 * Ô nhập tự do kèm nút chọn lại giá trị đã dùng.
 *
 * Dùng cho mã sản phẩm và setup. Hai lối vào cùng một giá trị nên phải cùng
 * MỘT ô nhập — bày một Input và một Select cạnh nhau như hai ô riêng thì
 * người dùng phải đoán cái nào thắng.
 */
function PickableField({
  name,
  label,
  required = false,
  errorMsg,
  placeholder,
  options,
  pickLabel,
  value,
  onPick,
  register,
  hint,
  inputClassName,
}: {
  name: string;
  label: string;
  required?: boolean;
  errorMsg?: string;
  placeholder?: string;
  options: string[];
  pickLabel: string;
  value: string;
  onPick: (v: string) => void;
  register: UseFormRegisterReturn;
  hint?: string;
  inputClassName?: string;
}) {
  const { t } = useI18n();
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = errorMsg ? `${name}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={name} label={label} required={required} />
      <div className="flex gap-2">
        <Input
          id={name}
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={Boolean(errorMsg)}
          aria-required={required || undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          className={cn("min-w-0 flex-1", inputClassName)}
          {...register}
        />
        {/* Nút chọn chỉ hiện khi CÓ giá trị cũ: danh sách rỗng thì nút mở nó
            chỉ là một lời hứa suông. */}
        {options.length > 0 && (
          <div className="w-32 shrink-0 sm:w-36">
            <SearchableSelect
              id={`${name}-picker`}
              value={options.includes(value) ? value : ""}
              options={options}
              onValueChange={onPick}
              placeholder={t("tradeForm.choose")}
              triggerLabel={pickLabel}
              searchPlaceholder={t("tradeForm.searchSetup")}
              emptyMessage={t("tradeForm.setupEmpty")}
            />
          </div>
        )}
      </div>
      <FieldFoot hintId={hintId} hint={hint} errorId={errorId} errorMsg={errorMsg} />
    </div>
  );
}

// Radix Select không phải input thật nên register() không gắn vào được —
// phải đi qua Controller. Và nó không nhận Item mang value rỗng, nên "chưa
// chọn" dùng một giá trị canh gác rồi dịch ngược ngay tại chỗ.
const NOT_SELECTED = "__not_selected__";

function EnumSelect({
  name,
  label,
  control,
  item,
  errorMsg,
  allowEmpty = false,
  emptyLabel,
  enumField,
  required = false,
}: {
  name: keyof Fields;
  label: string;
  control: Control<Fields>;
  item: string[];
  errorMsg?: string;
  allowEmpty?: boolean;
  /**
   * Chữ cho mục "chưa chọn". Mặc định là "Chưa đánh giá", đúng cho bốn ô
   * chấm điểm nhưng SAI cho khung thời gian — một lệnh không ghi khung thời
   * gian thì không phải là lệnh "chưa được đánh giá".
   */
  emptyLabel?: string;
  enumField: EnumField;
  required?: boolean;
}) {
  const { locale, t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={name} label={label} required={required} />
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={field.value === "" ? NOT_SELECTED : field.value}
            onValueChange={(v) => field.onChange(v === NOT_SELECTED ? "" : v)}
          >
            <SelectTrigger id={name} aria-invalid={Boolean(errorMsg)} aria-required={required || undefined}>
              <SelectValue placeholder={t("tradeForm.choose")} />
            </SelectTrigger>
            <SelectContent>
              {allowEmpty && (
                <SelectItem value={NOT_SELECTED}>{emptyLabel ?? t("tradeForm.notRated")}</SelectItem>
              )}
              {item.map((m) => (
                <SelectItem key={m} value={m}>
                  {enumLabel(enumField, m, locale, item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldFoot errorId={`${name}-error`} errorMsg={errorMsg} />
    </div>
  );
}
