import { useState } from "react";
import { ArrowLeftIcon, FileUpIcon, FolderOpenIcon } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { symbolLabel } from "../engine/csvExport";
import { fmtLocal, toLocal } from "../engine/time";
import { useReplay, useReplayStore } from "../store/context";
import { formatUsd } from "./format";
import { ZONE_LABEL } from "./labels";
import { useFilePicker } from "./TopBar";

const day = (t: number) => fmtLocal(t).slice(0, 10);

/**
 * Màn hình chọn phiên, phủ cả vùng dưới thanh trên. Phiên đã lưu đứng trước vì "làm tiếp" là việc
 * hay làm nhất; bắt đầu phiên mới (data mặc định, data giả lập, CSV của mình) ở dưới.
 */
export function SessionScreen() {
  const store = useReplayStore();
  const { t } = useI18n();
  const sessions = useReplay((s) => s.sessions);
  const blocked = useReplay((s) => s.sessionsBlocked);
  const current = useReplay((s) => s.session?.id);
  const def = useReplay((s) => s.defaultInfo);
  const hasData = useReplay((s) => s.names.length > 0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const csv = useFilePicker("new");

  return (
    <div className="absolute inset-0 z-[8] overflow-auto bg-surface-base" data-testid="replay-sessions">
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        {hasData && (
          <Button variant="ghost" size="sm" className="-ml-2.5 mb-3 text-text-muted" onClick={() => store.backToChart()}>
            <ArrowLeftIcon aria-hidden />
            {t("replay.sessions.back")}
          </Button>
        )}
        <h2 className="text-xl font-semibold text-foreground">{t("replay.sessions.title")}</h2>

        {!!sessions?.length && (
          <section className="mt-6">
            <h3 className="mb-2 text-sm font-medium text-text-muted">{t("replay.sessions.saved")}</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3" data-testid="replay-session">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sm font-medium text-foreground">{s.title}</b>
                      {current === s.id && <span className="rounded-full border border-primary px-2 text-xs text-profit">{t("replay.sessions.open")}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {t("replay.sessions.summary", {
                        names: s.dataNames.map(symbolLabel).join(" + "),
                        at: `${fmtLocal(toLocal(s.t, s.settings.zone))} ${t(ZONE_LABEL[s.settings.zone])}`,
                        n: s.nTrades,
                      })}{" "}
                      · <span className={cn("num font-medium", s.net > 0 ? "text-profit" : s.net < 0 ? "text-loss" : undefined)}>{formatUsd(s.net)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" onClick={() => void store.resume(s.id)} data-resume={s.id}>
                      {t("replay.sessions.resume")}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-text-muted" onClick={() => setConfirmId(s.id)}>
                      {t("common.delete")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h3 className="mb-2 text-sm font-medium text-text-muted">{t("replay.sessions.new")}</h3>
          <div className="flex flex-wrap gap-2">
            {def && (
              <Button onClick={() => void store.openDefault()}>
                {t("replay.sessions.openDefault", { names: def.names.map(symbolLabel).join(" + "), from: day(def.from), to: day(def.to) })}
              </Button>
            )}
            <Button variant="outline" onClick={() => void store.openDemo()}>
              {t("replay.sessions.demo")}
            </Button>
          </div>
          <div className="mt-3 flex flex-col items-start gap-3 rounded-lg border border-dashed border-border-strong px-4 py-4 sm:flex-row sm:items-center">
            <FileUpIcon className="size-6 shrink-0 text-text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t("replay.sessions.dropTitle")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{t("replay.sessions.dropHint")}</p>
            </div>
            <Button variant="outline" size="sm" title={t("replay.top.openCsvHint")} onClick={csv.open}>
              <FolderOpenIcon aria-hidden />
              {t("replay.top.openCsv")}
            </Button>
            {csv.input}
          </div>
          {blocked && <p className="mt-3 text-xs text-text-muted">{t("replay.sessions.blocked")}</p>}
        </section>
      </div>
      <AlertDialog open={confirmId != null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("replay.sessions.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("replay.sessions.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmId) void store.deleteSession(confirmId);
                setConfirmId(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
