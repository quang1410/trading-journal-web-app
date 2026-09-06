import { useEffect, useId, useRef } from "react";
import Quill from "quill";
import { cn } from "@/lib/utils";
import { isEmptyNote, sanitizeNoteHtml } from "@/lib/richText";

/**
 * Ô soạn thảo có định dạng, dựng trên Quill 2.
 *
 * KHÔNG import `quill/dist/quill.snow.css`: bộ CSS đó chép cứng mã màu hex và
 * đổ bóng, tức là vi phạm cả hai cổng styleguard của dự án và, quan trọng hơn
 * thế, nó không biết gì về `[data-theme="dark"]` nên ô soạn thảo sẽ trắng
 * toát giữa giao diện tối. Phần trình bày nằm ở `styles/quill.css`, viết bằng
 * đúng những biến ngữ nghĩa mà mọi component khác dùng.
 *
 * Quill là thư viện mệnh lệnh, sống ngoài vòng render của React. Ranh giới
 * giữa hai thế giới đó chỉ có hai chiều, và cả hai đều một chiều:
 *
 *   React -> Quill: chỉ lúc dựng, qua `defaultValue`. Đây là component KHÔNG
 *     kiểm soát, cố ý — đồng bộ ngược mỗi lần gõ sẽ đặt lại nội dung dưới
 *     chân con trỏ và làm nó nhảy về đầu dòng.
 *   Quill -> React: qua `onChange`, gọi khi người dùng gõ.
 *
 * Vì thế `defaultValue` chỉ được đọc MỘT LẦN. Muốn nạp nội dung khác thì đổi
 * `key` của component để React dựng lại — cùng cách mà TradeFormDialog đã làm
 * với cả form.
 */
