package csvformat_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/csvformat"
)

// Escape và Unescape là một CẶP NGHỊCH ĐẢO. Đây là bất biến chính của package.
//
// Trước Task 4 hai nửa nằm ở hai package khác nhau (exporter.Escape và
// importer.stripLeadingQuote) nên ràng buộc này chỉ được giữ bằng thiện chí; giờ nó
// được ghim ngay cạnh cài đặt.
func TestEscapeUnescapeAreInverses(t *testing.T) {
	for _, s := range []string{
		"",
		"Breakout",
		"XAUUSD",
		"=1+1",
		"=HYPERLINK(\"http://x\")",
		"+84",
		"-500",
		"@user",
		"\tbắt đầu bằng tab",
		"\rbắt đầu bằng CR",
		"ghi chú bình thường",
		"Đúng kế hoạch",
		"'đã có nháy sẵn",
		// Ô người dùng gõ THẬT bắt đầu bằng nháy rồi tới ký tự công thức.
		// Trước khi vá, Escape để nguyên (byte đầu là "'", không phải ký tự
		// công thức) rồi Unescape gỡ mất nháy — mỗi vòng xuất-nhập mất một
		// ký tự, im lặng. Đây là ca hồi quy của lỗi đó.
		"'=SUM(A1)",
		"'=không phải công thức",
		"'+84",
		"'@user",
		"'-500",
		"''=hai nháy",
		"chuỗi có = ở giữa",
		"  khoảng trắng đầu",
	} {
		t.Run(s, func(t *testing.T) {
			require.Equal(t, s, csvformat.Unescape(csvformat.Escape(s)),
				"xuất rồi nhập lại phải ra đúng chuỗi gốc")
		})
	}
}

// Escape CHỈ thêm nháy khi ô mở đầu bằng ký tự công thức. Thêm bừa sẽ làm
// bẩn mọi ô chữ bình thường.
func TestEscapeOnlyWrapsCellsStartingWithFormulaChar(t *testing.T) {
	for _, s := range []string{"Breakout", "XAUUSD", "ghi chú", "", "1+1", "a=b"} {
		require.Equal(t, s, csvformat.Escape(s), "%q không phải công thức", s)
	}
	for _, s := range []string{"=1+1", "+84", "-500", "@user"} {
		require.Equal(t, "'"+s, csvformat.Escape(s), "%q phải được bọc", s)
	}
}

// Unescape KHÔNG được gỡ nháy của một chuỗi vốn bắt đầu bằng nháy nhưng ký tự
// sau đó không phải ký tự công thức — đó là chuỗi của người dùng, không phải
// dấu thoát.
func TestUnescapeKeepsQuoteOfOrdinaryString(t *testing.T) {
	require.Equal(t, "'abc", csvformat.Unescape("'abc"))
	require.Equal(t, "'", csvformat.Unescape("'"))
	require.Equal(t, "=1+1", csvformat.Unescape("'=1+1"))
}

// Header trả BẢN SAO: người gọi sửa nhầm một phần tử không được đổi định dạng
// file của cả hệ thống.
func TestHeaderReturnsCopy(t *testing.T) {
	a := csvformat.Header()
	a[0] = "ĐÃ BỊ SỬA"
	require.Equal(t, "STT", csvformat.Header()[0], "Header phải trả bản sao mới mỗi lần")
	require.Equal(t, "STT", csvformat.Columns[0])
}

// Ràng buộc round-trip ở mức HEADER: mỗi cột input mà exporter ghi ra phải
// được chính bảng alias nhận diện lại, nếu không thì file web xuất ra sẽ
// không nhập lại được.
func TestEveryExportedInputColumnIsRecognizedBack(t *testing.T) {
	// 18 cột đầu là phần input; phần còn lại là derived và CỐ Ý không nhận diện.
	recognized := map[string]bool{}
	for _, name := range csvformat.ColumnAliases {
		for _, t := range name {
			recognized[t] = true
		}
	}

	// Những cột này exporter ghi ra nhưng importer cố ý bỏ qua: STT và
	// Account do backend cấp (quy tắc 7), không đọc từ file.
	skip := map[string]bool{"stt": true, "account": true}

	for _, col := range csvformat.Columns[:csvformat.InputColumnCount] {
		c := csvformat.NormalizeColumnName(col)
		if skip[c] {
			continue
		}
		require.True(t, recognized[c],
			"cột input %q xuất ra nhưng bảng alias không nhận lại được — file web xuất sẽ không nhập lại được", col)
	}
}

