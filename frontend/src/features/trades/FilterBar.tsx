import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMetaEnums } from "@/features/meta/hooks";
import { formatDateOnly } from "@/lib/format";
import { useI18n } from "@/i18n";
import { enumLabel } from "@/i18n/enumLabels";
import { EMPTY_FILTER, type TradeFilter } from "./filters";

// Radix Select không nhận value="" cho một Item (chuỗi rỗng là "chưa chọn"),
// nên mục "bỏ lọc" phải mang một giá trị canh gác rồi dịch ngược lại ở
// onValueChange. Giá trị này KHÔNG bao giờ rời khỏi component.
const TAT_CA = "__tat_ca__";

// Thứ tự hiển thị của các chip đang lọc, kèm cách đọc từng điều kiện thành
// chữ. Một bảng thay cho bảy nhánh if — thêm một bộ lọc là thêm một dòng.
const DOC_DIEU_KIEN: ReadonlyArray<{ khoa: keyof TradeFilter; doc: (v: string, locale: "vi" | "en") => string }> = [
  { khoa: "symbol", doc: (v) => v },
  { khoa: "setup", doc: (v) => v },
  { khoa: "direction", doc: (v) => v },
  { khoa: "timeframe", doc: (v) => v },
  { khoa: "trade_class", doc: (v) => v },
  { khoa: "from", doc: (v, locale) => formatDateOnly(v, locale) },
  { khoa: "to", doc: (v, locale) => formatDateOnly(v, locale) },
];

/**
 * Thanh lọc.
 *
 * Bảy ô xếp thành lưới một hàng, nhãn ẩn khỏi mắt nhưng còn nguyên cho trình
 * đọc màn hình: bản trước để nhãn nổi trên từng ô nên thanh lọc cao gần 150px
 * và đẩy bảng lệnh — thứ người ta vào đây để đọc — xuống dưới nếp gấp màn hình.
 * Chỗ của cái nhãn được trả lại bằng placeholder trong ô và bằng hàng chip
 * bên dưới, vốn nói rõ hơn: nó cho biết ĐANG lọc gì, chứ không chỉ CÓ THỂ lọc gì.
 */
