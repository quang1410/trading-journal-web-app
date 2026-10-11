package repository

import (
	"context"

	"gorm.io/gorm"

	"journal/internal/domain"
)

type WaitlistRepo struct{ db *gorm.DB }

func NewWaitlistRepo(db *gorm.DB) *WaitlistRepo { return &WaitlistRepo{db: db} }

// Insert thêm một email. Email đã có thì KHÔNG làm gì và KHÔNG báo lỗi:
// service trả cùng một phản hồi cho email mới và cũ, nên tầng này không được
// biến "đã có" thành ErrDuplicate.
func (r *WaitlistRepo) Insert(ctx context.Context, s domain.WaitlistSignup) error {
	const q = `INSERT INTO waitlist_signups (email, locale, source)
	           VALUES (?, ?, ?)
	           ON CONFLICT (email) DO NOTHING`
	return translate(r.db.WithContext(ctx).Exec(q, s.Email, s.Locale, s.Source).Error)
}

// SaveAnswers ghi ba câu trả lời đúng MỘT lần: điều kiện answered_at IS NULL
// làm lần gửi thứ hai (hoặc người khác biết email) thành no-op. Email không
// tồn tại cũng là no-op — không trả ErrNotFound, để handler không lộ email
// nào đã đăng ký.
func (r *WaitlistRepo) SaveAnswers(ctx context.Context, email string, a domain.WaitlistAnswers) error {
	const q = `UPDATE waitlist_signups
	           SET journal_tool = ?, markets = ?, prop_status = ?, answered_at = now()
	           WHERE email = ? AND answered_at IS NULL`
	return translate(r.db.WithContext(ctx).Exec(q, a.JournalTool, a.Markets, a.PropStatus, email).Error)
}
