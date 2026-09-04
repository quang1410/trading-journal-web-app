package service

import (
	"context"
	"time"

	"journal/internal/domain"
	"journal/internal/repository"
)

// Các interface dưới đây là SEAM giữa service và nơi cất dữ liệu.
//
// Khai báo ở đây — phía người DÙNG interface — chứ không ở repository, đúng
// kiểu Go: người gọi công bố mình cần gì, người cài đặt không phải biết ai
// đang dùng mình. Nhờ vậy repository không import service, và không có vòng
// phụ thuộc nào.
//
// Mỗi interface rộng ĐÚNG BẰNG những gì service đang gọi, không thêm một
// method nào cho "sau này có thể cần". Interface thừa là interface không ai
// cài đặt đúng được, và nó bắt mọi adapter phải viết thân hàm rỗng.
//
// Có HAI adapter cho mỗi seam, và đó là điều kiện để seam này có thật:
// *repository.XRepo chạy trên Postgres ở production, memXStore chạy trong RAM
// ở test. Ràng buộc "hai adapter phải cùng hành vi" được ghim bằng contract
// test dùng chung (xem store_contract_test.go), không bằng thiện chí.

// TradeStore là nơi cất lệnh.
//
// Ba hành vi dưới đây là HỢP ĐỒNG, không phải chi tiết cài đặt, vì service
// dựa vào chúng để tính đúng:
//
//  1. ListByAccount trả lệnh CHƯA xoá, sắp theo stt TĂNG DẦN. Mọi trường lũy
//     kế (cum_by_trade, running_peak, drawdown) tính theo thứ tự này.
//  2. Create cấp stt = max(stt)+1 quét CẢ lệnh đã xoá mềm. Đếm sót lệnh đã
//     xoá thì khôi phục lệnh cũ sẽ đụng UNIQUE (account_id, stt).
//  3. Thao tác không tìm thấy bản ghi trả repository.ErrNotFound, không phải
//     nil. Xoá hai lần, hay khôi phục một lệnh chưa xoá, đều là ErrNotFound.
type TradeStore interface {
	ListByAccount(ctx context.Context, accountID int64) ([]domain.Trade, error)
	ListDeletedByAccount(ctx context.Context, accountID int64) ([]domain.Trade, error)
	ByID(ctx context.Context, id int64) (domain.Trade, error)
	Create(ctx context.Context, t domain.Trade) (domain.Trade, error)
	CreateBatch(ctx context.Context, accountID int64, ts []domain.Trade) ([]domain.Trade, error)
	UpdateFields(ctx context.Context, id int64, fields map[string]any) error
	SoftDelete(ctx context.Context, id int64) error
	Restore(ctx context.Context, id int64) error
	Facets(ctx context.Context, accountID int64) (symbols, setups []string, err error)
}

// AccountStore là nơi cất tài khoản giao dịch.
//
// Create trả repository.ErrDuplicate khi trùng (user_id, code) — service dịch
// nó thành 409, nên adapter nào nuốt lỗi này sẽ làm mất một mã lỗi HTTP.
type AccountStore interface {
	ListByUser(ctx context.Context, userID int64) ([]domain.Account, error)
	Create(ctx context.Context, a domain.Account) (domain.Account, error)
	ByID(ctx context.Context, id int64) (domain.Account, error)
	Update(ctx context.Context, a domain.Account) error
}

// CashFlowStore là nơi cất giao dịch nạp/rút.
type CashFlowStore interface {
	ListByAccount(ctx context.Context, accountID int64) ([]domain.CashFlow, error)
	Create(ctx context.Context, cf domain.CashFlow) (domain.CashFlow, error)
	ByID(ctx context.Context, id int64) (domain.CashFlow, error)
	DeleteOwned(ctx context.Context, id, accountID int64) error
}

// UserStore là nơi cất người dùng.
//
// Nhận và trả repository.UserRow chứ không phải một kiểu của domain: user
// chưa xuất hiện trong bất kỳ công thức nghiệp vụ nào — nó thuần tuý là
// chuyện hạ tầng, và đó cũng là lý do repository.UserRow tồn tại.
type UserStore interface {
	Count(ctx context.Context) (int64, error)
	Create(ctx context.Context, email, passwordHash string) (repository.UserRow, error)
	ByEmail(ctx context.Context, email string) (repository.UserRow, error)
	ByID(ctx context.Context, id int64) (repository.UserRow, error)
}

// RefreshTokenStore là nơi cất refresh token đã băm.
type RefreshTokenStore interface {
	Create(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time) error
	ByHash(ctx context.Context, tokenHash string) (repository.RefreshTokenRow, error)
	Revoke(ctx context.Context, id int64, at time.Time) error
	RevokeAllForUser(ctx context.Context, userID int64, at time.Time) error
}

// Khẳng định lúc BIÊN DỊCH rằng repo thật vẫn thoả interface.
//
// Không có mấy dòng này, một thay đổi chữ ký ở repository sẽ chỉ lộ ra ở chỗ
// gọi trong main.go — xa nguyên nhân. Ở đây nó gãy ngay tại file khai báo seam.
var (
	_ TradeStore        = (*repository.TradeRepo)(nil)
	_ AccountStore      = (*repository.AccountRepo)(nil)
	_ CashFlowStore     = (*repository.CashFlowRepo)(nil)
	_ UserStore         = (*repository.UserRepo)(nil)
	_ RefreshTokenStore = (*repository.RefreshTokenRepo)(nil)
)
