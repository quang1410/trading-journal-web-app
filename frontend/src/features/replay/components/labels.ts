import type { TranslationKey } from "@/i18n/strings";
import type { DrawTool } from "../engine/drawings";
import type { LineStyle } from "../engine/ict";
import type { NavAction } from "../engine/nav";
import type { Zone } from "../engine/time";
import type { ExitReason, OrderType } from "../engine/trading";

/** Mã → khoá chuỗi hiển thị. Gom một chỗ để mọi khoá đều được kiểm kiểu lúc biên dịch. */
export const ZONE_LABEL: Record<Zone, TranslationKey> = { NY: "replay.zone.NY", VN: "replay.zone.VN", UTC: "replay.zone.UTC" };
export const ZONE_LONG_LABEL: Record<Zone, TranslationKey> = { NY: "replay.zoneLong.NY", VN: "replay.zoneLong.VN", UTC: "replay.zoneLong.UTC" };

export const NAV_LABEL: Record<NavAction, TranslationKey> = {
  nextSession: "replay.nav.nextSession", nextSilverBullet: "replay.nav.nextSilverBullet", asian: "replay.nav.asian", london: "replay.nav.london",
  ny: "replay.nav.ny", dayOpen: "replay.nav.dayOpen", sbLondon: "replay.nav.sbLondon", sbNyAm: "replay.nav.sbNyAm", sbNyPm: "replay.nav.sbNyPm",
};

export const REASON_LABEL: Record<ExitReason, TranslationKey> = {
  sl: "replay.reason.sl", tp: "replay.reason.tp", slGap: "replay.reason.slGap", tpGap: "replay.reason.tpGap", manual: "replay.reason.manual",
};

export const ORDER_TYPE_LABEL: Record<OrderType, TranslationKey> = {
  market: "replay.order.market", limit: "replay.order.limit", stop: "replay.order.stop",
};

export const TOOL_LABEL: Record<DrawTool, TranslationKey> = {
  trend: "replay.tool.trend", rect: "replay.tool.rect", hray: "replay.tool.hray", brush: "replay.tool.brush", path: "replay.tool.path",
  fib: "replay.tool.fib", long: "replay.tool.long", short: "replay.tool.short", text: "replay.tool.text",
};

/** Tên hình (tiêu đề cửa sổ Cài đặt), khác chú thích công cụ ở thanh vẽ (có phím tắt). */
export const TOOL_NAME: Record<DrawTool, TranslationKey> = {
  trend: "replay.dw.nameTrend", rect: "replay.dw.nameRect", hray: "replay.dw.nameHray", brush: "replay.dw.nameBrush", path: "replay.dw.namePath",
  fib: "replay.dw.nameFib", long: "replay.dw.nameLong", short: "replay.dw.nameShort", text: "replay.dw.nameText",
};

export const LINE_STYLE_LABEL: Record<LineStyle, TranslationKey> = {
  solid: "replay.lineStyle.solid", dotted: "replay.lineStyle.dotted", dashed: "replay.lineStyle.dashed",
};