export function RichTextEditor({
  id,
  defaultValue,
  onChange,
  placeholder,
  ariaLabel,
  ariaDescribedBy,
  labels,
  className,
}: {
  id: string;
  defaultValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaLabel: string;
  ariaDescribedBy?: string;
  /** Nhãn mười nút định dạng. Nơi gọi lấy từ i18n. */
  labels: ToolbarLabels;
  className?: string;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);
  // `onChange` đọc qua ref: đưa nó vào mảng phụ thuộc sẽ dựng lại Quill mỗi
  // lần component cha vẽ lại, và mỗi lần dựng lại là một lần mất con trỏ.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const toolbarId = useId();

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const toolbar = document.getElementById(toolbarId);

    const quill = new Quill(holder, {
      theme: "snow",
      placeholder,
      // Khung để Quill kẹp vị trí tooltip vào. Mặc định nó lấy `document.body`,
      // nghĩa là ô hỏi link được canh theo cả trang chứ không theo cái dialog
      // đang mở — đo được nó nằm ở x=267 trong khi dialog bắt đầu từ x=384,
      // tức là lọt hẳn ra ngoài, dính lên góc trái màn hình.
      bounds: holder,
      modules: {
        // Gọn theo chủ đích: đủ để ghi nhật ký giao dịch — gạch đầu dòng lý
        // do vào lệnh, bôi đậm bài học — mà thanh công cụ vẫn nằm gọn một
        // hàng trong một dialog vốn đã dài.
        toolbar: {
          container: `#${CSS.escape(toolbarId)}`,
          handlers: {
            // Nút ảnh MẶC ĐỊNH của Quill mở hộp chọn file rồi nhúng ảnh
            // thành chuỗi base64 thẳng vào nội dung. Cột `notes` không phải
            // chỗ chứa ảnh: một chart 300KB thành ~400KB chuỗi đi qua MỌI
            // lần đọc danh sách lệnh, kể cả khi người dùng chỉ xem bảng —
            // và `sanitizeNoteHtml` sẽ vứt nó đi lúc lưu, nên người dùng
            // thấy ảnh hiện ra rồi biến mất. Hỏi URL thay vào đó.
            image: promptForImage,
          },
        },
        // Dán từ TradingView hay Notion mang theo cả rừng thẻ và màu; ép về
        // đúng tập định dạng ô này hỗ trợ.
        clipboard: { matchVisual: false },
      },
      formats: ["bold", "italic", "underline", "strike", "list", "link", "image"],
    });
    quillRef.current = quill;

    // Tooltip là của theme, dựng cùng lúc với Quill. Ba việc phải làm ngay
    // sau khi nó tồn tại: chèn bước kiểm https, đặt chuỗi gợi ý cho chế độ
    // ảnh, và xoá dòng báo lỗi khi người dùng bắt đầu sửa.
    const tooltip = (quill.theme as { tooltip?: QuillTooltip }).tooltip;
    let clearError: (() => void) | undefined;
    if (tooltip) {
      guardTooltipSave(tooltip, quill);
      // Quill lấy chuỗi gợi ý từ `data-<mode>` của chính ô nhập, nên đặt
      // thuộc tính này là đủ — không cần chạm vào phần định vị hay hiển thị.
      tooltip.textbox?.setAttribute("data-image", "https://…");
      const onInput = () => setTooltipError(tooltip.root, null);
      tooltip.textbox?.addEventListener("input", onInput);

      // Esc trong ô nhập link chỉ được đóng TOOLTIP, không được đóng cả form.
      //
      // Không có dòng này thì một phím Esc — thao tác hiển nhiên để bỏ ô nhập
      // link — đóng luôn dialog và cuốn theo toàn bộ lệnh đang gõ dở. Đã đo
      // đúng như vậy: `ESC_KHONG_DONG_DIALOG: false`.
      //
      // Phải nghe ở CAPTURE trên `window`, và đúng chỗ đó chứ không đâu khác.
      // Đã thử hai chỗ sai trước khi đo ra:
      //
      //   - trên chính tooltip: sự kiện xuống tới đích ở pha capture TRƯỚC
      //     khi nổi bọt trở lại, nên Radix xử lý xong từ lâu.
      //   - capture trên `document`: vẫn muộn. Ngay cả
      //     `stopImmediatePropagation()` ở đây cũng không cứu được dialog,
      //     nghĩa là Radix không nghe ở document.
      //
      // `window` là nút đầu tiên của pha capture, nên đó là chỗ duy nhất
      // đứng trước được. Quill có gọi `preventDefault()` từ trước, nhưng
      // Radix không xét cờ đó — phải chặn lan truyền mới ăn thua.
      const onEscape = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        // Chỉ chặn khi ô nhập link đang mở; ngoài lúc đó Esc vẫn phải đóng
        // được dialog như thường.
        if (tooltip.root.classList.contains("ql-hidden")) return;
        e.stopPropagation();
        tooltip.hide();
        setTooltipError(tooltip.root, null);
        quill.focus();
      };
      window.addEventListener("keydown", onEscape, true);

      clearError = () => {
        tooltip.textbox?.removeEventListener("input", onInput);
        window.removeEventListener("keydown", onEscape, true);
      };
    }

    if (defaultValue !== "") {
      // Nội dung từ DB đi qua bộ lọc TRƯỚC khi vào editor, không chỉ lúc lưu:
      // một ghi chú cũ nhiễm thẻ lạ (đường import CSV) không được phép chạy
      // chỉ vì nó đã nằm sẵn trong cơ sở dữ liệu.
      quill.clipboard.dangerouslyPasteHTML(sanitizeNoteHtml(defaultValue), "silent");
    }

    quill.on("text-change", () => {
      const html = quill.getSemanticHTML();
      // Editor trống trả về "<p><br></p>"; lưu chuỗi đó xuống DB thì mọi ô
      // "ghi chú rỗng" đều thành "có ghi chú".
      onChangeRef.current(isEmptyNote(html) ? "" : sanitizeNoteHtml(html));
    });

    return () => {
      quill.off("text-change");
      clearError?.();
      quillRef.current = null;
      // Quill chèn thẳng vào holder; dọn tay để lần dựng sau không chồng lên
      // phần còn lại của lần trước.
      holder.innerHTML = "";
      // Thanh công cụ thì KHÁC: nó là div của React, nằm ngoài holder, nên
      // xoá holder không đụng tới nó — mà Quill đã gắn trình nghe click lên
      // từng nút trong đó và không có API nào gỡ ra. Effect chạy hai lần
      // (StrictMode ở dev, hoặc bất kỳ lần dựng lại nào) thì nút mang HAI
      // trình nghe, và một cú bấm chạy handler hai lượt — hộp hỏi link ảnh
      // bật lên hai lần liên tiếp. Đã đo đúng con số đó trước khi viết:
      // 2 listener trên .ql-image sau một lần mở dialog.
      //
      // Không có cách nào gỡ trình nghe đã gắn ẩn danh, nên thay cả nút bằng
      // bản sao: bản sao mang theo thuộc tính và class, không mang trình
      // nghe. React vẫn nhận ra cây DOM này vì cấu trúc không đổi.
      if (toolbar) {
        toolbar.replaceChildren(
          ...Array.from(toolbar.children, (group) => group.cloneNode(true)),
        );
      }
    };
    // defaultValue cố ý KHÔNG nằm trong mảng phụ thuộc — xem chú thích đầu
    // component: đây là ô không kiểm soát, nạp lại bằng cách đổi `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholder, toolbarId]);

  return (
    <div
      className={cn(
        "quill-host rounded-md border border-input bg-transparent transition-[color,box-shadow] dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        className,
      )}
    >
      {/*
        Thanh công cụ dựng bằng tay chứ không để Quill sinh: nút do Quill sinh
        là <button> trần không có tên trợ năng, nên trình đọc màn hình chỉ đọc
        được "button". Tự dựng thì mỗi nút có aria-label tiếng Việt và đi qua
        đúng cổng cursor-pointer của styleguard.
      */}
      <div id={toolbarId} className="quill-toolbar">
        <span className="ql-formats">
          <button type="button" className="ql-bold cursor-pointer" aria-label={labels.bold} />
          <button type="button" className="ql-italic cursor-pointer" aria-label={labels.italic} />
          <button
            type="button"
            className="ql-underline cursor-pointer"
            aria-label={labels.underline}
          />
          <button type="button" className="ql-strike cursor-pointer" aria-label={labels.strike} />
        </span>
        <span className="ql-formats">
          <button
            type="button"
            className="ql-list cursor-pointer"
            value="bullet"
            aria-label={labels.bullet}
          />
          <button
            type="button"
            className="ql-list cursor-pointer"
            value="ordered"
            aria-label={labels.ordered}
          />
          {/* Danh sách việc cần làm: cùng cơ chế <li data-list> với hai nút
              trên, chỉ khác giá trị. Với nhật ký giao dịch đây là checklist
              trước khi vào lệnh — thứ cột "theo kế hoạch?" đang cố diễn đạt
              bằng một ô enum duy nhất. */}
          <button
            type="button"
            className="ql-list cursor-pointer"
            value="check"
            aria-label={labels.check}
          />
        </span>
        <span className="ql-formats">
          <button type="button" className="ql-link cursor-pointer" aria-label={labels.link} />
          <button type="button" className="ql-image cursor-pointer" aria-label={labels.image} />
          <button type="button" className="ql-clean cursor-pointer" aria-label={labels.clean} />
        </span>
      </div>
      <div
        id={id}
        ref={holderRef}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className="quill-editor"
      />
    </div>
  );
}

