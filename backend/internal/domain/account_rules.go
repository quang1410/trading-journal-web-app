package domain

import (
	"errors"
	"fmt"
	"unicode/utf8"

	"github.com/shopspring/decimal"
)

// Loại tài khoản. KHÁC các enum ở enums.go: đây không phải key chấm điểm mà
// là giá trị ASCII của hợp đồng API — nhãn tiếng Việt nằm ở frontend
// (enumLabels.ts). Khớp CHECK constraint của migration 0006.
const (
	AccountPersonal = "personal"
	AccountProp     = "prop"
)

// Vòng thi của tài khoản quỹ, theo đúng thứ tự đi qua.
const (
	PhaseOne    = "phase_1"
	PhaseTwo    = "phase_2"
	PhaseFunded = "funded"
)

// Kết cục của vòng hiện tại. Người dùng tự chọn — backend không suy ra
// pass/fail từ luật của quỹ (spec §2).
const (
	ChallengeInProgress = "in_progress"
	ChallengePassed     = "passed"
	ChallengeFailed     = "failed"
)

// Thứ tự là thứ tự hiển thị. ChallengePhases còn là thứ tự của thanh vòng
// thi trên frontend, nên đổi thứ tự ở đây là đổi hình của thanh đó.
var (
	AccountTypes      = []string{AccountPersonal, AccountProp}
	ChallengePhases   = []string{PhaseOne, PhaseTwo, PhaseFunded}
	ChallengeStatuses = []string{ChallengeInProgress, ChallengePassed, ChallengeFailed}
)

// MaxPropFirmLen đếm theo KÝ TỰ, không theo byte: "Quỹ Việt" là 8 ký tự
// nhưng 11 byte.
const MaxPropFirmLen = 64

// NormalizeChallenge đưa dữ liệu thử thách về hình dạng hợp lệ TRƯỚC khi
// validate. Đây là ý định của người dùng, không phải lỗi của họ:
//
//   - Type rỗng là tài khoản cá nhân (mặc định của cột).
//   - Chuyển về cá nhân thì dữ liệu thi không còn nghĩa gì, xoá sạch. Báo lỗi
//     "còn tên quỹ" ở đây chỉ bắt người dùng xoá tay từng ô.
//   - Tài khoản quỹ mới mà chưa nói vòng nào thì bắt đầu ở Vòng 1, đang thi.
func (a *Account) NormalizeChallenge() {
	if a.Type == "" {
		a.Type = AccountPersonal
	}
	if a.Type != AccountProp {
		a.PropFirm = ""
		a.ChallengePhase, a.ChallengeStatus = nil, nil
		a.ProfitTarget, a.MaxDrawdownLimit = nil, nil
		return
	}
	if a.ChallengePhase == nil {
		p := PhaseOne
		a.ChallengePhase = &p
	}
	if a.ChallengeStatus == nil {
		s := ChallengeInProgress
		a.ChallengeStatus = &s
	}
}

// ValidateChallenge kiểm dữ liệu thử thách ĐÃ chuẩn hoá. Các luật ở đây trùng
// với CHECK của migration 0006 — DB là hàng rào cuối, còn đây là chỗ trả về
// một câu người dùng đọc được thay vì lỗi 500.
func (a Account) ValidateChallenge() error {
	if !Valid(AccountTypes, a.Type) {
		return fmt.Errorf("loại tài khoản %q không hợp lệ", a.Type)
	}
	if a.Type == AccountPersonal {
		return nil
	}
	if utf8.RuneCountInString(a.PropFirm) > MaxPropFirmLen {
		return fmt.Errorf("tên quỹ dài quá %d ký tự", MaxPropFirmLen)
	}
	if a.ChallengePhase == nil || !Valid(ChallengePhases, *a.ChallengePhase) {
		return errors.New("vòng thi không hợp lệ")
	}
	if a.ChallengeStatus == nil || !Valid(ChallengeStatuses, *a.ChallengeStatus) {
		return errors.New("trạng thái vòng thi không hợp lệ")
	}
	// Funded là vòng cuối: không còn vòng nào phía sau để "qua".
	if *a.ChallengePhase == PhaseFunded && *a.ChallengeStatus == ChallengePassed {
		return errors.New("tài khoản funded không có trạng thái đã qua")
	}
	if !fractionInRange(a.ProfitTarget) {
		return errors.New("mục tiêu lợi nhuận phải lớn hơn 0 và không quá 100%")
	}
	if !fitsRatioScale(a.ProfitTarget) {
		return errors.New("mục tiêu lợi nhuận chỉ được tối đa 2 chữ số thập phân")
	}
	if !fractionInRange(a.MaxDrawdownLimit) {
		return errors.New("max drawdown phải lớn hơn 0 và không quá 100%")
	}
	if !fitsRatioScale(a.MaxDrawdownLimit) {
		return errors.New("max drawdown chỉ được tối đa 2 chữ số thập phân")
	}
	return nil
}

// ratioScale khớp NUMERIC(6,4) của migration 0006: 4 chữ số sau dấu phẩy của
// phân số = 2 chữ số sau dấu phẩy của phần trăm người dùng gõ.
const ratioScale = 4

// fitsRatioScale chặn số mà DB sẽ làm tròn. Không chặn thì "0.00001" qua được
// fractionInRange, xuống DB thành 0, và từ đó mọi PATCH của account — kể cả
// chỉ đổi tên — đọc lại 0 rồi bị từ chối "phải lớn hơn 0".
func fitsRatioScale(v *decimal.Decimal) bool {
	return v == nil || v.Equal(v.Round(ratioScale))
}

// fractionInRange: nil nghĩa là "quỹ không đặt luật này" — hợp lệ.
func fractionInRange(v *decimal.Decimal) bool {
	return v == nil || (v.IsPositive() && !v.GreaterThan(decimal.NewFromInt(1)))
}
