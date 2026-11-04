package service

import (
	"time"

	"journal/internal/metrics"
)

// Cửa sổ chỉ dành cho test: file _test.go nên các method này không tồn tại
// trong binary production, và không package nào ngoài service_test gọi được.
//
// Có chúng để test cũ soi được hai tập mà KHÔNG phải nới hai trường thành
// public — nới ra là mở lại đúng cái bẫy truyền nhầm mà JournalView sinh ra
// để đóng.

func (v *JournalView) AllForTest() []metrics.Enriched      { return v.all }
func (v *JournalView) FilteredForTest() []metrics.Enriched { return v.filtered }

// SetSaveTimeoutsForTest thu nhỏ hạn ghi của nút Cập nhật và ngân sách của cron để test DB chậm
// chạy trong mili giây thay vì vài giây.
func (s *LiveBarService) SetSaveTimeoutsForTest(save, cron time.Duration) {
	s.saveTimeout, s.cronBudget = save, cron
}