/**
 * Mở ô hỏi link ảnh — CHÍNH là tooltip mà nút "Chèn liên kết" bên cạnh dùng.
 *
 * Bản đầu gọi `window.prompt`, và đó là lỗi cùng loại với lý do `TimeField`
 * tồn tại: hộp thoại của trình duyệt vẽ bằng màu hệ điều hành, không biết gì
 * về `[data-theme]`, và CSS của app không với tới. Nó cũng nói sai về sản
 * phẩm — một hộp xám của Chrome đứng giữa một form đã dựng cẩn thận.
 *
 * Tooltip của Quill thì đã được tạo dáng bằng biến ngữ nghĩa ở `quill.css`,
 * đã biết tự định vị cạnh con trỏ, đã đóng bằng Esc. Dùng lại nó thì hai nút
 * cạnh nhau hành xử GIỐNG NHAU, thay vì mỗi nút một kiểu.
 *
 * `edit(mode)` là API công khai: nó đặt `data-mode` lên tooltip và lấy chuỗi
 * gợi ý từ thuộc tính `data-<mode>` của ô nhập. Còn `save()` của Quill thì
 * chèn thẳng không kiểm gì — nên phần kiểm https nằm ở `guardTooltipSave`.
 *
 * Viết bằng `function` chứ không phải hàm mũi tên: Quill gọi handler với
 * `this` là module toolbar, và hàm mũi tên sẽ đóng băng `this` của nơi khai.
 */
function promptForImage(this: { quill: Quill }) {
  const theme = this.quill.theme as { tooltip?: QuillTooltip };
  const tooltip = theme.tooltip;
  // Không có tooltip (theme khác, hoặc Quill đổi cấu trúc) thì thà không làm
  // gì còn hơn rơi ngược về `window.prompt` — im lặng dễ lần ra hơn là một
  // hộp thoại lạ hiện lên ở đúng nơi vừa bỏ công thay thế.
  if (!tooltip) return;
  tooltip.edit("image");
}

