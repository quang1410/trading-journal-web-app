package importer

import (
	"fmt"
	"strings"
)

// Tên cột của trading-journal-plan.md §0. Đây là hợp đồng với file Excel gốc.
//
// Mỗi trường nhận NHIỀU tên: file gốc dùng tiếng Việt, file do web xuất ra
// dùng cùng tên đó, và người dùng có thể tự sửa header thành tiếng Anh. Nhận
// rộng ở đây rẻ hơn nhiều so với bắt người ta sửa lại file.
var tenCot = map[string][]string{
	"day":              {"day", "ngày", "ngay", "date"},
	"symbol":           {"symbol", "mã", "ma", "cặp", "cap"},
	"direction":        {"long/short", "direction", "chiều", "chieu", "buy/sell"},
	"entry":            {"entry", "giá vào", "gia vao"},
	"exit":             {"exit", "giá ra", "gia ra"},
	"volume":           {"volume", "khối lượng", "khoi luong", "vol"},
	"profit":           {"profit", "lãi", "lai", "lợi nhuận", "loi nhuan"},
	"profit_theory":    {"profit lý thuyết", "profit ly thuyet", "profit theory"},
	"fee":              {"phí", "phi", "fee", "phí giao dịch"},
	"setup":            {"setup", "mô hình", "mo hinh"},
	"timeframe":        {"timeframe", "khung thời gian", "khung thoi gian", "tf"},
	"entry_quality":    {"vào lệnh", "vao lenh", "entry quality"},
	"in_trade_quality": {"trong lệnh", "trong lenh", "in trade quality"},
	"exit_quality":     {"thoát lệnh", "thoat lenh", "exit quality"},
	"psychology":       {"tâm lý giao dịch", "tam ly giao dich", "tâm lý", "tam ly", "psychology"},
	"notes":            {"notes", "ghi chú", "ghi chu", "note"},
}

// batBuoc là bốn cột không có thì không dựng nổi một lệnh có nghĩa.
//
// Cố ý KHÔNG bắt buộc: entry/exit/volume (lệnh nhập tay được để trống),
// fee (mặc định 0), và toàn bộ cột chấm điểm (lệnh chưa đánh giá là hợp lệ).
var batBuoc = []string{"day", "symbol", "direction", "profit"}

// nhanDienCot dò header một lần, trả bản đồ trường → chỉ số cột.
//
// Cột nào không nhận ra thì bỏ qua im lặng — đó chính là cách các cột derived
// (Tổng điểm, Drawdown, Profit cộng dồn…) bị loại: chúng đơn giản là không có
// tên trong bảng trên. Quy tắc 2 của CLAUDE.md nói không lưu trường suy diễn,
// và cách thi hành rẻ nhất là không bao giờ đọc chúng.
func nhanDienCot(header []string) (map[string]int, error) {
	viTri := map[string]int{}
	for i, o := range header {
		chuan := chuanHoaTenCot(o)
		if chuan == "" {
			continue
		}
		for truong, ten := range tenCot {
			if _, da := viTri[truong]; da {
				continue // cột trùng tên: giữ cột trái nhất
			}
			for _, t := range ten {
				if chuan == t {
					viTri[truong] = i
					break
				}
			}
		}
	}

	var thieu []string
	for _, t := range batBuoc {
		if _, có := viTri[t]; !có {
			thieu = append(thieu, t)
		}
	}
	if len(thieu) > 0 {
		return nil, fmt.Errorf("file thiếu cột bắt buộc: %s", strings.Join(thieu, ", "))
	}
	return viTri, nil
}

// chuanHoaTenCot đưa một ô header về dạng so sánh được: bỏ BOM, gộp khoảng
// trắng, hạ chữ thường.
//
// Gộp khoảng trắng là bắt buộc chứ không phải cho đẹp: header cột G của file
// gốc là "Long/ Short" — có một dấu cách lẻ sau dấu gạch chéo. So khớp
// nguyên văn sẽ trượt đúng cột quan trọng nhất của phase này.
func chuanHoaTenCot(s string) string {
	s = strings.TrimPrefix(s, "\uFEFF")
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.Join(strings.Fields(s), " ")
	// Bỏ khoảng trắng quanh dấu gạch chéo: header cột G của file gốc là
	// "Long/ Short" — một dấu cách lẻ SAU dấu gạch chéo. Không chuẩn hoá chỗ
	// này thì trượt đúng cột quan trọng nhất của phase, và thông điệp lỗi sẽ
	// nói "thiếu cột direction" trong khi cột đó đang nằm ngay trước mắt.
	return strings.ReplaceAll(strings.ReplaceAll(s, " /", "/"), "/ ", "/")
}
