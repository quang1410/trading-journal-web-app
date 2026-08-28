package importer_test

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/importer"
)

func moFile(t *testing.T, ten string) *os.File {
	t.Helper()
	f, err := os.Open("testdata/" + ten)
	require.NoError(t, err)
	t.Cleanup(func() { _ = f.Close() })
	return f
}

func vnLoc(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	return loc
}

func TestParseFileHopLe(t *testing.T) {
	rep, err := importer.Parse(moFile(t, "happy.csv"), vnLoc(t))
	require.NoError(t, err)
	require.Empty(t, rep.Errors, "file sạch không được có lỗi dòng")
	require.Len(t, rep.Rows, 4)

	a := rep.Rows[0]
	require.Equal(t, "XAUUSD", a.Symbol)
	require.Equal(t, domain.DirectionLong, a.Direction)
	require.Equal(t, "500", a.Profit.String())
	require.Equal(t, "10", a.Fee.String())
	require.NotNil(t, a.ProfitTheory)
	require.Equal(t, "600", a.ProfitTheory.String())
	require.NotNil(t, a.Entry)
	require.Equal(t, "2300.5", a.Entry.String())
	require.Equal(t, "Break of Structure", a.Setup)
	require.Equal(t, "H4", a.Timeframe)
	require.Equal(t, domain.EntryPlanned, a.EntryQuality)
	require.Equal(t, domain.InTradeFollowed, a.InTradeQuality)
	require.Equal(t, domain.ExitHitTP, a.ExitQuality)
	require.Equal(t, domain.PsychNoError, a.Psychology)
	require.Equal(t, "lệnh sạch", a.Notes)
	// 2026-06-09 12:00 giờ VN = 05:00Z
	require.True(t, a.EnteredAt.Equal(time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC)), "được %v", a.EnteredAt)

	// Dòng 3: profit_theory để trống → nil, KHÁC với 0.
	require.Nil(t, rep.Rows[2].ProfitTheory, "ô rỗng phải là nil chứ không phải 0")

	// Dòng 4: bốn cột chấm điểm để trống là hợp lệ — lệnh chưa đánh giá.
	d := rep.Rows[3]
	require.Equal(t, "", d.EntryQuality)
	require.Equal(t, "", d.Psychology)
	// Setup rỗng về mặc định, không để chuỗi rỗng lọt xuống DB.
	require.Equal(t, domain.DefaultSetup, d.Setup)
}

// Test chứng minh đọc được FILE CŨ. Đây là ràng buộc bắt buộc của
// trading-journal-plan.md §1 — file gốc lưu BUY/SELL.
func TestParseFileExcelBUYSELLChoKetQuaGiongHet(t *testing.T) {
	loc := vnLoc(t)

	moi, err := importer.Parse(moFile(t, "happy.csv"), loc)
	require.NoError(t, err)
	cu, err := importer.Parse(moFile(t, "excel_buy_sell.csv"), loc)
	require.NoError(t, err)

	require.Empty(t, cu.Errors, "file BUY/SELL phải parse sạch, không một lỗi nào")
	require.Equal(t, moi.Rows, cu.Rows, "BUY/SELL phải cho kết quả y hệt Long/Short")
}

func TestParseDongHongBaoDungSoDongVaTenCot(t *testing.T) {
	rep, err := importer.Parse(moFile(t, "broken.csv"), vnLoc(t))
	require.NoError(t, err, "dòng hỏng là lỗi DÒNG, không phải lỗi file")

	require.Len(t, rep.Errors, 3)
	require.Len(t, rep.Rows, 1, "chỉ dòng tốt được giữ lại")
	require.Equal(t, "EURUSD", rep.Rows[0].Symbol)

	// Số dòng tính CẢ dòng header, để khớp với số dòng người dùng thấy trong
	// Excel. Lệch một dòng ở đây là bắt người ta đi soi nhầm ô.
	require.Equal(t, 2, rep.Errors[0].Line)
	require.Equal(t, "Long/ Short", rep.Errors[0].Column)
	require.Contains(t, rep.Errors[0].Msg, "RAC")

	require.Equal(t, 4, rep.Errors[1].Line)
	require.Equal(t, "Profit", rep.Errors[1].Column)

	require.Equal(t, 5, rep.Errors[2].Line)
	require.Equal(t, "Symbol", rep.Errors[2].Column)
}

// Cột derived có trong file thì BỎ QUA im lặng. Chúng là kết quả tính lại
// mỗi request (quy tắc 2 của CLAUDE.md); đọc chúng vào là lưu trường suy diễn.
func TestParseBoQuaCotDerived(t *testing.T) {
	rep, err := importer.Parse(moFile(t, "with_derived.csv"), vnLoc(t))
	require.NoError(t, err)
	require.Empty(t, rep.Errors)
	require.Len(t, rep.Rows, 1)
	require.Equal(t, "500", rep.Rows[0].Profit.String(), "phải đọc Profit gốc, không phải Profit đã trừ phí")
}

// STT của file bị bỏ qua: backend cấp (quy tắc 7). Account cũng bỏ qua:
// account suy từ URL.
func TestParseBoQuaSTTVaAccount(t *testing.T) {
	rep, err := importer.Parse(moFile(t, "happy.csv"), vnLoc(t))
	require.NoError(t, err)
	for i, r := range rep.Rows {
		require.Zero(t, r.STT, "dòng %d: STT phải để backend cấp", i)
		require.Zero(t, r.AccountID, "dòng %d: AccountID phải do service đặt", i)
	}
}

