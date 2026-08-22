import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMetaEnums } from "@/features/meta/hooks";
import { EMPTY_FILTER, type TradeFilter } from "./filters";

// Radix Select không nhận value="" cho một Item (chuỗi rỗng là "chưa chọn"),
// nên mục "bỏ lọc" phải mang một giá trị canh gác rồi dịch ngược lại ở
// onValueChange. Giá trị này KHÔNG bao giờ rời khỏi component.
const TAT_CA = "__tat_ca__";

export function FilterBar({
  value,
  onChange,
}: {
  value: TradeFilter;
  onChange: (f: TradeFilter) => void;
}) {
  const { data: enums } = useMetaEnums();

  function dat<K extends keyof TradeFilter>(k: K, v: string) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <OChu nhan="Từ ngày" id="f-from" loai="date" gt={value.from} dat={(v) => dat("from", v)} />
      <OChu nhan="Đến ngày" id="f-to" loai="date" gt={value.to} dat={(v) => dat("to", v)} />
      <OChu nhan="Mã sản phẩm" id="f-symbol" gt={value.symbol} dat={(v) => dat("symbol", v)} />
      {/* Setup do người dùng tự đặt tên, backend không có danh sách hợp lệ,
          nên đây là ô chữ tự do chứ không phải dropdown. */}
      <OChu nhan="Setup" id="f-setup" gt={value.setup} dat={(v) => dat("setup", v)} />

      <OChon
        nhan="Chiều"
        id="f-direction"
        gt={value.direction}
        muc={enums?.directions ?? []}
        dat={(v) => dat("direction", v)}
      />
      <OChon
        nhan="Khung thời gian"
        id="f-timeframe"
        gt={value.timeframe}
        muc={enums?.timeframes ?? []}
        dat={(v) => dat("timeframe", v)}
      />
      <OChon
        nhan="Phân loại"
        id="f-class"
        gt={value.trade_class}
        muc={enums?.trade_classes ?? []}
        dat={(v) => dat("trade_class", v)}
      />

      <Button variant="outline" onClick={() => onChange(EMPTY_FILTER)}>
        Xoá lọc
      </Button>
    </div>
  );
}

function OChu({
  nhan,
  id,
  gt,
  dat,
  loai = "text",
}: {
  nhan: string;
  id: string;
  gt: string;
  dat: (v: string) => void;
  loai?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{nhan}</Label>
      <Input id={id} type={loai} value={gt} onChange={(e) => dat(e.target.value)} />
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
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{nhan}</Label>
      <Select value={gt === "" ? TAT_CA : gt} onValueChange={(v) => dat(v === TAT_CA ? "" : v)}>
        <SelectTrigger id={id} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TAT_CA}>Tất cả</SelectItem>
          {muc.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
