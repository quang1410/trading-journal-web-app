import { useEffect, useRef, useState } from "react";
import { FileTextIcon, RefreshCwIcon, UploadIcon, XIcon } from "lucide-react";
import { useI18n } from "@/i18n";

/**
 * Kiểu chung của hai nút hành động trên hàng file đã chọn.
 *
 * Viền chứ không nền đặc: chúng là hành động phụ đứng cạnh nút chính "Nhập vào
 * tài khoản" ở bước 3. Hai nút đặc ngang hàng nhau sẽ tranh chỗ với nút thật
 * sự quan trọng của trang.
 *
 * KHÔNG chứa `cursor-pointer` — mỗi thẻ <button> tự viết class đó. Cổng
 * styleguard quét văn bản của chính thẻ mở và không lần theo được biến, nên
 * gom class con trỏ vào đây sẽ làm nó báo thiếu ở mọi nút dùng hằng số này.
 * Giữ nguyên giới hạn của cổng thay vì nới nó ra: một cổng quét tĩnh đơn giản
 * mà bắt được lỗi thật thì đáng giá hơn một cổng thông minh mà nhầm.
 */
const actionClass = [
  "inline-flex items-center gap-1.5 rounded-md border",
  "border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 py-1",
  "text-xs font-medium text-[var(--text-muted)] transition-colors",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  "focus-visible:outline-[var(--focus-ring)]",
  "disabled:pointer-events-none disabled:opacity-50",
].join(" ");

/**
 * Màu hover đi RIÊNG, không nằm trong actionClass.
 *
 * Hai nút cần hai màu hover khác nhau — teal cho "chọn file khác", đỏ cho "bỏ
 * file". Đặt màu mặc định vào actionClass rồi ghi đè bằng class thêm KHÔNG
 * hoạt động: `hover:text-primary` và `hover:text-[var(--status-error)]` có
 * cùng độ đặc hiệu, nên lớp nào Tailwind sinh sau trong file CSS sẽ thắng, bất
 * kể thứ tự viết trong chuỗi. Nút "bỏ file" từng hover ra màu teal vì đúng lý
 * do đó.
 */
const hoverPrimary = "hover:border-primary hover:text-primary";
const hoverDanger = "hover:border-[var(--status-error)] hover:text-[var(--status-error)]";

/**
 * Vùng thả file, thay cho `<input type="file">` mặc định của trình duyệt.
 *
 * Lý do đổi: input mặc định là vật thể DUY NHẤT trong app không đi theo theme
 * — nó vẽ nút của hệ điều hành, không đọc `--surface-*` hay `--border-*` nào,
 * nên trên nền dark nó sáng trắng lên giữa trang.
 *
 * Input thật vẫn còn nguyên và vẫn mang `id`, chỉ bị che bằng `sr-only`. Nhờ
 * vậy `<Label htmlFor>` vẫn trỏ tới nó, bàn phím vẫn tab vào được, và test
 * `getByLabelText` + `userEvent.upload` vẫn chạy nguyên như cũ. Vẽ lại một
 * nút giả rồi tự mở hộp thoại sẽ làm mất cả ba thứ đó.
 */
