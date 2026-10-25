import { useEffect, useState, type ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { symbolLabel } from "../engine/csvExport";
import { computeStats, CONTRACT_LIST, CONTRACTS, openPnl, type Contract, type OrderType } from "../engine/trading";
import { tradesCsv } from "../engine/csvExport";
import type { OrderForm } from "../engine/storage";
import { useReplay, useReplayStore } from "../store/context";
import { formatPrice, formatUsd } from "./format";
import { ORDER_TYPE_LABEL } from "./labels";

const ORDER_TYPES: OrderType[] = ["market", "limit", "stop"];
const FIELD_INPUT = "h-8 text-right";

/** Một khối của bảng bên. Các khối ngăn nhau bằng đường kẻ, không lồng thẻ trong thẻ. */
function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-3.5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** Nhãn nằm trên ô nhập để hai ô xếp cạnh nhau được trong bảng hẹp. */
function Field({ label, htmlFor, title, className, children }: { label: string; htmlFor?: string; title?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid gap-1", className)}>
      <Label htmlFor={htmlFor} className="text-xs leading-normal font-normal text-text-muted" title={title}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function NumberField({ id, field, step, placeholder }: { id: string; field: keyof Omit<OrderForm, "contract" | "type">; step?: number; placeholder?: string }) {
  const store = useReplayStore();
  const value = useReplay((s) => s.form[field]);
  return (
    <NumberInput
      id={id}
      min={0}
      step={step}
      placeholder={placeholder}
      className={FIELD_INPUT}
      value={value}
      onValueChange={(v) => store.setForm({ [field]: v })}
    />
  );
}

function OrderCard() {
  const store = useReplayStore();
  const { t } = useI18n();
  const type = useReplay((s) => s.form.type);
  const contract = useReplay((s) => s.form.contract);
  const sym = useReplay((s) => s.panes[s.active].ds);
  return (
    <Section title={t("replay.order.title")} extra={sym && <span className="text-xs font-semibold text-text-muted">{symbolLabel(sym)}</span>}>
      <Segmented
        value={type}
        onChange={(v) => store.setForm({ type: v })}
        options={ORDER_TYPES}
        label={t("replay.order.type")}
        renderOption={(o) => t(ORDER_TYPE_LABEL[o])}
        className="mb-3 p-0.5"
        optionClassName={() => "py-1 text-xs"}
      />
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2.5">
        {type !== "market" && (
          <Field label={t("replay.order.price")} htmlFor="replay-price" className="col-span-2">
            <NumberField id="replay-price" field="price" step={0.25} />
          </Field>
        )}
        <Field label={t("replay.order.contract")}>
          <Select value={contract} onValueChange={(v) => store.setForm({ contract: v as Contract })}>
            <SelectTrigger className="h-8 w-full" aria-label={t("replay.order.contract")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_LIST.map((c) => (
                <SelectItem key={c} value={c}>
                  {t("replay.order.contractOption", { contract: c, pv: CONTRACTS[c] })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("replay.order.qty")} htmlFor="replay-qty">
          <NumberField id="replay-qty" field="qty" step={1} />
        </Field>
        <Field label={t("replay.order.sl")} htmlFor="replay-sl">
          <NumberField id="replay-sl" field="slPts" step={0.25} />
        </Field>
        <Field label={t("replay.order.tp")} htmlFor="replay-tp">
          <NumberField id="replay-tp" field="tpPts" step={0.25} />
        </Field>
        <Field label={t("replay.order.risk")} htmlFor="replay-risk" title={t("replay.order.riskHint")}>
          <NumberField id="replay-risk" field="riskUsd" placeholder={t("replay.order.riskOff")} />
        </Field>
        <Field label={t("replay.order.comm")} htmlFor="replay-comm">
          <NumberField id="replay-comm" field="comm" step={0.1} />
        </Field>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <Button className="h-10 bg-[var(--replay-entry)] font-semibold text-primary-foreground hover:bg-[var(--replay-entry)] hover:opacity-90" onClick={() => store.placeOrder(1)}>
          {t("replay.order.buy")}
        </Button>
        <Button variant="destructive" className="h-10 font-semibold" onClick={() => store.placeOrder(-1)}>
          {t("replay.order.sell")}
        </Button>
      </div>
    </Section>
  );
}

function PositionCard() {
  const store = useReplayStore();
  const { t } = useI18n();
  const pos = useReplay((s) => s.pos);
  const pending = useReplay((s) => s.pending);
  useReplay((s) => s.now); // P&L mở đổi theo giá
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  // ô SL/TP theo lệnh, trừ lúc người dùng đang gõ
  useEffect(() => {
    const a = document.activeElement?.id;
    if (a !== "replay-edit-sl") setSl(pos?.sl != null ? pos.sl.toFixed(2) : "");
    if (a !== "replay-edit-tp") setTp(pos?.tp != null ? pos.tp.toFixed(2) : "");
  }, [pos?.sl, pos?.tp, pos]);

  if (pos) {
    const upnl = openPnl(pos, store.lastPrice(pos.sym));
    const parse = (v: string) => (v.trim() === "" ? null : +v);
    return (
      <Section title={t("replay.pos.title")} extra={<span className="text-xs font-semibold text-text-muted">{symbolLabel(pos.sym)}</span>}>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <b className={pos.side > 0 ? "text-profit" : "text-loss"}>
            {pos.side > 0 ? "LONG" : "SHORT"} {pos.qty} {pos.contract}
          </b>
          <span className="num text-text-muted">@ {formatPrice(pos.entry)}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-xs text-text-muted">{t("replay.pos.openPnl")}</span>
          <b className={cn("num text-xl", upnl >= 0 ? "text-profit" : "text-loss")} data-testid="replay-open-pnl">
            {formatUsd(upnl)}
          </b>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Field label="SL" htmlFor="replay-edit-sl">
            <NumberInput id="replay-edit-sl" min={0} step={0.25} className={FIELD_INPUT} value={sl} onValueChange={setSl} />
          </Field>
          <Field label="TP" htmlFor="replay-edit-tp">
            <NumberInput id="replay-edit-tp" min={0} step={0.25} className={FIELD_INPUT} value={tp} onValueChange={setTp} />
          </Field>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (store.updateSlTp(parse(sl), parse(tp))) (document.activeElement as HTMLElement | null)?.blur();
            }}
          >
            {t("replay.pos.update")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => store.breakEven()}>
            {t("replay.pos.breakEven")}
          </Button>
          <Button variant="destructive" size="sm" className="col-span-2" onClick={() => store.closeNow()}>
            {t("replay.pos.close")}
          </Button>
        </div>
      </Section>
    );
  }
  if (pending) {
    return (
      <Section title={t("replay.pos.title")} extra={<span className="text-xs font-semibold text-text-muted">{symbolLabel(pending.sym)}</span>}>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span>
            <span className="text-text-muted">{t("replay.pos.pending")}</span>{" "}
            <b>{`${pending.side > 0 ? "BUY" : "SELL"} ${pending.type.toUpperCase()}`}</b> {pending.qty} {pending.contract}
          </span>
          <b className="num">{formatPrice(pending.price)}</b>
        </div>
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => store.cancelPending()}>
          {t("replay.pos.cancelPending")}
        </Button>
      </Section>
    );
  }
  return (
    <Section title={t("replay.pos.title")}>
      <p className="-mt-1 text-sm text-text-muted">{t("replay.pos.none")}</p>
    </Section>
  );
}

function StatsCard() {
  const store = useReplayStore();
  const { t } = useI18n();
  const trades = useReplay((s) => s.trades);
  const pos = useReplay((s) => s.pos);
  const balance0 = useReplay((s) => s.form.balance0);
  const zone = useReplay((s) => s.zone);
  useReplay((s) => s.now);
  const st = computeStats(trades, +balance0 || 0, openPnl(pos, pos ? store.lastPrice(pos.sym) : null));
  const dash = "—";
  // ô chưa có số thì để màu chữ thường: một gạch ngang tô xanh/đỏ trông như có kết quả
  const cell = (label: string, value: string | null, cls?: string) => (
    <div key={label} className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className={cn("num text-sm font-medium", value != null && cls)}>{value ?? dash}</dd>
    </div>
  );
  const pf = st.profitFactor == null ? null : Number.isFinite(st.profitFactor) ? st.profitFactor.toFixed(2) : "∞";
  const exportCsv = () => {
    if (!trades.length) return store.notify("replay.toast.nothingToExport");
    // BOM như file backend xuất: không có nó Excel đọc nhầm mã hoá, "Ngày đóng" / "Phí" thành chữ lỗi
    const blob = new Blob(["﻿" + tradesCsv(trades, zone)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trades_${Object.keys(store.ds).map(symbolLabel).join("_").replace(/\W+/g, "_") || "replay"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const tone = (v: number) => (v > 0 ? "text-profit" : v < 0 ? "text-loss" : undefined);
  return (
    <Section title={t("replay.stats.title")}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5" data-testid="replay-stats">
        {cell(t("replay.stats.balance"), formatUsd(st.balance), tone(st.net))}
        {cell(t("replay.stats.equity"), formatUsd(st.equity))}
        {cell(t("replay.stats.net"), formatUsd(st.net), tone(st.net))}
        {cell(t("replay.stats.count"), String(st.count))}
        {cell(t("replay.stats.winRate"), st.winRate == null ? null : `${(st.winRate * 100).toFixed(1)}%`)}
        {cell(t("replay.stats.profitFactor"), pf)}
        {cell(t("replay.stats.avgWin"), st.avgWin == null ? null : formatUsd(st.avgWin), "text-profit")}
        {cell(t("replay.stats.avgLoss"), st.avgLoss == null ? null : formatUsd(st.avgLoss), "text-loss")}
        {cell(t("replay.stats.avgR"), st.avgR == null ? null : `${st.avgR.toFixed(2)}R`)}
        {cell(t("replay.stats.maxDrawdown"), formatUsd(-st.maxDrawdown), st.maxDrawdown ? "text-loss" : undefined)}
      </dl>
      <Field label={t("replay.stats.balance0")} htmlFor="replay-balance0" className="mt-3.5">
        <NumberField id="replay-balance0" field="balance0" step={1000} />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={exportCsv}>
          {t("replay.stats.export")}
        </Button>
        <Button variant="ghost" size="sm" className="text-text-muted" onClick={() => store.resetTrades()}>
          {t("replay.stats.reset")}
        </Button>
      </div>
    </Section>
  );
}

/** Phím tắt và ghi chú về data: gập sẵn, mở ra khi cần. */
function Shortcuts() {
  const { t } = useI18n();
  return (
    <Collapsible className="group px-4 py-3 text-xs leading-relaxed text-text-muted">
      <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 rounded-sm text-sm font-medium text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronRightIcon className="size-4 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" aria-hidden />
        {t("replay.help.title")}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        <p>{t("replay.help.keys")}</p>
        <p>{t("replay.help.tf")}</p>
        <p>{t("replay.help.draw")}</p>
        <p>{t("replay.help.orders")}</p>
        <p>{t("replay.help.data")}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SidePanel() {
  return (
    <aside className="min-h-0 overflow-auto border-border bg-surface-base max-lg:border-t lg:border-l">
      <OrderCard />
      <PositionCard />
      <StatsCard />
      <Shortcuts />
    </aside>
  );
}
