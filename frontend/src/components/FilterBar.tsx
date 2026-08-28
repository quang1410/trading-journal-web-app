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
// filters.ts Ở NGUYÊN features/trades: nó là hợp đồng query của LỆNH, và
// dashboard cũng đang lọc lệnh chứ không lọc thứ gì khác. Chuyển nó ra đây
// sẽ là trao cho component quyền sở hữu thứ nó chỉ mượn.
import { EMPTY_FILTER, type TradeFilter } from "@/features/trades/filters";

// Radix Select không nhận value="" cho một Item (chuỗi rỗng là "chưa chọn"),
// nên mục "bỏ lọc" phải mang một giá trị canh gác rồi dịch ngược lại ở
// onValueChange. Giá trị này KHÔNG bao giờ rời khỏi component.
const ALL = "__tat_ca__";

// Thứ tự hiển thị của các chip đang lọc, kèm cách đọc từng điều kiện thành
// chữ. Một bảng thay cho bảy nhánh if — thêm một bộ lọc là thêm một dòng.
const CONDITION_READERS: ReadonlyArray<{ key: keyof TradeFilter; read: (v: string, locale: "vi" | "en") => string }> = [
  { key: "symbol", read: (v) => v },
  { key: "setup", read: (v) => v },
  { key: "direction", read: (v) => v },
  { key: "timeframe", read: (v) => v },
  { key: "trade_class", read: (v) => v },
  { key: "from", read: (v, locale) => formatDateOnly(v, locale) },
  { key: "to", read: (v, locale) => formatDateOnly(v, locale) },
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

  function setField<K extends keyof TradeFilter>(k: K, v: string) {
    onChange({ ...value, [k]: v });
  }

  const isFiltering = CONDITION_READERS.filter(({ key }) => value[key] !== "");

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <TextField
           label={t("filters.symbol")}
          id="f-symbol"
          value={value.symbol}
          onValue={(v) => setField("symbol", v)}
          icon
        />
        <TextField label={t("filters.setup")} id="f-setup" value={value.setup} onValue={(v) => setField("setup", v)} />
        <DateInput label={t("filters.from")} id="f-from" value={value.from} onValue={(v) => setField("from", v)} />
        <DateInput label={t("filters.to")} id="f-to" value={value.to} onValue={(v) => setField("to", v)} />

        <SelectField
           label={t("filters.direction")}
          id="f-direction"
          value={value.direction}
          item={enums?.directions ?? []}
          onValue={(v) => setField("direction", v)}
        />
        <SelectField
           label={t("filters.timeframe")}
          id="f-timeframe"
          value={value.timeframe}
          item={enums?.timeframes ?? []}
          onValue={(v) => setField("timeframe", v)}
        />
        <SelectField
           label={t("filters.tradeClass")}
          id="f-class"
          value={value.trade_class}
          item={enums?.trade_classes ?? []}
          onValue={(v) => setField("trade_class", v)}
        />
      </div>

      {/* Hàng chip chỉ tồn tại khi có gì để bỏ. Một nút "Xoá lọc" luôn hiện
          trong khi không có bộ lọc nào là một nút không làm gì. */}
      {isFiltering.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
           <span className="eyebrow mr-0.5">{t("trades.filtering")}</span>
           {isFiltering.map(({ key, read }) => (
             <Chip
               key={key}
               label={
                 key === "from"
                   ? t("filters.fromChip", { date: read(value[key], locale) })
                   : key === "to"
                     ? t("filters.toChip", { date: read(value[key], locale) })
                     : key === "direction"
                       ? enumLabel("direction", value[key], locale, enums?.directions)
                       : key === "timeframe"
                         ? enumLabel("timeframe", value[key], locale, enums?.timeframes)
                         : key === "trade_class"
                           ? enumLabel("trade_class", value[key], locale, enums?.trade_classes)
                           : read(value[key], locale)
               }
               // Bỏ một điều kiện tại chỗ. Trước đây muốn bỏ riêng "Long" phải
              // mở dropdown Chiều rồi tìm mục "Tất cả" — ba thao tác cho một
              // ý định, và không nhìn thấy được là mình đang lọc gì.
               onRemove={() => setField(key, "")}
               ariaLabel={t("trades.removeFilter", { value: value[key] })}
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

function Chip({ label, onRemove, ariaLabel }: { label: string; onRemove: () => void; ariaLabel: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-muted pr-1 pl-2 text-xs">
      {label}
      <button
        type="button"
         aria-label={ariaLabel}
        onClick={onRemove}
        className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <XIcon aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}

function TextField({
  label,
  id,
  value,
  onValue,
  kind = "text",
  icon = false,
}: {
  label: string;
  id: string;
  value: string;
  onValue: (v: string) => void;
  kind?: string;
  icon?: boolean;
}) {
  return (
    <div className="relative">
      {/* sr-only chứ không bỏ hẳn: ô date hiện "dd/mm/yyyy" chứ không hiện
          placeholder, nên nếu không có nhãn thì "từ" và "đến" trông y hệt
          nhau — với cả người dùng bàn phím lẫn người dùng chuột. */}
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      {icon && (
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
      )}
      <Input
        id={id}
        type={kind}
        value={value}
        placeholder={label}
        onChange={(e) => onValue(e.target.value)}
        className={icon ? "pl-8" : undefined}
      />
    </div>
  );
}

function DateInput({
  label,
  id,
  value,
  onValue,
}: {
  label: string;
  id: string;
  value: string;
  onValue: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <DatePicker id={id} value={value} onChange={onValue} placeholder={label} ariaLabel={label} />
    </div>
  );
}

function SelectField({
  label,
  id,
  value,
  item,
  onValue,
}: {
  label: string;
  id: string;
  value: string;
  item: string[];
  onValue: (v: string) => void;
}) {
  const { locale, t } = useI18n();
  return (
    <div>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Select value={value === "" ? ALL : value} onValueChange={(v) => onValue(v === ALL ? "" : v)}>
          {/* Chưa chọn gì thì ô hiện TÊN TRƯỜNG chứ không hiện "Tất cả": nhãn đã
            rời khỏi phía trên ô, nên "Tất cả" một mình không nói được đây là
            dropdown của cái gì. */}
        <SelectTrigger id={id} className="w-full">
          {value === "" ? (
         <span className="text-muted-foreground">{label}</span>
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
           <SelectItem value={ALL}>{t("common.all")}</SelectItem>
           {item.map((m) => (
             <SelectItem key={m} value={m}>
               {enumLabel(
                 id === "f-direction" ? "direction" : id === "f-timeframe" ? "timeframe" : "trade_class",
                 m,
                 locale,
                 item,
               )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