export function FileDropzone({
  id,
  fileName,
  disabled,
  onFile,
}: {
  id: string;
  /** Tên file đang chọn; null là chưa chọn. */
  fileName: string | null;
  disabled: boolean;
  onFile: (file: File | null) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);
  // Thả nhầm loại file thì phải NÓI RA. Bỏ qua trong im lặng để người dùng
  // thả đi thả lại mà không hiểu vì sao không có gì xảy ra.
  const [wrongType, setWrongType] = useState(false);

  /*
    Không còn file thì DỌN LUÔN giá trị của input.
    
    Trình duyệt chỉ phát `change` khi giá trị input ĐỔI. Bỏ file mà input còn
    giữ tên cũ thì chọn lại ĐÚNG file đó không sinh sự kiện nào — và đó chính
    là vòng lặp chính của tính năng này: nhập → thấy lỗi → mở Excel sửa →
    chọn lại file cũ → kiểm lại. Người dùng sửa file xong, chọn lại, màn hình
    vẫn trơ ra bản báo lỗi cũ.

    Đặt ở effect chứ không trong từng handler, vì `fileName` về null từ NHIỀU
    lối: nút "Bỏ file" ngay dưới đây, và nút "Nhập file khác" của ImportPage —
    lối thứ hai nằm ngoài component nên không với tới DOM value được. Đồng bộ
    theo prop thì mọi lối đều đi qua một chỗ.
  */
  useEffect(() => {
    if (fileName === null && inputRef.current) inputRef.current.value = "";
  }, [fileName]);

  /**
   * Kéo-thả phải theo CÙNG luật với nút chọn file.
   *
   * `accept=".csv,text/csv"` chỉ ràng buộc hộp thoại chọn file — kéo-thả đi
   * đường khác và trước đây không chịu luật nào. Thả một file .xlsx vào đây
   * vẫn gửi lên rồi nhận về một lỗi backend chung chung, trong khi chính
   * khung này đang hứa "Một file .csv". Hai lối vào cùng một việc mà nhận hai
   * tập file khác nhau là chỗ người dùng không thể đoán được.
   *
   * Xét theo ĐUÔI FILE chứ không theo `type`: trên Windows, .csv thường mang
   * MIME `application/vnd.ms-excel`, và một số máy trả về chuỗi rỗng. Lọc
   * theo MIME sẽ chặn nhầm đúng những file hợp lệ mà người dùng hay thả nhất.
   *
   * Kích thước để backend canh: giới hạn 5 MB là luật của server, chép một
   * bản sang đây sẽ thành hai con số trôi lệch nhau trong im lặng.
   */
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsOver(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0] ?? null;
    if (file && !/\.csv$/i.test(file.name)) {
      setWrongType(true);
      return;
    }
    setWrongType(false);
    onFile(file);
  }

  return (
    // Nhãn bọc cả vùng: bấm chỗ nào trong khung cũng mở hộp thoại chọn file,
    // và trình đọc màn hình vẫn thấy đúng một control có nhãn.
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
      data-over={isOver || undefined}
      className={[
        "group relative flex flex-col items-center justify-center gap-2 rounded-md",
        "border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)]",
        // Vùng thả rộng khi còn TRỐNG — nó là đích của một cú kéo thả, và
        // đích nhỏ thì khó trúng. Chọn xong rồi thì bước này đã qua: co lại
        // để nhường chiều cao cho bước đang làm dở ở dưới.
        fileName ? "px-4 py-4" : "px-6 py-10",
        "text-center transition-colors",
        // Con trỏ bàn tay CHỈ khi cả khung còn là một nút. Có file rồi thì
        // vùng bấm nằm ở hai nút bên phải, và một khung báo "bấm được" mà bấm
        // vào chẳng xảy ra gì là lời hứa suông.
        disabled ? "opacity-60" : fileName ? "" : "cursor-pointer hover:border-primary/60",
        "data-[over]:border-primary data-[over]:bg-[var(--surface-base)]",
        // Vành focus đi theo input bên trong, vì input mới là thứ nhận tab.
        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2",
        "focus-within:outline-[var(--focus-ring)]",
      ].join(" ")}
    >
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        disabled={disabled}
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {/*
        Lớp phủ CHỈ khi chưa có file. Lúc đó cả khung là một lời mời "bấm vào
        đây", nên bấm chỗ nào cũng mở hộp thoại là đúng ý.

        Đã có file thì bỏ hẳn: khung khi ấy chứa tên file cùng hai nút có nhãn
        rõ ràng, và một vùng bấm vô hình trùm lên chúng chỉ làm cả hàng thành
        một đích bấm mơ hồ — bấm vào tên file lại mở hộp thoại là hành vi không
        ai đoán được.

        aria-hidden vì input thật ở trên đã là control có nhãn; hai control cho
        một việc sẽ đọc thành hai mục trong trình đọc màn hình.
      */}
      {!fileName && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="absolute inset-0 cursor-pointer rounded-md disabled:cursor-default"
        />
      )}

      {fileName ? (
        /*
          Đã chọn: tên file bên trái, hai hành động bên phải.

          Bố cục này sửa một chỗ tối nghĩa của bản trước: "Chọn file khác" khi
          đó là CHỮ TRẦN nằm cạnh một nút X thật, hai thứ cùng cỡ cùng màu xám
          mà một cái bấm được một cái không — không có gì trên màn hình nói cho
          người dùng biết cái nào là cái nào.

          Giờ cả hai đều là nút có viền và có CHỮ. Tên file dạt trái vì nó là
          thông tin, hành động dạt phải vì đó là chỗ mắt tìm nút. Khoảng cách
          thay cho dấu "·" dẫn đầu, vốn làm hành động đọc thành phần đuôi của
          tên file.
        */
        <span className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 text-left">
          <span className="flex min-w-0 items-center gap-2">
            <FileTextIcon aria-hidden className="size-4 shrink-0 text-primary" />
            <span className="num truncate text-sm font-medium text-[var(--text-primary)]">
              {fileName}
            </span>
          </span>

          {/*
            Hai nút nằm TRÊN lớp phủ (z-10) và chặn nổi bọt: cả khung này là
            một nút mở hộp thoại chọn file, nên không chặn thì bấm "Bỏ file" sẽ
            vừa xoá file vừa mở ngay hộp thoại — người dùng thấy một cửa sổ
            chọn file bật lên mà không hiểu vì sao.
          */}
          <span className="relative z-10 flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!inputRef.current) return;
                // Dọn trước khi mở: người dùng thường mở Excel sửa rồi chọn
                // lại CHÍNH file đó. Còn giữ giá trị cũ thì lần chọn lại ấy
                // không phát change, và họ tưởng nút hỏng.
                inputRef.current.value = "";
                inputRef.current.click();
              }}
              className={`cursor-pointer ${actionClass} ${hoverPrimary}`}
            >
              <RefreshCwIcon aria-hidden className="size-3.5" />
              {t("import.replaceFile")}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                // Giá trị input do effect ở trên dọn khi fileName về null.
                onFile(null);
              }}
              className={`cursor-pointer ${actionClass} ${hoverDanger}`}
            >
              <XIcon aria-hidden className="size-3.5" />
              {t("import.clearFile")}
            </button>
          </span>
        </span>
      ) : (
        <>
          <UploadIcon
            aria-hidden
            className="size-5 text-[var(--text-muted)] transition-colors group-hover:text-primary"
          />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {t("import.dropHere")}
          </span>
          <span className="text-xs text-muted-foreground">{t("import.dropHint")}</span>
          {wrongType && (
            <span className="text-xs font-medium text-[var(--status-error)]">
              {t("import.dropWrongType")}
            </span>
          )}
        </>
      )}
    </div>
  );
}
