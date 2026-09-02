import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MonthCalendarCard } from "./MonthCalendarCard";
import type { HeatmapMonth } from "./types";

// Hai tháng liền nhau để kiểm nút lật; 07/2026 có mùng 1 rơi vào Thứ Tư.
const HAI_THANG: HeatmapMonth[] = [
  {
    month: "06/2026",
    cells: [{ day: "2026-06-09", sum_net: "500", count: 1 }],
  },
  {
    month: "07/2026",
    cells: [
      { day: "2026-07-01", sum_net: "1000", count: 1 },
      { day: "2026-07-07", sum_net: "1381", count: 3 },
      { day: "2026-07-10", sum_net: "-346", count: 3 },
      { day: "2026-07-16", sum_net: "0", count: 2 },
    ],
  },
];

const MOT_THANG: HeatmapMonth[] = [HAI_THANG[1]];

test("mở ở tháng gần nhất có dữ liệu", () => {
  render(<MonthCalendarCard months={HAI_THANG} currency="USD" />);
  expect(screen.getByText("07/2026")).toBeInTheDocument();
});

test("nêu tên khối cho trình đọc màn hình", () => {
  render(<MonthCalendarCard months={HAI_THANG} currency="USD" />);
  expect(screen.getByRole("heading", { name: /Lịch P&L/i })).toBeInTheDocument();
});

