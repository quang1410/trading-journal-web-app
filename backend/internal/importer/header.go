package importer

import (
	"fmt"
	"strings"

	"journal/internal/csvformat"
)

// Bảng tên cột và danh sách cột bắt buộc nằm ở package csvformat — dùng
// chung với exporter, để xuất-rồi-nhập-lại là ràng buộc CẤU TRÚC.

// detectColumns dò header một lần, trả bản đồ trường → chỉ số cột.
//
// Cột nào không nhận ra thì bỏ qua im lặng — đó chính là cách các cột derived
// (Tổng điểm, Drawdown, Profit cộng dồn…) bị loại: chúng đơn giản là không có
// tên trong bảng trên. Quy tắc 2 của CLAUDE.md nói không lưu trường suy diễn,
// và cách thi hành rẻ nhất là không bao giờ đọc chúng.
func detectColumns(header []string) (map[string]int, error) {
	positions := map[string]int{}
	for i, cell := range header {
		normalized := csvformat.NormalizeColumnName(cell)
		if normalized == "" {
			continue
		}
		for field, names := range csvformat.ColumnAliases {
			if _, seen := positions[field]; seen {
				continue // cột trùng tên: giữ cột trái nhất
			}
			for _, t := range names {
				if normalized == t {
					positions[field] = i
					break
				}
			}
		}
	}

	var missing []string
	for _, t := range csvformat.Required {
		if _, ok := positions[t]; !ok {
			missing = append(missing, t)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("file thiếu cột bắt buộc: %s", strings.Join(missing, ", "))
	}
	return positions, nil
}
