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

// SetPasswordCheckForTest thay hai phép băm của Login, để test đếm được lần
// băm hoặc giữ một lần băm lại giữa chừng.
func (s *AuthService) SetPasswordCheckForTest(verify func(password, encoded string) (bool, error), dummy func(password string)) {
	s.check = passwordCheck{verify: verify, dummy: dummy}
}

// SetHashGateForTest đổi sức chứa và hạn chờ của cổng băm.
func (s *AuthService) SetHashGateForTest(slots int, wait time.Duration) {
	s.gate = newHashGate(slots, wait)
}