/**
 * Xử lý phím Enter trong tooltip khi đang ở chế độ ảnh: kiểm link rồi chèn.
 *
 * Phải TỰ chèn chứ không gọi được `save()` gốc, và đây là chỗ đã đo sai một
 * lần: `save()` của Quill chỉ có nhánh cho "link", "video" và "formula".
 * Chế độ "image" không khớp nhánh nào, nên nó chạy qua rồi ẩn tooltip mà
 * không chèn gì — im lặng, không lỗi. Triệu chứng: gõ link đúng, tooltip
 * đóng lại, và không có ảnh nào.
 *
 * Link sai thì giữ tooltip mở kèm một dòng nói rõ sai ở đâu, để sửa ngay tại
 * chỗ thay vì phải mở lại từ đầu. Kiểm tại đây chứ không đợi lúc lưu lệnh:
 * `sanitizeNoteHtml` sẽ vứt ảnh không phải https đi, và nếu không báo bây
 * giờ thì người dùng thấy ảnh hiện ra rồi biến mất sau khi bấm Lưu.
 */
function guardTooltipSave(tooltip: QuillTooltip, quill: Quill) {
  const original = tooltip.save.bind(tooltip);
  tooltip.save = function save() {
    if (this.root.getAttribute("data-mode") !== "image") {
      original();
      return;
    }
    const url = (this.textbox?.value ?? "").trim();
    const problem = imageUrlProblem(url);
    setTooltipError(this.root, problem);
    if (problem !== null) return;

    // Vị trí con trỏ lúc mở tooltip, không phải lúc này: tiêu điểm đang nằm
    // trong ô nhập của tooltip nên `getSelection()` trả về null.
    const at = quill.selection.savedRange?.index ?? quill.getLength() - 1;
    quill.insertEmbed(at, "image", url, "user");
    // Đẩy con trỏ qua PHẢI ảnh, nếu không chữ gõ tiếp theo rơi vào trước nó.
    quill.setSelection(at + 1, 0, "silent");

    if (this.textbox) this.textbox.value = "";
    this.hide();
  };
}

/**
 * Câu báo lỗi cho một link ảnh, hoặc null nếu dùng được.
 *
 * Hai câu chứ không một, vì đây là hai nhầm lẫn khác nhau và câu chung chung
 * ("link không hợp lệ") không giúp sửa được cái nào:
 *
 *   - Dán link TRANG chart thay vì link ẢNH là nhầm lẫn thường gặp nhất với
 *     TradingView: `tradingview.com/chart/abc` là trang, `.../x/abc` mới là
 *     ảnh chụp. Hai cái nhìn gần giống nhau.
 *   - Còn lại là chuyện giao thức.
 */
export function imageUrlProblem(url: string): string | null {
  if (url === "") return "Chưa có link nào.";
  if (!/^https:\/\//i.test(url)) {
    return /^http:\/\//i.test(url)
      ? "Link phải là https:// — ảnh http bị trình duyệt chặn."
      : "Link phải bắt đầu bằng https://";
  }
  if (/tradingview\.com\/chart\//i.test(url)) {
    return "Đây là link trang chart. Cần link ảnh chụp (tradingview.com/x/…).";
  }
  return null;
}

/** Gắn hoặc gỡ dòng báo lỗi dưới ô nhập của tooltip. */
function setTooltipError(root: HTMLElement, message: string | null) {
  let line = root.querySelector<HTMLElement>(".ql-tooltip-error");
  if (message === null) {
    line?.remove();
    root.removeAttribute("data-invalid");
    return;
  }
  if (!line) {
    line = document.createElement("div");
    line.className = "ql-tooltip-error";
    // Trình đọc màn hình phải nghe được câu này ngay khi nó xuất hiện; không
    // có nó thì lỗi chỉ tồn tại với người nhìn thấy màu đỏ.
    line.setAttribute("role", "alert");
    root.append(line);
  }
  line.textContent = message;
  root.setAttribute("data-invalid", "");
}

/** Phần tooltip của Quill mà đoạn mã này chạm tới. */
type QuillTooltip = {
  root: HTMLElement;
  textbox: HTMLInputElement | null;
  edit: (mode?: string, preview?: string | null) => void;
  save: () => void;
  hide: () => void;
};

/** Nhãn mười nút định dạng, nơi gọi dịch rồi truyền xuống. */
export type ToolbarLabels = {
  bold: string;
  italic: string;
  underline: string;
  strike: string;
  bullet: string;
  ordered: string;
  check: string;
  link: string;
  image: string;
  clean: string;
};
