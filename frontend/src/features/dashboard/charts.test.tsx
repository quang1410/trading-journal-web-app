import { render, screen, within } from "@testing-library/react";
import { taoCharts } from "@/test/tradeFactory";
import { DailyPnlChart } from "./DailyPnlChart";
import { RDistributionChart } from "./RDistributionChart";
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
