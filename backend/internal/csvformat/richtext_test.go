package csvformat

import "testing"

func TestNotesToText(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"rỗng", "", ""},
		{
			"ghi chú cũ là chữ thuần thì đi qua nguyên vẹn",
			"vào lệnh hơi sớm",
			"vào lệnh hơi sớm",
		},
		{"bóc thẻ giữ chữ", "<p><strong>Vào sớm</strong> quá</p>", "Vào sớm quá"},
		{
			// Nối thẳng hai đoạn sẽ bịa ra một từ không ai gõ.
			"ranh giới đoạn thành xuống dòng",
			"<p>Vào lệnh sớm</p><p>Bài học: chờ nến đóng</p>",
			"Vào lệnh sớm\nBài học: chờ nến đóng",
		},
		{"br thành xuống dòng", "<p>dòng một<br>dòng hai</p>", "dòng một\ndòng hai"},
		{"br tự đóng cũng vậy", "<p>một<br />hai</p>", "một\nhai"},
		{
			"mỗi mục danh sách một dòng",
			`<ol><li data-list="bullet">một</li><li data-list="bullet">hai</li></ol>`,
			"một\nhai",
		},
		{
			"giải mã thực thể về ký tự gốc",
			"<p>giá &lt; 2000 &amp; RR &gt; 2</p>",
			"giá < 2000 & RR > 2",
		},
		{
			// Giải mã & trước thì "&amp;lt;" ra "<" — sai một bậc.
			"thực thể lồng nhau giải mã đúng một bậc",
			"<p>&amp;lt;</p>",
			"&lt;",
		},
		{"editor rỗng ra chuỗi rỗng", "<p><br></p>", ""},
		{"nhiều dòng trống rút về một dòng trống", "<p>a</p><p></p><p></p><p>b</p>", "a\n\nb"},
		{"link giữ chữ, bỏ thẻ", `<p><a href="https://x.com">chart</a></p>`, "chart"},
		{"chữ có thể chứa dấu nhỏ hơn mà không phải thẻ", "giá < 2000", "giá < 2000"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := NotesToText(tc.in); got != tc.want {
				t.Errorf("NotesToText(%q) = %q, muốn %q", tc.in, got, tc.want)
			}
		})
	}
}

// Escape bọc ô mở đầu bằng ký tự công thức. Ghi chú HTML mở đầu bằng "<p>"
// nên KHÔNG bị bọc — nhưng sau khi bóc thẻ, chữ bên trong có thể bắt đầu bằng
// "=". Thứ tự đúng là bóc trước, bọc sau; ngược lại thì Excel chạy nó.
func TestNotesToTextThenEscapeGuardsFormula(t *testing.T) {
	got := Escape(NotesToText("<p>=1+1</p>"))
	if got == "=1+1" {
		t.Fatalf("ghi chú thành công thức Excel: %q", got)
	}
	if want := "'=1+1"; got != want {
		t.Errorf("Escape(NotesToText(...)) = %q, muốn %q", got, want)
	}
}

// Trạng thái của một mục việc là toàn bộ lý do người dùng gõ danh sách đó;
// bóc thẻ trần thì đã làm và chưa làm xuất ra giống hệt nhau.
func TestNotesToTextChecklistVaAnh(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			"checklist giữ trạng thái đã làm / chưa làm",
			`<ol><li data-list="checked">chờ nến đóng</li><li data-list="unchecked">có SMT xác nhận</li></ol>`,
			"[x] chờ nến đóng\n[ ] có SMT xác nhận",
		},
		{
			"checklist lẫn với gạch đầu dòng thường",
			`<ul><li data-list="bullet">thường</li><li data-list="checked">đã xong</li></ul>`,
			"thường\n[x] đã xong",
		},
		{
			// Ghi chú CHỈ có ảnh mà xuất ra ô rỗng thì người đọc file tưởng
			// lệnh đó không ghi gì cả.
			"ảnh có alt thì lấy alt",
			`<p><img src="https://i.imgur.com/a.png" alt="chart NQ M5"></p>`,
			"[ảnh: chart NQ M5]",
		},
		{
			"ảnh alt rỗng thì lấy link, để còn mở lại được",
			`<p><img src="https://i.imgur.com/a.png" alt=""></p>`,
			"[ảnh: https://i.imgur.com/a.png]",
		},
		{
			"ảnh nằm cùng chữ thì giữ cả hai",
			`<p>Trước lệnh:</p><p><img src="https://x.com/a.png" alt="setup"></p>`,
			"Trước lệnh:\n[ảnh: setup]",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := NotesToText(tc.in); got != tc.want {
				t.Errorf("NotesToText() = %q, muốn %q", got, tc.want)
			}
		})
	}
}
