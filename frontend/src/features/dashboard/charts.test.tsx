import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { tuFrontend } from "@/test/paths";
import { taoCharts } from "@/test/tradeFactory";
import { DailyPnlChart } from "./DailyPnlChart";
import { RDistributionChart } from "./RDistributionChart";
import { ScoreRadarBlock } from "./ScoreRadarBlock";
import { TheoryVsActualChart } from "./TheoryVsActualChart";
import { WeekdayChart } from "./WeekdayChart";

const c = taoCharts();

test("WeekdayChart giữ đủ bảy ngày, kể cả ngày không có lệnh", () => {
  render(<WeekdayChart rows={c.by_weekday} currency="USD" />);

  // Backend luôn trả đủ Mon..Sun. Lọc bỏ ngày count = 0 làm biểu đồ mất cột,
  // và một cột VẮNG MẶT trông khác hẳn một cột BẰNG 0 — cái sau là thông tin.
  const ngay = screen.getAllByRole("rowheader").map((e) => e.textContent);
  expect(ngay).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
});

test("WeekdayChart tách phần lãi và phần lỗ thành hai cột đọc được", () => {
  render(<WeekdayChart rows={c.by_weekday} currency="USD" />);

  // Hai chuỗi thì danh tính KHÔNG được để màu gánh một mình. Hai cột tiêu đề
  // của bảng là bản đọc được của legend.
  expect(screen.getByRole("columnheader", { name: "Phần lãi" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Phần lỗ" })).toBeInTheDocument();
});

test("DailyPnlChart bày cả net từng ngày lẫn giá trị lũy kế", () => {
  render(<DailyPnlChart rows={c.by_day} currency="USD" />);

  // Fixture có hai ngày: 09/06 net 98 cum 98, 10/06 net -51 cum 47.
  const hang = screen.getAllByRole("row");
  expect(hang).toHaveLength(3); // 1 hàng tiêu đề + 2 ngày

  // Khoanh theo hàng chứ không tìm "47" trên cả bảng: formatMoney nối đơn vị
  // tiền vào sau nên ô thật sự chứa "47 USD".
  const ngayHai = within(screen.getByRole("row", { name: /2026-06-10/ }));
  expect(ngayHai.getByText(/^47 USD$/)).toBeInTheDocument();
  expect(ngayHai.getByText(/^-51 USD$/)).toBeInTheDocument();
});

test("cả hai xử lý mảng rỗng mà không ném", () => {
  render(
    <>
      <WeekdayChart rows={[]} currency="USD" />
      <DailyPnlChart rows={[]} currency="USD" />
    </>,
  );
  expect(screen.getAllByText(/chưa có lệnh nào/i)).toHaveLength(2);
});

test("RDistributionChart bày đủ 22 cột, không cắt bớt bucket rỗng", () => {
  render(<RDistributionChart rows={c.r_distribution} />);
  expect(screen.getAllByRole("rowheader")).toHaveLength(22);
});

test("RDistributionChart nêu tên biểu đồ cho trình đọc màn hình", () => {
  render(<RDistributionChart rows={c.r_distribution} />);
  expect(screen.getByRole("heading", { name: "Phân phối R" })).toBeInTheDocument();
  expect(screen.getByRole("figure")).toHaveAccessibleName(/Phân phối R/);
});

test("RDistributionChart cuối dashboard dùng phần chiều cao còn lại trên desktop", () => {
  render(<RDistributionChart rows={c.r_distribution} />);
  const heading = screen.getByRole("heading", { name: "Phân phối R" });
  expect(heading.closest("section")).toHaveClass("lg:min-h-[calc(100dvh-5rem)]");
  expect(screen.getByRole("figure")).toHaveClass("lg:h-[calc(100dvh-8rem)]");
});

test("RDistributionChart: bucket rỗng ra lời nhắn, không ra khung trống", () => {
  const rong = c.r_distribution.map((b) => ({ ...b, count: 0, wins: 0, losses: 0 }));
  render(<RDistributionChart rows={rong} />);
  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

test("RDistributionChart: bảng đọc được ghi đúng wins/losses của từng bucket", () => {
  render(<RDistributionChart rows={c.r_distribution} />);
  // Hàng "0R to 1R" theo fixture: count=1, wins=1, losses=0 — cả count và
  // wins đều hiện chữ "1" nên getByText("1") mập mờ; đọc theo thứ tự CỘT
  // (label, count, wins, losses) qua getAllByRole("cell") thay vì đoán text.
  const hangLai = within(screen.getByRole("row", { name: /0R to 1R/ }));
  const oCot = hangLai.getAllByRole("cell").map((o) => o.textContent);
  expect(oCot).toEqual(["1", "1", "0"]); // count, wins, losses
});

test("ScoreRadarBlock bày điểm trung bình và số lệnh đã chấm", () => {
  render(<ScoreRadarBlock score={c.score} radar={c.radar} />);
  // formatRatio đi qua Intl.NumberFormat("vi-VN", ...) — locale mặc định "vi"
  // dùng dấu PHẨY thập phân, nên "62.5" hiện thành "62,5", không phải "62.5".
  expect(screen.getByRole("group", { name: "Chất lượng lệnh" })).toHaveTextContent("62,5");
  expect(screen.getByText(/2 lệnh đã chấm điểm/)).toBeInTheDocument();
});

test("ScoreRadarBlock nêu tên radar cho trình đọc màn hình", () => {
  render(<ScoreRadarBlock score={c.score} radar={c.radar} />);
  expect(screen.getByRole("figure")).toHaveAccessibleName(/Radar tâm lý/);
});

// BẤT BIẾN SỐ 6: score null ra "—", KHÔNG ra 0.
test("ScoreRadarBlock: chưa lệnh nào được chấm ra dấu — chứ không phải 0 điểm", () => {
  render(<ScoreRadarBlock score={{ scored_count: 0, avg_score_total: null }} radar={{
    avg_entry: null, avg_in_trade: null, avg_exit: null, avg_psych: null,
  }} />);
  const o = screen.getByRole("group", { name: "Chất lượng lệnh" });
  expect(o).toHaveTextContent("—");
  // "chưa chấm" và "chấm được 0 điểm" là hai câu chuyện khác nhau; hiện 0 ở
  // đây là bịa ra một lời phán xét chưa ai đưa ra.
  expect(o).not.toHaveTextContent("0");
  expect(screen.getByText(/chưa lệnh nào được chấm điểm/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

// BẤT BIẾN §6: chưa chấm ở MỘT trục khác được 0 điểm ở trục đó — phải có ghi
// chú riêng, không lặng lẽ vẽ như thể là 0.
test("ScoreRadarBlock: một vài trục null thì hiện lời nhắc, không lẫn vào 0 điểm", () => {
  const radarThieu = { avg_entry: "20", avg_in_trade: null, avg_exit: "15", avg_psych: "10" };
  render(<ScoreRadarBlock score={{ scored_count: 3, avg_score_total: "45" }} radar={radarThieu} />);
  expect(screen.getByRole("note")).toBeInTheDocument();
});

test("ScoreRadarBlock: đủ bốn trục thì không có lời nhắc thừa", () => {
  render(<ScoreRadarBlock score={c.score} radar={c.radar} />);
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});

// Trục radar CỐ ĐỊNH [0, 25] — mỗi score_* tối đa 25 điểm (plan §2.1-2.4).
// Bỏ domain thì Recharts tự co trục theo dữ liệu và vẽ 5/5/5/5 giống hệt
// 25/25/25/25: một tài khoản kém trông cân đối y như một tài khoản hoàn hảo.
// Recharts không vẽ trong jsdom nên không assert lên SVG được — cổng này đọc
// thẳng mã nguồn, chấp nhận là cổng thô còn hơn để bất biến không ai canh.
test("PolarRadiusAxis ghim domain [0, 25], không để Recharts tự co", () => {
  const src = readFileSync(tuFrontend("src/features/dashboard/ScoreRadarBlock.tsx"), "utf8");
  expect(src).toMatch(/domain=\{\[0,\s*25\]\}/);
});

test("TheoryVsActualChart nêu tên biểu đồ cho trình đọc màn hình", () => {
  render(<TheoryVsActualChart rows={c.theory_vs_actual} currency="USD" />);
  expect(screen.getByRole("heading", { name: "Lý thuyết vs thực tế" })).toBeInTheDocument();
  expect(screen.getByRole("figure")).toHaveAccessibleName(/Lý thuyết vs thực tế/);
});

test("TheoryVsActualChart: mảng rỗng ra lời nhắn, không ra khung trống", () => {
  render(<TheoryVsActualChart rows={[]} currency="USD" />);
  expect(screen.getByText(/chưa có lệnh nào/i)).toBeInTheDocument();
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

test("TheoryVsActualChart: bảng đọc được ghi đúng hai cột theo stt", () => {
  render(<TheoryVsActualChart rows={c.theory_vs_actual} currency="USD" />);
  const hang1 = within(screen.getByRole("row", { name: /^1/ }));
  expect(hang1.getByText(/^120 USD$/)).toBeInTheDocument();
  expect(hang1.getByText(/^98 USD$/)).toBeInTheDocument();
});