export function FilterBar({
  value,
  onChange,
}: {
  value: TradeFilter;
  onChange: (f: TradeFilter) => void;
}) {
  const { data: enums } = useMetaEnums();
  const { locale, t } = useI18n();

  function dat<K extends keyof TradeFilter>(k: K, v: string) {
    onChange({ ...value, [k]: v });
  }

  const dangLoc = DOC_DIEU_KIEN.filter(({ khoa }) => value[khoa] !== "");

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <OChu
           nhan={t("filters.symbol")}
          id="f-symbol"
          gt={value.symbol}
          dat={(v) => dat("symbol", v)}
          icon
        />
        <OChu nhan={t("filters.setup")} id="f-setup" gt={value.setup} dat={(v) => dat("setup", v)} />
        <Ngay nhan={t("filters.from")} id="f-from" gt={value.from} dat={(v) => dat("from", v)} />
        <Ngay nhan={t("filters.to")} id="f-to" gt={value.to} dat={(v) => dat("to", v)} />

        <OChon
           nhan={t("filters.direction")}
          id="f-direction"
          gt={value.direction}
          muc={enums?.directions ?? []}
          dat={(v) => dat("direction", v)}
        />
        <OChon
           nhan={t("filters.timeframe")}
          id="f-timeframe"
          gt={value.timeframe}
          muc={enums?.timeframes ?? []}
          dat={(v) => dat("timeframe", v)}
        />
        <OChon
           nhan={t("filters.tradeClass")}
          id="f-class"
          gt={value.trade_class}
          muc={enums?.trade_classes ?? []}
          dat={(v) => dat("trade_class", v)}
        />
      </div>

      {/* Hàng chip chỉ tồn tại khi có gì để bỏ. Một nút "Xoá lọc" luôn hiện
          trong khi không có bộ lọc nào là một nút không làm gì. */}
      {dangLoc.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
           <span className="eyebrow mr-0.5">{t("trades.filtering")}</span>
           {dangLoc.map(({ khoa, doc }) => (
             <Chip
               key={khoa}
               nhan={
                 khoa === "from"
                   ? t("filters.fromChip", { date: doc(value[khoa], locale) })
                   : khoa === "to"
                     ? t("filters.toChip", { date: doc(value[khoa], locale) })
                     : khoa === "direction"
                       ? enumLabel("direction", value[khoa], locale, enums?.directions)
                       : khoa === "timeframe"
                         ? enumLabel("timeframe", value[khoa], locale, enums?.timeframes)
                         : khoa === "trade_class"
                           ? enumLabel("trade_class", value[khoa], locale, enums?.trade_classes)
                           : doc(value[khoa], locale)
               }
               // Bỏ một điều kiện tại chỗ. Trước đây muốn bỏ riêng "Long" phải
              // mở dropdown Chiều rồi tìm mục "Tất cả" — ba thao tác cho một
              // ý định, và không nhìn thấy được là mình đang lọc gì.
               onBo={() => dat(khoa, "")}
               ariaLabel={t("trades.removeFilter", { value: value[khoa] })}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-muted-foreground"
            onClick={() => onChange(EMPTY_FILTER)}
          >
             {t("trades.clearFilters")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Chip({ nhan, onBo, ariaLabel }: { nhan: string; onBo: () => void; ariaLabel: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-muted pr-1 pl-2 text-xs">
      {nhan}
      <button
        type="button"
         aria-label={ariaLabel}
        onClick={onBo}
        className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <XIcon aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}

function OChu({
  nhan,
  id,
  gt,
  dat,
  loai = "text",
  icon = false,
}: {
  nhan: string;
  id: string;
  gt: string;
  dat: (v: string) => void;
  loai?: string;
  icon?: boolean;
}) {
  return (
    <div className="relative">
      {/* sr-only chứ không bỏ hẳn: ô date hiện "dd/mm/yyyy" chứ không hiện
          placeholder, nên nếu không có nhãn thì "từ" và "đến" trông y hệt
          nhau — với cả người dùng bàn phím lẫn người dùng chuột. */}
      <Label htmlFor={id} className="sr-only">
        {nhan}
      </Label>
      {icon && (
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
      )}
      <Input
        id={id}
        type={loai}
        value={gt}
        placeholder={nhan}
        onChange={(e) => dat(e.target.value)}
        className={icon ? "pl-8" : undefined}
      />
    </div>
  );
}

function Ngay({
  nhan,
  id,
  gt,
  dat,
}: {
  nhan: string;
  id: string;
  gt: string;
  dat: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="sr-only">
        {nhan}
      </Label>
      <DatePicker id={id} value={gt} onChange={dat} placeholder={nhan} ariaLabel={nhan} />
    </div>
  );
}

function OChon({
  nhan,
  id,
  gt,
  muc,
  dat,
}: {
  nhan: string;
  id: string;
  gt: string;
  muc: string[];
  dat: (v: string) => void;
}) {
  const { locale, t } = useI18n();
  return (
    <div>
      <Label htmlFor={id} className="sr-only">
        {nhan}
      </Label>
      <Select value={gt === "" ? TAT_CA : gt} onValueChange={(v) => dat(v === TAT_CA ? "" : v)}>
          {/* Chưa chọn gì thì ô hiện TÊN TRƯỜNG chứ không hiện "Tất cả": nhãn đã
            rời khỏi phía trên ô, nên "Tất cả" một mình không nói được đây là
            dropdown của cái gì. */}
        <SelectTrigger id={id} className="w-full">
          {gt === "" ? (
         <span className="text-muted-foreground">{nhan}</span>
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
           <SelectItem value={TAT_CA}>{t("common.all")}</SelectItem>
           {muc.map((m) => (
             <SelectItem key={m} value={m}>
               {enumLabel(
                 id === "f-direction" ? "direction" : id === "f-timeframe" ? "timeframe" : "trade_class",
                 m,
                 locale,
                 muc,
               )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
