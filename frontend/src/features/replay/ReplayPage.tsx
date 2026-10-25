import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { ChartPane } from "./chart/ChartPane";
import { DrawToolbar } from "./components/DrawToolbar";
import { NavDialog } from "./components/NavDialog";
import { TextEditor, TfBox } from "./components/PaneWidgets";
import { DrawingBar } from "./components/drawing/DrawingBar";
import { DrawingDialog } from "./components/drawing/DrawingDialog";
import { ReplayBar } from "./components/ReplayBar";
import { SessionScreen } from "./components/SessionScreen";
import { SettingsDialog } from "./components/SettingsDialog";
import { SidePanel } from "./components/SidePanel";
import { clampSplit, SplitHandle } from "./components/SplitHandle";
import { Toast } from "./components/Toast";
import { TopBar } from "./components/TopBar";
import { TradeTable } from "./components/TradeTable";
import { useHotkeys } from "./components/useHotkeys";
import { ReplayProvider, useReplay, useReplayStore } from "./store/context";
import { ReplayStore, type PaneIndex } from "./store/ReplayStore";
import { readPref } from "./engine/storage";
import "./replay.css";

/**
 * Trang /replay: tua lại thị trường NQ/ES bằng nến 1 phút để luyện vào lệnh (kiểu FX Replay).
 * Mọi thứ chạy trong trình duyệt; phiên lưu ở IndexedDB, không gửi lên backend.
 */
export function ReplayPage({ store: injected }: { store?: ReplayStore }) {
  const [store] = useState(() => injected ?? new ReplayStore());
  useEffect(() => {
    void store.start();
    // chỉ ở bản dev: để kiểm tra / gỡ lỗi từ console (bản build production bỏ hẳn đoạn này)
    if (import.meta.env.DEV) Object.assign(window, { __replayStore: store });
    const onHide = () => store.backup();
    const onVisibility = () => {
      if (document.hidden) store.backup();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      store.dispose();
    };
  }, [store]);
  return (
    <ReplayProvider store={store}>
      <ReplayLayout />
    </ReplayProvider>
  );
}

function ReplayLayout() {
  const store = useReplayStore();
  const { t } = useI18n();
  const screen = useReplay((s) => s.screen);
  const layout = useReplay((s) => s.layout);
  const active = useReplay((s) => s.active);
  const hasData = useReplay((s) => s.names.length > 0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  // bố cục 2 chart: phần bề ngang của chart trái (kéo tay nắm ở giữa để đổi)
  const [split, setSplit] = useState(() => clampSplit(readPref("split", 0.5)));
  const tfText = useHotkeys(store);
  const panes: PaneIndex[] = layout === 2 ? [0, 1] : [0];

  // thả file lên chart đang mở = thêm mã; thả lên màn hình chọn phiên = phiên mới
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    if (files.length) void store.openFiles(files, hasData && screen === "chart" ? "add" : "new");
  };

  // Bố cục: thanh trên; dưới là [thanh vẽ dọc | chart, bảng lệnh dưới chart] và bảng bên cao hết
  // cỡ. Màn hình phiên / đang tải phủ cả vùng dưới thanh trên; bảng bên và bảng lệnh không render
  // lúc đó, để không đặt lệnh được khi không thấy chart. Chart vẫn giữ để khỏi dựng lại.
  return (
    <div className="replay-root grid grid-rows-[auto_minmax(0,1fr)] bg-surface-base">
      <h1 className="sr-only">{t("replay.title")}</h1>
      <TopBar />
      <div
        className={cn("relative grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]", dragging && "outline-2 -outline-offset-8 outline-dashed outline-primary")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto]">
          <div className="flex min-h-[70svh] lg:min-h-[360px]">
            <DrawToolbar />
            <div ref={wrapRef} className="relative min-w-0 flex-1 overflow-hidden">
              <div
                className={cn(
                  "absolute inset-0 grid gap-px bg-border",
                  layout === 2 ? "grid-cols-1 grid-rows-2 md:grid-cols-[minmax(0,var(--split))_minmax(0,1fr)] md:grid-rows-1" : "grid-cols-1",
                )}
                style={{ "--split": `${split * 100}%` } as CSSProperties}
              >
                {panes.map((k) => (
                  <ChartPane key={k} k={k}>
                    {(proj) => (
                      <>
                        <DrawingBar k={k} proj={proj} />
                        <TextEditor k={k} />
                        {tfText && active === k && <TfBox text={tfText} />}
                      </>
                    )}
                  </ChartPane>
                ))}
              </div>
              {layout === 2 && <SplitHandle split={split} onChange={setSplit} containerRef={wrapRef} />}
              {screen === "chart" && <ReplayBar wrapRef={wrapRef} />}
            </div>
          </div>
          {screen === "chart" && <TradeTable />}
        </div>
        {screen === "chart" && <SidePanel />}
        {screen === "sessions" && <SessionScreen />}
        {screen === "loading" && (
          <div className="absolute inset-0 z-[8] flex items-center justify-center bg-surface-base text-sm text-text-muted" role="status">
            {t("replay.status.loadingDefault")}
          </div>
        )}
      </div>
      <SettingsDialog />
      <NavDialog />
      <DrawingDialog />
      <Toast />
    </div>
  );
}
