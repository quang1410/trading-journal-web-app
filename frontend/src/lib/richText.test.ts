import {
  isEmptyNote,
  noteToHtml,
  noteToOneLine,
  noteToText,
  sanitizeNoteHtml,
} from "./richText";

describe("isEmptyNote", () => {
  test("nhận ra mọi dạng rỗng Quill sinh ra", () => {
    expect(isEmptyNote("")).toBe(true);
    expect(isEmptyNote("<p><br></p>")).toBe(true);
    expect(isEmptyNote("  <p></p>  ")).toBe(true);
  });

  test("có chữ thì không rỗng", () => {
    expect(isEmptyNote("<p>a</p>")).toBe(false);
  });
});

describe("noteToText", () => {
  test("bóc thẻ, giữ chữ", () => {
    expect(noteToText("<p><strong>Vào sớm</strong> quá</p>")).toBe("Vào sớm quá");
  });

  // Nối thẳng hai đoạn sẽ bịa ra một từ không ai gõ.
  test("ranh giới đoạn thành xuống dòng, không dính liền", () => {
    expect(noteToText("<p>Vào lệnh sớm</p><p>Bài học: chờ nến đóng</p>")).toBe(
      "Vào lệnh sớm\nBài học: chờ nến đóng",
    );
  });

  test("<br> thành xuống dòng", () => {
    expect(noteToText("<p>dòng một<br>dòng hai</p>")).toBe("dòng một\ndòng hai");
  });

  test("mỗi mục danh sách một dòng", () => {
    expect(noteToText("<ul><li>một</li><li>hai</li></ul>")).toBe("một\nhai");
  });

  test("giải mã thực thể HTML về ký tự gốc", () => {
    expect(noteToText("<p>giá &lt; 2000 &amp; RR &gt; 2</p>")).toBe("giá < 2000 & RR > 2");
  });

  // Giải mã & trước thì "&amp;lt;" ra "<" — sai một bậc.
  test("thực thể lồng nhau giải mã đúng một bậc", () => {
    expect(noteToText("<p>&amp;lt;</p>")).toBe("&lt;");
  });

  test("ghi chú rỗng ra chuỗi rỗng", () => {
    expect(noteToText("<p><br></p>")).toBe("");
  });
});

// Ba ca dưới đây phải cho ra ĐÚNG chuỗi mà `NotesToText` bên Go cho ra —
// xem backend/internal/csvformat/richtext_test.go, cùng bộ ca. Hai đầu đọc
// cùng một ghi chú (bảng lệnh, thùng rác ở FE; file CSV xuất ra ở BE) nên
// lệch nhau là người dùng thấy hai kết quả khác nhau cho cùng một thứ.
describe("noteToText — giữ trạng thái checklist và ảnh", () => {
  test("checklist giữ trạng thái đã làm / chưa làm", () => {
    expect(
      noteToText('<ul><li data-list="checked">chờ nến đóng</li></ul><ul><li data-list="unchecked">có SMT</li></ul>'),
    ).toBe("[x] chờ nến đóng\n[ ] có SMT");
  });

  test("checklist lẫn với gạch đầu dòng thường", () => {
    expect(noteToText('<ul><li data-list="bullet">thường</li><li data-list="checked">đã xong</li></ul>')).toBe(
      "thường\n[x] đã xong",
    );
  });

  // Ghi chú CHỈ có ảnh mà rút về chuỗi rỗng thì ở thùng rác nó hiện ra như
  // một lệnh không ghi gì cả.
  test("ảnh có alt thì lấy alt, không có thì lấy link", () => {
    expect(noteToText('<p><img src="https://i.imgur.com/a.png" alt="chart NQ M5"></p>')).toBe(
      "[ảnh: chart NQ M5]",
    );
    expect(noteToText('<p><img src="https://i.imgur.com/a.png" alt=""></p>')).toBe(
      "[ảnh: https://i.imgur.com/a.png]",
    );
  });

  test("ảnh nằm cùng chữ thì giữ cả hai", () => {
    expect(noteToText('<p>Trước lệnh:</p><p><img src="https://x.com/a.png" alt="setup"></p>')).toBe(
      "Trước lệnh:\n[ảnh: setup]",
    );
  });
});

describe("noteToOneLine", () => {
  test("gộp nhiều dòng bằng dấu chấm giữa câu", () => {
    expect(noteToOneLine("<p>Vào sớm</p><p>Chờ nến đóng</p>")).toBe("Vào sớm · Chờ nến đóng");
  });
});