// Cột DERIVED không được trùng alias của cột input. Trùng thì importer sẽ đọc
// một cột suy diễn vào chỗ cột nhập, tức lưu trường suy diễn — phá quy tắc 2.
func TestDerivedColumnsDoNotShareInputAliases(t *testing.T) {
	recognized := map[string]bool{}
	for _, name := range csvformat.ColumnAliases {
		for _, t := range name {
			recognized[t] = true
		}
	}
	for _, col := range csvformat.Columns[csvformat.InputColumnCount:] {
		require.False(t, recognized[csvformat.NormalizeColumnName(col)],
			"cột derived %q trùng alias của một cột input — importer sẽ đọc nhầm nó", col)
	}
}

// Bốn cột bắt buộc phải nằm trong bảng alias, nếu không thì mọi file đều báo
// thiếu cột.
func TestRequiredColumnsAllInAliasTable(t *testing.T) {
	require.Equal(t, []string{"day", "symbol", "direction", "profit"}, csvformat.Required)
	for _, t2 := range csvformat.Required {
		require.NotEmpty(t, csvformat.ColumnAliases[t2], "cột bắt buộc %q không có alias nào", t2)
	}
}

// Ô đã sẵn nháy dẫn đầu phải được bọc THÊM một nháy, nếu không vòng nhập sẽ
// gỡ mất cái nháy vốn là dữ liệu của người dùng.
func TestEscapeWrapsCellAlreadyLeadingQuote(t *testing.T) {
	require.Equal(t, "''=SUM(A1)", csvformat.Escape("'=SUM(A1)"))
	require.Equal(t, "'=SUM(A1)", csvformat.Unescape("''=SUM(A1)"))
}

// formulaChars PHẢI toàn ASCII.
//
// Escape/Unescape so khớp trên BYTE đầu (`rune(s[0])`), không phải rune đầu.
// Cách đó chỉ đúng khi mọi ký tự trong tập đều là ASCII: mọi byte của một ký
// tự UTF-8 nhiều byte đều >= 0x80 nên không thể trùng ký tự ASCII nào. Thêm
// một ký tự không-ASCII vào tập — ví dụ dấu trừ "−" U+2212 hay dấu bằng toàn
// rộng "＝" U+FF1D mà người dùng dán từ bảng tính — sẽ khiến hàm so khớp trên
// một MẢNH byte, và test này là chỗ việc đó bị bắt.
func TestFormulaCharsMustBeAllASCII(t *testing.T) {
	for _, r := range csvformat.FormulaChars() {
		require.Less(t, r, rune(0x80),
			"ký tự %q trong formulaChars không phải ASCII — Escape/Unescape so khớp theo byte nên sẽ sai", r)
	}
}

// Không ô chữ tiếng Việt nào bị Escape nhầm: chúng bắt đầu bằng byte >= 0x80.
func TestEscapeLeavesVietnameseTextAlone(t *testing.T) {
	for _, s := range []string{"Đúng kế hoạch", "Ăn theo trend", "Đảo chiều", "ưu tiên", "＝toàn rộng", "−dấu trừ U+2212"} {
		require.Equal(t, s, csvformat.Escape(s), "%q không phải công thức", s)
		require.Equal(t, s, csvformat.Unescape(s))
	}
}

// InputColumnCount phải trỏ đúng ranh giới input/derived.
//
// Ghim bằng hai đầu mút: cột cuối của nửa input là "Notes", cột đầu của nửa
// derived là "Loại lệnh". Chèn một cột mà quên sửa InputColumnCount sẽ làm test
// này đỏ ngay, thay vì lặng lẽ đảo ý nghĩa của hai test cấu trúc kia.
func TestInputColumnCountPointsAtCorrectBoundary(t *testing.T) {
	require.Equal(t, "Notes", csvformat.Columns[csvformat.InputColumnCount-1],
		"cột cuối của nửa input phải là Notes")
	require.Equal(t, "Loại lệnh", csvformat.Columns[csvformat.InputColumnCount],
		"cột đầu của nửa derived phải là Loại lệnh")
}

// Mọi alias trong bảng phải là dạng ĐÃ CHUẨN HOÁ của chính nó.
//
// detectColumns so khớp `NormalizeColumnName(ô header) == alias`, nên một
// alias chưa chuẩn hoá (chữ hoa, khoảng trắng thừa, "long/ short" có dấu
// cách sau gạch chéo) là alias KHÔNG BAO GIỜ khớp được — cột đó lặng lẽ
// không nhận diện được, và nếu nó nằm trong Required thì mọi file đều báo
// thiếu cột. Vế trái không tự kiểm được điều này vì nó chỉ so hai chuỗi.
func TestEveryAliasIsAlreadyNormalized(t *testing.T) {
	for field, names := range csvformat.ColumnAliases {
		for _, alias := range names {
			require.Equal(t, alias, csvformat.NormalizeColumnName(alias),
				"alias %q của trường %q chưa ở dạng chuẩn hoá nên không bao giờ khớp", alias, field)
		}
	}
}
