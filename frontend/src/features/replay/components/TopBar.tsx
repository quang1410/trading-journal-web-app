import { useEffect, useRef, useState } from "react";
import { Columns2Icon, DatabaseIcon, FolderOpenIcon, HistoryIcon, PlusIcon, SettingsIcon, ShuffleIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n";
import { symbolLabel } from "../engine/csvExport";
import { TIMEFRAMES, tfLabel } from "../engine/tf";
import { toInputValue } from "../engine/time";
import { useReplay, useReplayStore } from "../store/context";
import { formatCount } from "./format";

const LAYOUTS = ["1", "2"] as const;

/** Hộp chọn file CSV ẩn. Nút mở nó nằm ở chỗ khác (menu Dữ liệu, màn hình phiên). */
export function useFilePicker(mode: "new" | "add") {
  const store = useReplayStore();
  const ref = useRef<HTMLInputElement | null>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept=".csv,text/csv"
      multiple
      hidden
      data-testid={`replay-file-${mode}`}
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        if (files.length) void store.openFiles(files, mode);
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

/** Ô ngày giờ: chỉ cho chọn trong phạm vi data của mã đang chọn; tự điền giờ replay. */
function SeekBox() {
  const store = useReplayStore();
  const { t } = useI18n();
  const sessionId = useReplay((s) => s.session?.id);
  const sym = useReplay((s) => s.panes[s.active].ds);
  useReplay((s) => s.zone);
  const [value, setValue] = useState("");
  const fill = () => setValue(toInputValue(store.localNow()));
  // mở phiên khác thì điền lại giờ replay của phiên đó
  useEffect(() => {
    if (sessionId) setValue(toInputValue(store.localNow()));
  }, [sessionId, store]);
  const d = sym ? store.ds[sym] : undefined;
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("replay.seek.label")}>
      <Input
        type="datetime-local"
        aria-label={t("replay.seek.label")}
        title={t("replay.seek.hint")}
        className="h-8 w-[13.5rem] text-sm tabular-nums"
        min={d ? toInputValue(d.LT[0]) : undefined}
        max={d ? toInputValue(d.LT[d.n - 1]) : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            store.seekDate(value);
          }
        }}
      />
      <Button variant="outline" size="sm" onClick={() => store.seekDate(value)}>
        {t("replay.seek.go")}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("replay.seek.randomHint")}
        title={t("replay.seek.randomHint")}
        onClick={() => {
          store.randomSeek();
          fill();
        }}
      >
        <ShuffleIcon aria-hidden />
      </Button>
    </div>
  );
}

/** Menu Dữ liệu: data đang mở (số nến mỗi mã), mở CSV thành phiên mới, thêm mã vào phiên. */
function DataMenu() {
  const { t } = useI18n();
  const names = useReplay((s) => s.names);
  const counts = useReplay((s) => s.counts);
  const loading = useReplay((s) => s.loading);
  const fresh = useFilePicker("new");
  const add = useFilePicker("add");
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" title={t("replay.top.dataHint")}>
            <DatabaseIcon aria-hidden />
            {t("replay.top.data")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <div className="px-2 py-1.5 text-xs text-text-muted" data-testid="replay-data-info">
            {loading
              ? t(loading)
              : names.length
                ? names.map((n) => (
                    <div key={n} className="num">
                      {t("replay.top.barCount", { symbol: symbolLabel(n), n: formatCount(counts[n] ?? 0) })}
                    </div>
                  ))
                : t("replay.top.noData")}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={fresh.open} title={t("replay.top.openCsvHint")}>
            <FolderOpenIcon aria-hidden />
            {t("replay.top.openCsv")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={add.open} disabled={!names.length} title={t("replay.top.addSymbolHint")}>
            <PlusIcon aria-hidden />
            {t("replay.top.addSymbol")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {fresh.input}
      {add.input}
    </>
  );
}

/**
 * Thanh trên của trang replay, chia theo việc: bên trái là chart (mã, khung, số chart), giữa là
 * thời điểm replay, bên phải là indicator, phiên, dữ liệu, cài đặt. Công cụ vẽ nằm ở thanh dọc
 * cạnh chart; hợp đồng nằm ở ô đặt lệnh; múi giờ nằm trong Cài đặt.
 */
export function TopBar() {
  const store = useReplayStore();
  const { t } = useI18n();
  const names = useReplay((s) => s.names);
  const pane = useReplay((s) => s.panes[s.active]);
  const layout = useReplay((s) => s.layout);
  const ictOn = useReplay((s) => s.ict.on);
  const hasData = names.length > 0;
  const sep = <span className="mx-1 hidden h-5 border-l border-border sm:block" aria-hidden />;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-b border-border bg-surface-base px-3 py-2" role="toolbar" aria-label={t("replay.top.label")}>
      <Select value={pane.ds ?? ""} onValueChange={(v) => store.setPaneSymbol(v)} disabled={!hasData}>
        <SelectTrigger className="h-8 w-auto min-w-28 font-semibold" aria-label={t("replay.top.symbol")}>
          <SelectValue placeholder={t("replay.top.symbol")} />
        </SelectTrigger>
        <SelectContent>
          {names.map((n) => (
            <SelectItem key={n} value={n}>
              {symbolLabel(n)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Segmented
        value={String(pane.tf)}
        onChange={(v) => store.setPaneTf(+v)}
        options={TIMEFRAMES.map(String)}
        label={t("replay.top.timeframe")}
        renderOption={(v) => tfLabel(+v)}
        className="w-auto p-0.5"
        optionClassName={() => "flex-none px-2 py-1 text-xs"}
      />
      <Segmented
        value={String(layout)}
        onChange={(v) => store.setLayout(v === "2" ? 2 : 1)}
        options={LAYOUTS}
        label={t("replay.top.layoutHint")}
        renderOption={(v) =>
          v === "1" ? (
            <SquareIcon className="size-4" aria-label={t("replay.top.oneChart")} />
          ) : (
            <Columns2Icon className="size-4" aria-label={t("replay.top.twoCharts")} />
          )
        }
        className="w-auto p-0.5"
        optionClassName={() => "flex-none px-1.5 py-1"}
      />
      {sep}
      <SeekBox />
      <div className="flex items-center gap-1.5 sm:ml-auto">
        <Button variant={ictOn ? "default" : "outline"} size="sm" aria-pressed={ictOn} title={t("replay.top.ictHint")} onClick={() => store.toggleIct()}>
          ICT
        </Button>
        {sep}
        <Button variant="ghost" size="sm" onClick={() => void store.showSessions()}>
          <HistoryIcon aria-hidden />
          {t("replay.top.sessions")}
        </Button>
        <DataMenu />
        <Button variant="ghost" size="icon-sm" aria-label={t("replay.top.settings")} title={t("replay.top.settings")} onClick={() => store.openSettings()}>
          <SettingsIcon aria-hidden />
        </Button>
      </div>
    </div>
  );
}
