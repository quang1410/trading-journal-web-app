package service

import "journal/internal/metrics"

// Cửa sổ chỉ dành cho test: file _test.go nên các method này không tồn tại
// trong binary production, và không package nào ngoài service_test gọi được.
//
// Có chúng để test cũ soi được hai tập mà KHÔNG phải nới hai trường thành
// public — nới ra là mở lại đúng cái bẫy truyền nhầm mà JournalView sinh ra
// để đóng.

func (v *JournalView) AllForTest() []metrics.Enriched      { return v.all }
func (v *JournalView) FilteredForTest() []metrics.Enriched { return v.filtered }