// Lời nhắn phải nói ĐÚNG chuyện đang xảy ra và chỉ đường đi tiếp. Câu mặc
// định của BareCard ("chưa có lệnh nào trong nhóm này") là câu dành cho một
// nhóm pivot rỗng: nó không sai về mặt dữ liệu nhưng không nói cho người dùng
// biết phải làm gì, mà việc cần làm ở đây rất cụ thể — nới bộ lọc ra.
test("mảng rỗng ra lời nhắn chỉ đường nới bộ lọc, không ra lưới trống", () => {
  render(<MonthCalendarCard months={[]} currency="USD" />);
  expect(screen.getByText(/nới bộ lọc/i)).toBeInTheDocument();
  expect(screen.queryByText(/trong nhóm này/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

describe("ô ngày", () => {
  test("ngày có lệnh hiện số ngày và số tiền", () => {
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    const o = screen.getByTestId("cal-day-2026-07-07");
    expect(within(o).getByText("7")).toBeInTheDocument();
    expect(within(o).getByText(/1.381/)).toBeInTheDocument();
  });

  test("ngày không giao dịch chỉ có số ngày, không có số tiền", () => {
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    const o = screen.getByTestId("cal-day-2026-07-02");
    expect(o).toHaveAttribute("data-kind", "khong");
    expect(within(o).getByText("2")).toBeInTheDocument();
    expect(within(o).queryByText(/\$/)).not.toBeInTheDocument();
  });

  test("ngày hoà là ngày CÓ giao dịch, không phải ngày trống", () => {
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    expect(screen.getByTestId("cal-day-2026-07-16")).toHaveAttribute("data-kind", "hoa");
  });

  // Ba loại ngày, ba dấu hiệu thị giác khác nhau. Thiếu dấu của ngày hoà thì
  // số 0 đứng trơ trong ô, đọc ra thành lỗi hiển thị chứ không phải kết quả.
  test("hoà có rãnh nhưng không có thanh; lãi/lỗ có cả hai; ngày nghỉ không có gì", () => {
    const { container } = render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    const dau = (id: string) => {
      const o = screen.getByTestId(id);
      return [o.querySelectorAll(".cal-track").length, o.querySelectorAll(".cal-bar").length];
    };

    expect(dau("cal-day-2026-07-16")).toEqual([1, 0]); // hoà
    expect(dau("cal-day-2026-07-07")).toEqual([1, 1]); // lãi
    expect(dau("cal-day-2026-07-10")).toEqual([1, 1]); // lỗ
    expect(dau("cal-day-2026-07-02")).toEqual([0, 0]); // nghỉ
    expect(container.querySelectorAll(".cal-bar")).toHaveLength(3);
  });

  test("ngày ngoài tháng không render thành ô có dữ liệu", () => {
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    // 30/06 nằm ở ô đệm đầu lưới tháng 7 — không được có ô mang ngày đó.
    expect(screen.queryByTestId("cal-day-2026-06-30")).not.toBeInTheDocument();
  });

  // Chữ ký thị giác: thanh cường độ. Bậc do heatmap.ts tính, ở đây chỉ chốt
  // rằng component THẬT SỰ đưa bậc đó xuống DOM — thiếu bước này thì mọi ngày
  // sẽ có thanh cao bằng nhau mà không test nào bật lên.
  test("thanh cường độ mang bậc của ngày", () => {
    const { container } = render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    const o = screen.getByTestId("cal-day-2026-07-07");
    const bar = o.querySelector(".cal-bar");
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute("style")).toMatch(/--cal-bar-step:\s*5/);
    // Ngày hoà và ngày trống không có thanh nào.
    expect(screen.getByTestId("cal-day-2026-07-16").querySelector(".cal-bar")).toBeNull();
    expect(screen.getByTestId("cal-day-2026-07-02").querySelector(".cal-bar")).toBeNull();
    expect(container.querySelectorAll(".cal-bar").length).toBe(3);
  });
});

describe("lật tháng", () => {
  test("nút lùi mở tháng trước", async () => {
    render(<MonthCalendarCard months={HAI_THANG} currency="USD" />);
    await userEvent.click(screen.getByRole("button", { name: /tháng trước/i }));
    expect(screen.getByText("06/2026")).toBeInTheDocument();
    expect(screen.getByTestId("cal-day-2026-06-09")).toBeInTheDocument();
  });

  test("chạm hai đầu dải thì nút tắt", async () => {
    render(<MonthCalendarCard months={HAI_THANG} currency="USD" />);
    // Đang ở tháng cuối: không có tháng sau nữa.
    expect(screen.getByRole("button", { name: /tháng sau/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /tháng trước/i })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: /tháng trước/i }));
    expect(screen.getByRole("button", { name: /tháng trước/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /tháng sau/i })).toBeEnabled();
  });

  test("chỉ một tháng thì tắt cả hai nút", () => {
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    expect(screen.getByRole("button", { name: /tháng trước/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /tháng sau/i })).toBeDisabled();
  });

  // Đổi bộ lọc làm danh sách tháng đổi; tháng đang xem có thể không còn tồn
  // tại. Không xử lý thì lưới rỗng trơ ra mà không ai giải thích được.
  test("tháng đang xem biến mất khỏi dữ liệu thì rơi về tháng gần nhất", () => {
    const { rerender } = render(<MonthCalendarCard months={HAI_THANG} currency="USD" />);
    expect(screen.getByText("07/2026")).toBeInTheDocument();
    rerender(<MonthCalendarCard months={[HAI_THANG[0]]} currency="USD" />);
    expect(screen.getByText("06/2026")).toBeInTheDocument();
  });
});

describe("số tổng", () => {
  test("tổng tháng và số ngày giao dịch", () => {
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    const tong = screen.getByTestId("cal-month-net");
    // 1000 + 1381 - 346 + 0 = 2035
    expect(tong).toHaveTextContent(/2.035/);
    // Ngày hoà vẫn tính là ngày có giao dịch.
    expect(screen.getByTestId("cal-trading-days")).toHaveTextContent("4");
  });

  // Hai bẫy trong một test.
  //
  // 1. Dự án cấu hình i18next với dấu ngoặc ĐƠN (config.ts: prefix "{", suffix
  //    "}"), không phải "{{}}" mặc định. Viết nhầm thì nhãn hiện nguyên văn
  //    "T{{n}}" — trông vẫn như một cái nhãn, nên chỉ test đọc ĐÚNG CHỮ mới bắt.
  // 2. Nhãn hàng KHÔNG được trùng nhãn cột: "T2" đã có nghĩa Thứ Hai ở hàng
  //    tiêu đề, nên tuần 2 phải đọc là "Tuần 2".
  test("nhãn tuần thay được số, không lòi ra dấu ngoặc", () => {
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    expect(screen.getByText("Tuần 2")).toBeInTheDocument();
    expect(screen.queryByText(/\{n\}/)).not.toBeInTheDocument();
  });

  test("cột kết quả hiện net từng tuần", () => {
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    // Tuần 2 chứa 07/07 (+1381) và 10/07 (-346) -> 1035.
    expect(screen.getByTestId("cal-week-net-2")).toHaveTextContent(/1.035/);
  });
});

// Lưới vẽ bằng div nên trình đọc màn hình không đọc được quan hệ hàng/cột;
// bảng này là lối vào duy nhất của họ, và nó phải mang ĐỦ dữ liệu ô lịch.
test("có bảng sr-only kèm số lệnh từng ngày", () => {
  render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
  const bang = screen.getByRole("table");
  const hang = within(bang).getByRole("rowheader", { name: "2026-07-07" }).closest("tr")!;
  // Số lệnh nằm ở CỘT CUỐI của đúng hàng đó — "3" xuất hiện nhiều chỗ trong
  // bảng (cả ngày 3 lẫn số lệnh của ngày khác), nên phải hỏi theo hàng.
  expect(within(hang).getAllByRole("cell").at(-1)).toHaveTextContent("3");
});

// ── Tooltip chi tiết ngày ────────────────────────────────────────────────
//
// Ô trên lưới chỉ chứa được ngày và một con số rút gọn (không ký hiệu tiền,
// cắt bớt chữ số) — vừa đủ để LƯỚT. Tooltip là chỗ nói đủ, và là chỗ DUY NHẤT
// nói được hạng của ngày trong tháng: thanh cường độ cho biết "ngày này to",
// còn "to thứ mấy trong bao nhiêu ngày" thì phải thành chữ.
describe("tooltip chi tiết ngày", () => {
  test("hover vào ngày có lệnh thì hiện ngày đủ thứ, tiền đủ đơn vị, số lệnh", async () => {
    const user = userEvent.setup();
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);

    await user.hover(screen.getByTestId("cal-day-2026-07-07"));

    const tip = await screen.findByRole("tooltip");
    // 07/07/2026 là Thứ Ba. Ô vuông chỉ hiện "7" — tooltip phải nói đủ.
    expect(tip).toHaveTextContent(/Thứ Ba/i);
    expect(tip).toHaveTextContent(/07\/07\/2026/);
    // Tiền có ký hiệu đơn vị, khác con số trần trong ô.
    expect(tip).toHaveTextContent(/1\.381/);
    expect(tip).toHaveTextContent(/USD/);
  });

  test("tooltip nói hạng của ngày trong tháng — thứ ô vuông không nói được", async () => {
    const user = userEvent.setup();
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);

    // 07/07 (+1381) là ngày lớn nhất trong MOT_THANG.
    await user.hover(screen.getByTestId("cal-day-2026-07-07"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/Lớn nhất tháng/i);
  });

  test("ngày nghỉ nói là ngày nghỉ, không hiện P&L bằng 0", async () => {
    const user = userEvent.setup();
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);

    await user.hover(screen.getByTestId("cal-day-2026-07-02"));

    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(/không vào lệnh nào/i);
    // Ngày nghỉ KHÁC ngày hoà: hiện "0 USD" ở đây là bịa ra một kết quả cho
    // một ngày chưa từng có lệnh nào.
    expect(tip).not.toHaveTextContent(/USD/);
  });

  test("ngày hoà nói rõ là có vào lệnh, khác hẳn ngày nghỉ", async () => {
    const user = userEvent.setup();
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);

    await user.hover(screen.getByTestId("cal-day-2026-07-16"));

    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(/có vào lệnh/i);
    expect(tip).not.toHaveTextContent(/không vào lệnh nào/i);
  });

  test("ô ngày nhận được focus bàn phím", () => {
    render(<MonthCalendarCard months={MOT_THANG} currency="USD" />);
    // Radix mở tooltip cả khi focus. Không có tabIndex thì chi tiết ngày chỉ
    // tới được bằng chuột — mà nó là chi tiết DUY NHẤT của ngày đó trên trang.
    expect(screen.getByTestId("cal-day-2026-07-07")).toHaveAttribute("tabindex", "0");
  });
});
