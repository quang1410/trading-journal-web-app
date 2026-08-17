// Package aggregate gom nhóm lệnh thành dữ liệu cho biểu đồ
// (trading-journal-plan.md §5). Thuần: không I/O, không DB.
package aggregate

import "journal/internal/metrics"

// Streaks tìm chuỗi thắng dài nhất và chuỗi thua dài nhất theo thứ tự STT (§5.1).
// Trả về hai số dương; chuỗi thua trả về độ dài, không phải số âm.
func Streaks(rows []metrics.Enriched) (longestWin, longestLoss int) {
	streak := 0
	for _, r := range rows {
		if r.WinSign > 0 {
			if streak > 0 {
				streak++
			} else {
				streak = 1
			}
		} else {
			if streak < 0 {
				streak--
			} else {
				streak = -1
			}
		}

		if streak > longestWin {
			longestWin = streak
		}
		if -streak > longestLoss {
			longestLoss = -streak
		}
	}
	return longestWin, longestLoss
}
