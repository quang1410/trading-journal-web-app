import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/harness";
import { FileDropzone } from "./FileDropzone";

const csv = () => new File(["Day\n"], "trades.csv", { type: "text/csv" });

/**
 * Hợp đồng chính của component: input file THẬT vẫn còn, vẫn có nhãn, vẫn nhận
 * bàn phím. Vùng thả chỉ là lớp vẽ đè lên nó.
 *
 * Ca này ghim đúng chỗ dễ hỏng nhất khi ai đó "dọn dẹp": thay input bằng một
 * nút giả rồi tự mở hộp thoại. Làm vậy thì `<Label htmlFor>` trỏ vào hư không,
 * người dùng bàn phím không tab tới được, và mọi test upload của trang đứt.
 */
test("input file thật vẫn nhận được file qua nhãn", async () => {
  const seen: (File | null)[] = [];
  renderApp(
    <>
      <label htmlFor="f">Chọn file CSV</label>
      <FileDropzone id="f" fileName={null} disabled={false} onFile={(f) => seen.push(f)} />
    </>,
  );

  await userEvent.upload(screen.getByLabelText(/chọn file/i), csv());

  expect(seen).toHaveLength(1);
  expect(seen[0]?.name).toBe("trades.csv");
});

test("chưa chọn file thì mời thả file vào", () => {
  renderApp(<FileDropzone id="f" fileName={null} disabled={false} onFile={() => {}} />);

  expect(screen.getByText(/kéo file csv vào đây/i)).toBeInTheDocument();
  expect(screen.getByText(/tối đa 5 mb/i)).toBeInTheDocument();
});

// Chọn xong thì tên file thay chỗ lời mời: người dùng cần biết CÁI GÌ sắp được
// nhập, và lời mời thả file đã hết việc.
test("đã chọn file thì hiện tên file và lối đổi file", () => {
  renderApp(<FileDropzone id="f" fileName="lenh-thang-6.csv" disabled={false} onFile={() => {}} />);

  expect(screen.getByText("lenh-thang-6.csv")).toBeInTheDocument();
  expect(screen.getByText(/chọn file khác/i)).toBeInTheDocument();
  expect(screen.queryByText(/kéo file csv vào đây/i)).not.toBeInTheDocument();
});

// Đang đọc file thì không cho chọn file mới: kết quả trả về sẽ ứng với file
// nào là chuyện không đoán được.
test("disabled thì khoá input", () => {
  renderApp(
    <>
      <label htmlFor="f">Chọn file CSV</label>
      <FileDropzone id="f" fileName={null} disabled onFile={() => {}} />
    </>,
  );

  expect(screen.getByLabelText(/chọn file/i)).toBeDisabled();
});

// Hai hành động trên hàng file đã chọn phải là NÚT CÓ CHỮ, không phải chữ trần.
//
// Ca hồi quy cho một lỗi giao diện thật: bản đầu để "Chọn file khác" là chữ
// trần nằm cạnh một nút X chỉ có icon. Hai thứ cùng cỡ cùng màu xám mà một cái
// bấm được một cái không, và không gì trên màn hình nói cho người dùng biết
// cái nào là cái nào.
test("đã chọn file thì có hai nút hành động, cả hai đều có chữ", () => {
  renderApp(<FileDropzone id="f" fileName="lenh-thang-6.csv" disabled={false} onFile={() => {}} />);

  expect(screen.getByRole("button", { name: /chọn file khác/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /bỏ file đã chọn/i })).toBeInTheDocument();
});

// Bấm "Chọn file khác" mở hộp thoại chọn file, KHÔNG xoá file đang chọn.
//
// Người dùng huỷ hộp thoại thì phải còn nguyên file cũ; xoá trước rồi mới mở
// sẽ làm họ mất file đang xem mà chẳng đổi được gì.
test("nút chọn file khác không xoá file đang chọn", async () => {
  const seen: (File | null)[] = [];
  renderApp(
    <FileDropzone id="f" fileName="cu.csv" disabled={false} onFile={(f) => seen.push(f)} />,
  );

  await userEvent.click(screen.getByRole("button", { name: /chọn file khác/i }));

  expect(seen, "mở hộp thoại không phải là đổi file").toHaveLength(0);
  expect(screen.getByText("cu.csv")).toBeInTheDocument();
});