describe("noteToHtml", () => {
  test("text thuần cũ được bọc thành đoạn văn", () => {
    expect(noteToHtml("ghi chú cũ")).toBe("<p>ghi chú cũ</p>");
  });

  test("xuống dòng đơn thành <br>, dòng trống tách đoạn", () => {
    expect(noteToHtml("một\nhai")).toBe("<p>một<br>hai</p>");
    expect(noteToHtml("một\n\nhai")).toBe("<p>một</p><p>hai</p>");
  });

  // Một ghi chú thật hoàn toàn có thể chứa "giá < 2000".
  test("dấu nhỏ hơn trong text cũ được escape, không nuốt mất phần sau", () => {
    expect(noteToHtml("giá < 2000 & vào")).toBe("<p>giá &lt; 2000 &amp; vào</p>");
  });

  test("chuỗi đã là HTML thì giữ nguyên, không bọc thêm lần nữa", () => {
    expect(noteToHtml("<p>đã là html</p>")).toBe("<p>đã là html</p>");
  });

  test("rỗng ra rỗng", () => {
    expect(noteToHtml("   ")).toBe("");
  });
});

describe("sanitizeNoteHtml", () => {
  test("giữ nguyên thẻ thanh công cụ sinh ra", () => {
    expect(sanitizeNoteHtml("<p><strong>đậm</strong> <em>nghiêng</em></p>")).toBe(
      "<p><strong>đậm</strong> <em>nghiêng</em></p>",
    );
  });

  test("giữ kiểu danh sách của Quill", () => {
    expect(sanitizeNoteHtml('<ol><li data-list="bullet">a</li></ol>')).toBe(
      '<ol><li data-list="bullet">a</li></ol>',
    );
  });

  // Thẻ lạ thì bỏ thẻ, GIỮ chữ: nội dung người dùng gõ không được biến mất.
  test("thẻ ngoài danh sách cho phép bị bỏ nhưng chữ còn nguyên", () => {
    expect(sanitizeNoteHtml("<p><span>chữ</span></p>")).toBe("<p>chữ</p>");
    expect(sanitizeNoteHtml("<div>a</div>")).toBe("a");
  });

  test("script bị bỏ thẻ", () => {
    expect(sanitizeNoteHtml("<script>alert(1)</script>")).toBe("alert(1)");
    expect(sanitizeNoteHtml("<p>a</p><script>x</script>")).toBe("<p>a</p>x");
  });

  test("thuộc tính sự kiện bị bỏ hết", () => {
    expect(sanitizeNoteHtml('<p onclick="alert(1)">a</p>')).toBe("<p>a</p>");
    expect(sanitizeNoteHtml('<strong style="color:red" class="x">a</strong>')).toBe(
      "<strong>a</strong>",
    );
  });

  test("link http và https giữ lại, kèm rel an toàn", () => {
    expect(sanitizeNoteHtml('<a href="https://tradingview.com">chart</a>')).toBe(
      '<a href="https://tradingview.com" target="_blank" rel="noopener noreferrer nofollow">chart</a>',
    );
  });

  test("mailto được phép", () => {
    expect(sanitizeNoteHtml('<a href="mailto:a@b.com">mail</a>')).toContain(
      'href="mailto:a@b.com"',
    );
  });

  // Lý do sanitize tồn tại.
  test("javascript: bị chặn, chữ vẫn còn", () => {
    expect(sanitizeNoteHtml('<a href="javascript:alert(1)">bấm</a>')).toBe("bấm</a>");
  });

  test("javascript: viết hoa hoặc chèn ký tự điều khiển vẫn bị chặn", () => {
    expect(sanitizeNoteHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe("x</a>");
    expect(sanitizeNoteHtml('<a href="java\u0000script:alert(1)">x</a>')).toBe("x</a>");
    expect(sanitizeNoteHtml('<a href="  javascript:alert(1)">x</a>')).toBe("x</a>");
  });

  test("data: bị chặn", () => {
    expect(sanitizeNoteHtml('<a href="data:text/html,<script>x</script>">x</a>')).not.toContain(
      "data:",
    );
  });

  test("đường dẫn tương đối vẫn dùng được", () => {
    expect(sanitizeNoteHtml('<a href="/trades/7">lệnh 7</a>')).toContain('href="/trades/7"');
  });

  // Điều cần bảo đảm không phải là chuỗi "onmouseover" biến mất — nó nằm
  // trong URL người dùng gõ thì cứ ở đó. Điều cần bảo đảm là dấu ngoặc kép bị
  // escape nên nó không ĐÓNG được thuộc tính href để trở thành một thuộc tính
  // thật.
  test("dấu ngoặc kép trong href được escape, không thoát ra ngoài thuộc tính", () => {
    const out = sanitizeNoteHtml('<a href=\'https://x.com/"onmouseover="alert(1)\'>x</a>');
    expect(out).toContain("&quot;onmouseover=&quot;");
    expect(out).not.toMatch(/"\s*onmouseover\s*=/);
  });

  // getSemanticHTML() của Quill đổi MỌI dấu cách thành &nbsp;. Để nguyên thì
  // ghi chú lưu xuống có U+00A0 xen giữa các từ, và tìm "vào lệnh" không ra.
  test("&nbsp; của Quill về lại dấu cách thường", () => {
    expect(sanitizeNoteHtml("<p>vào&nbsp;lệnh&nbsp;sớm</p>")).toBe("<p>vào lệnh sớm</p>");
  });

  test("ký tự U+00A0 thật cũng về dấu cách thường", () => {
    expect(sanitizeNoteHtml("<p>a\u00a0b</p>")).toBe("<p>a b</p>");
  });

  test("ảnh https giữ lại, kèm alt và tải chậm", () => {
    expect(sanitizeNoteHtml('<p><img src="https://i.imgur.com/a.png" alt="chart NQ"></p>')).toBe(
      '<p><img src="https://i.imgur.com/a.png" alt="chart NQ" loading="lazy" referrerpolicy="no-referrer"></p>',
    );
  });

  // Ảnh nằm trên máy chủ người khác: thiếu thuộc tính này thì mỗi lần tải ảnh
  // là một lần host ngoài biết người dùng đang xem trang nào. Spec §6 của
  // 2026-09-05-dynamic-journal-design.md yêu cầu đúng thuộc tính này.
  test("ảnh luôn kèm referrerpolicy, không rò URL trang sang host ngoài", () => {
    expect(sanitizeNoteHtml('<img src="https://x.com/a.png">')).toContain(
      'referrerpolicy="no-referrer"',
    );
  });

  test("ảnh không có alt vẫn hợp lệ, alt để rỗng", () => {
    expect(sanitizeNoteHtml('<img src="https://x.com/a.png">')).toBe(
      '<img src="https://x.com/a.png" alt="" loading="lazy" referrerpolicy="no-referrer">',
    );
  });

  // Lý do cột notes không nhận ảnh base64: một chart 300KB thành ~400KB chuỗi
  // đi qua MỌI lần đọc danh sách lệnh, kể cả khi chỉ xem bảng.
  test("ảnh data: bị bỏ — cột notes không phải chỗ chứa ảnh base64", () => {
    expect(sanitizeNoteHtml('<p><img src="data:image/png;base64,AAAA"></p>')).toBe("<p></p>");
  });

  test("ảnh http bị bỏ — nội dung hỗn hợp sẽ bị trình duyệt chặn", () => {
    expect(sanitizeNoteHtml('<img src="http://x.com/a.png">')).toBe("");
  });

  test("ảnh đường dẫn tương đối bị bỏ — chưa có chỗ chứa ảnh trên máy chủ này", () => {
    expect(sanitizeNoteHtml('<img src="/uploads/a.png">')).toBe("");
  });

  test("javascript: trong src ảnh bị chặn", () => {
    expect(sanitizeNoteHtml('<img src="javascript:alert(1)">')).toBe("");
    expect(sanitizeNoteHtml('<img src="java\u0000script:alert(1)">')).toBe("");
  });

  test("thuộc tính sự kiện trên ảnh bị bỏ hết", () => {
    const out = sanitizeNoteHtml('<img src="https://x.com/a.png" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
  });

  // Cùng luật đã áp cho href: dấu ngoặc kép không được ĐÓNG thuộc tính src để
  // trở thành một thuộc tính thật.
  test("dấu ngoặc kép trong src được escape, không thoát ra ngoài thuộc tính", () => {
    const out = sanitizeNoteHtml('<img src=\'https://x.com/"onerror="alert(1)\'>');
    expect(out).toContain("&quot;onerror=&quot;");
    expect(out).not.toMatch(/"\s*onerror\s*=/);
  });

  test("giữ mục checklist của Quill", () => {
    expect(sanitizeNoteHtml('<ol><li data-list="checked">a</li></ol>')).toBe(
      '<ol><li data-list="checked">a</li></ol>',
    );
    expect(sanitizeNoteHtml('<ol><li data-list="unchecked">b</li></ol>')).toBe(
      '<ol><li data-list="unchecked">b</li></ol>',
    );
  });
});
