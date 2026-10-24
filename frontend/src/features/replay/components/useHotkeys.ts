import { useEffect, useRef, useState } from "react";
import { isTimeframe, parseTf, TIMEFRAMES, tfLabel } from "../engine/tf";
import type { ReplayStore } from "../store/ReplayStore";

const TF_WAIT = 1500;

/**
 * Phím tắt của trang replay (giống TradingView / FX Replay). Trả về chuỗi khung đang gõ để hiện ô
 * nhỏ giữa chart.
 *
 * - Gõ khung: 1 → 1m, 15, 1h / h1 / 60 → 1H, 4h, d → D. Enter đổi ngay, hoặc chờ 1,5 giây. Đang
 *   gõ mà bấm phím khác thì huỷ luôn và không làm gì thêm, để không lỡ tay đặt lệnh.
 * - Alt (Option trên Mac) + T / H / J / F / Shift+R / R: công cụ vẽ. Đọc e.code vì Option đổi ký tự.
 * - ⌘/Ctrl+Z hoàn tác, ⌘/Ctrl+Shift+Z hoặc Ctrl+Y làm lại. ⌘/Ctrl+C / V chép và dán hình vẽ.
 * - Space phát/dừng, → tiến 1 bước, Shift+→ hết nến chart, B mua, S bán, X đóng lệnh,
 *   Delete xoá hình đang chọn, Esc huỷ công cụ.
 */
export function useHotkeys(store: ReplayStore): string {
  const [buf, setBuf] = useState("");
  const bufRef = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const setText = (s: string) => {
      bufRef.current = s;
      setBuf(s);
      if (timer.current) clearTimeout(timer.current);
      timer.current = s ? setTimeout(apply, TF_WAIT) : null;
    };
    function apply() {
      const s = bufRef.current;
      setText("");
      const tf = parseTf(s);
      if (tf == null) return;
      if (!isTimeframe(tf)) return store.notify("replay.toast.noSuchTf", { tf: s, list: TIMEFRAMES.map(tfLabel).join(", ") });
      store.setPaneTf(tf);
    }
    const onKey = (e: KeyboardEvent) => {
      // một control đã tự xử lý phím này (vd ← → trên thanh chia chart): không làm thêm việc của replay
      if (e.defaultPrevented) return;
      const st = store.getState();
      if (st.settingsOpen || st.navOpen || st.drawDialog != null || st.screen !== "chart") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable)) return;
      // phím mũi tên trong nhóm chọn khung / danh sách / thanh chia chart là việc của control đó
      if (el?.closest('[role="radiogroup"],[role="listbox"],[role="menu"],[role="dialog"],[role="separator"]')) return;
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      const mod = e.ctrlKey || e.metaKey;
      if (bufRef.current) {
        e.preventDefault();
        if (e.key === "Enter") apply();
        else if (e.key === "Backspace") setText(bufRef.current.slice(0, -1));
        else if (plain && /^[0-9mhd]$/i.test(e.key)) {
          if (bufRef.current.length < 4) setText(bufRef.current + e.key);
        } else if (!["Shift", "CapsLock"].includes(e.key)) setText("");
        return;
      }
      if (plain && store.hasData && /^[0-9mhd]$/i.test(e.key)) {
        e.preventDefault();
        return setText(e.key);
      }
      if (mod && !e.altKey && e.code === "KeyZ") {
        e.preventDefault();
        return e.shiftKey ? store.redo() : store.undo();
      }
      if (e.ctrlKey && !e.metaKey && e.code === "KeyY") {
        e.preventDefault();
        return store.redo();
      }
      // ⌘/Ctrl+C chép hình đang chọn, ⌘/Ctrl+V dán vào mã của chart đang chọn
      // đang bôi đen chữ (bảng lệnh, nhãn…) thì ⌘C là chép chữ đó, không phải chép hình
      if (mod && !e.altKey && !e.shiftKey && e.code === "KeyC" && st.selected != null && !window.getSelection()?.toString()) {
        e.preventDefault();
        return store.copyDrawing(st.selected);
      }
      if (mod && !e.altKey && !e.shiftKey && e.code === "KeyV") {
        e.preventDefault();
        return store.pasteDrawing(st.panes[st.active].ds);
      }
      if (e.altKey && !mod && store.hasData) {
        const tools = { KeyT: "trend", KeyJ: "hray", KeyF: "fib" } as const;
        const tool = tools[e.code as keyof typeof tools];
        if (tool) {
          e.preventDefault();
          return store.setTool(st.tool === tool ? null : tool);
        }
        if (e.code === "KeyH") {
          e.preventDefault();
          return store.setDrawMode(!st.drawMode);
        }
        if (e.code === "KeyR") {
          e.preventDefault();
          if (e.shiftKey) return store.setTool(st.tool === "rect" ? null : "rect");
          return store.fitCharts();
        }
      }
      if (e.key === "Escape") {
        if (st.draft) {
          if (st.draft.d.type === "path") store.finishPath();
          else store.cancelDraft();
        }
        store.setTool(null);
        store.setSelectMode(false);
        store.setDrawMode(false);
        store.select(null);
      } else if (e.key === "Enter" && st.draft?.d.type === "path") store.finishPath();
      else if ((e.key === "Delete" || e.key === "Backspace") && st.selected != null) {
        e.preventDefault();
        store.deleteSelected();
      } else if (e.code === "Space") {
        e.preventDefault();
        store.togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) store.nextCandle();
        else store.stepOnce();
      } else if (plain && (e.key === "b" || e.key === "B")) store.placeOrder(1);
      else if (plain && (e.key === "s" || e.key === "S")) store.placeOrder(-1);
      else if (plain && (e.key === "x" || e.key === "X")) store.closeNow();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [store]);

  return buf;
}