// Đang đọc file thì khoá cả hai nút: đổi hay bỏ file giữa chừng làm kết quả
// trả về ứng với file nào là chuyện không đoán được.
test("disabled thì khoá cả hai nút hành động", () => {
  renderApp(<FileDropzone id="f" fileName="a.csv" disabled onFile={() => {}} />);

  expect(screen.getByRole("button", { name: /chọn file khác/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /bỏ file đã chọn/i })).toBeDisabled();
});

// REGRESSION: sửa file trong Excel rồi chọn LẠI ĐÚNG file đó phải chạy được.
//
// Đây là vòng lặp chính của cả tính năng import: nhập → thấy lỗi → mở Excel
// sửa → chọn lại file cũ → kiểm lại. Trình duyệt chỉ phát `change` khi giá
// trị input ĐỔI, nên nếu input còn giữ tên file cũ thì lần chọn lại y hệt
// không sinh sự kiện nào: người dùng sửa file xong, chọn lại, và màn hình
// vẫn trơ ra bản báo lỗi cũ như chưa có gì xảy ra.
//
// Nút "Bỏ file" đã xử lý đúng chuyện này ngay từ đầu; nút "Chọn file khác"
// thì quên, và chỗ gọi ở ImportPage cũng không với tới DOM value được.
test("chọn lại đúng file vừa bỏ vẫn sinh sự kiện", async () => {
  // Dựng đúng hình dạng thật: một cha giữ state, y như ImportPage. Gọi
  // rerender trần sẽ dựng lại component ngoài provider và không phản ánh
  // được luồng thật.
  function Cha() {
    const [ten, setTen] = useState<string | null>(null);
    return (
      <>
        <FileDropzone
          id="f"
          fileName={ten}
          disabled={false}
          onFile={(f) => setTen(f?.name ?? null)}
        />
        {/* Đại diện cho nút "Nhập file khác" của ImportPage: nó bỏ file từ
            BÊN NGOÀI component, nên không với tới DOM value được. */}
        <button type="button" className="cursor-pointer" onClick={() => setTen(null)}>
          bỏ từ trang
        </button>
      </>
    );
  }

  renderApp(<Cha />);
  const input = document.getElementById("f") as HTMLInputElement;

  await userEvent.upload(input, csv());
  expect(input.files?.[0]?.name).toBe("trades.csv");

  await userEvent.click(screen.getByRole("button", { name: /bỏ từ trang/i }));

  // Sau khi bỏ, input phải RỖNG — nếu không, chọn lại đúng file này là no-op.
  expect(input.value, "input còn giữ file cũ nên chọn lại sẽ không phát change").toBe("");
});

// Kéo-thả phải theo CÙNG luật với nút chọn file.
//
// `accept=".csv,text/csv"` chỉ lọc hộp thoại chọn file; kéo-thả đi đường
// khác và không chịu ràng buộc nào. Nên thả một file .xlsx vào đây vẫn gửi
// lên và trả về một lỗi backend chung chung, trong khi chính khung này đang
// hứa "Một file .csv". Hai lối vào cùng một việc mà nhận hai tập file khác
// nhau là chỗ người dùng không thể đoán được.
test("thả file không phải csv thì bị bỏ qua", () => {
  const seen: (File | null)[] = [];
  renderApp(<FileDropzone id="f" fileName={null} disabled={false} onFile={(f) => seen.push(f)} />);

  const zone = document.getElementById("f")!.parentElement!;
  const xlsx = new File(["x"], "so-lenh.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  fireEvent.drop(zone, { dataTransfer: { files: [xlsx] } });

  expect(seen, "file .xlsx không được nhận").toHaveLength(0);
  expect(screen.getByText(/chỉ nhận file \.csv/i)).toBeInTheDocument();
});

// Thả đúng file .csv thì vẫn phải chạy — và lời báo lỗi cũ phải biến mất.
test("thả file csv hợp lệ vẫn nhận và xoá lời báo lỗi cũ", () => {
  const seen: (File | null)[] = [];
  renderApp(<FileDropzone id="f" fileName={null} disabled={false} onFile={(f) => seen.push(f)} />);

  const zone = document.getElementById("f")!.parentElement!;
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(["x"], "a.xlsx", { type: "" })] },
  });
  expect(screen.getByText(/chỉ nhận file \.csv/i)).toBeInTheDocument();

  fireEvent.drop(zone, { dataTransfer: { files: [csv()] } });

  expect(seen.map((f) => f?.name)).toEqual(["trades.csv"]);
  expect(screen.queryByText(/chỉ nhận file \.csv/i)).not.toBeInTheDocument();
});