func TestParseDongTrongThiBoQuaChuKhongBaoLoi(t *testing.T) {
	rep, err := importer.Parse(moFile(t, "blank_rows.csv"), vnLoc(t))
	require.NoError(t, err)
	require.Empty(t, rep.Errors, "dòng trống không phải lỗi")
	require.Len(t, rep.Rows, 4, "4 dòng dữ liệu vẫn phải đọc đủ")

	// Fixture có 3 dòng trống nhưng Skipped chỉ đếm 1, và đó là đúng:
	// encoding/csv nuốt sẵn dòng RỖNG HẲN trước khi Parse nhìn thấy, nên chỉ
	// dòng ",,,,,," (có dấu phẩy, không có giá trị) mới đi qua dongTrong.
	// Skipped vì thế là "số dòng parser tự bỏ", không phải "số dòng trống
	// trong file" — nếu cần con số thứ hai thì phải đếm ở tầng khác.
	require.Equal(t, 1, rep.Skipped)
}

func TestParseNhanDauChamPhayLamPhanCach(t *testing.T) {
	rep, err := importer.Parse(moFile(t, "semicolon.csv"), vnLoc(t))
	require.NoError(t, err)
	require.Empty(t, rep.Errors)
	require.Len(t, rep.Rows, 4)
	require.Equal(t, "XAUUSD", rep.Rows[0].Symbol)
}

func TestParseBOMKhongLamHongCotDauTien(t *testing.T) {
	rep, err := importer.Parse(moFile(t, "bom.csv"), vnLoc(t))
	require.NoError(t, err)
	require.Empty(t, rep.Errors)
	require.Len(t, rep.Rows, 4)
}

func TestParseHeaderKhongPhanBietHoaThuongVaKhoangTrang(t *testing.T) {
	csv := "  day , SYMBOL ,long/short,profit\n2026-06-09,XAUUSD,BUY,100\n"
	rep, err := importer.Parse(strings.NewReader(csv), vnLoc(t))
	require.NoError(t, err)
	require.Empty(t, rep.Errors)
	require.Len(t, rep.Rows, 1)
	require.Equal(t, "XAUUSD", rep.Rows[0].Symbol)
	require.Equal(t, domain.DirectionLong, rep.Rows[0].Direction)
}

// Thiếu cột bắt buộc là lỗi CẤP FILE, không phải lỗi dòng: không có cách nào
// đọc tiếp mà có nghĩa, và báo 500 lỗi dòng giống nhau chỉ làm nhiễu.
func TestParseThieuCotBatBuocLaLoiCapFile(t *testing.T) {
	cases := []struct {
		ten string
		csv string
	}{
		{"thiếu Day", "Symbol,Long/ Short,Profit\nXAUUSD,BUY,100\n"},
		{"thiếu Symbol", "Day,Long/ Short,Profit\n2026-06-09,BUY,100\n"},
		{"thiếu Profit", "Day,Symbol,Long/ Short\n2026-06-09,XAUUSD,BUY\n"},
		{"thiếu Long/Short", "Day,Symbol,Profit\n2026-06-09,XAUUSD,100\n"},
	}
	for _, c := range cases {
		t.Run(c.ten, func(t *testing.T) {
			_, err := importer.Parse(strings.NewReader(c.csv), vnLoc(t))
			require.Error(t, err)
		})
	}
}

func TestParseFileRongLaLoiCapFile(t *testing.T) {
	_, err := importer.Parse(strings.NewReader(""), vnLoc(t))
	require.Error(t, err)
}

func TestParseChiCoHeaderThiKhongLoiVaKhongDong(t *testing.T) {
	rep, err := importer.Parse(strings.NewReader("Day,Symbol,Long/ Short,Profit\n"), vnLoc(t))
	require.NoError(t, err)
	require.Empty(t, rep.Rows)
	require.Empty(t, rep.Errors)
}

// Cột tuỳ chọn thiếu thì dùng giá trị mặc định, không phải lỗi: nhiều file
// chỉ có vài cột cơ bản.
func TestParseCotTuyChonThieuThiDungMacDinh(t *testing.T) {
	rep, err := importer.Parse(strings.NewReader(
		"Day,Symbol,Long/ Short,Profit\n2026-06-09,XAUUSD,BUY,100\n"), vnLoc(t))
	require.NoError(t, err)
	require.Len(t, rep.Rows, 1)
	r := rep.Rows[0]
	require.Equal(t, domain.DefaultSetup, r.Setup)
	require.Equal(t, "0", r.Fee.String(), "thiếu cột Phí thì phí bằng 0")
	require.Nil(t, r.ProfitTheory)
	require.Nil(t, r.Entry)
	require.Equal(t, "", r.Timeframe)
}

// Dòng thiếu ô ở cuối (Excel hay cắt cụt) không được panic.
func TestParseDongNganHonHeaderKhongPanic(t *testing.T) {
	rep, err := importer.Parse(strings.NewReader(
		"Day,Symbol,Long/ Short,Profit,Notes\n2026-06-09,XAUUSD,BUY,100\n"), vnLoc(t))
	require.NoError(t, err)
	require.Len(t, rep.Rows, 1)
	require.Equal(t, "", rep.Rows[0].Notes)
}
