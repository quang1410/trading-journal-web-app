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
	// ExistsActive báo lệnh còn tồn tại VÀ chưa xoá mềm — cùng phạm vi với
	// UpdateFields. Khác ByID: ByID cố ý nạp cả lệnh trong thùng rác (Restore
	// cần nó), nên không dùng được để quyết định một PATCH có nên chạy tiếp
	// hay dừng ở 404.
	ExistsActive(ctx context.Context, id int64) (bool, error)
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

// NoteTemplateStore là nơi cất mẫu ghi chú.
//
// Mọi method nhận userID và TỰ lọc theo nó: quyền sở hữu là phần của HỢP ĐỒNG,
// không phải việc service phải nhớ kiểm. Thao tác lên mẫu của người khác trả
// repository.ErrNotFound — cố ý không phải Forbidden, để không tiết lộ rằng
// mẫu đó có tồn tại.
//
// Ba hành vi là hợp đồng, không phải chi tiết cài đặt:
//
//  1. ListByUser sắp theo (position ASC, id ASC) và chỉ trả mẫu của user đó.
//  2. Create cấp position = max(position)+1 TRONG PHẠM VI user, ghi đè giá trị
//     người gọi đặt (quy tắc 7). Trùng (user_id, lower(name)) → ErrDuplicate.
//  3. ReorderOwned là ALL-OR-NOTHING: mảng chứa một id không thuộc user thì
//     không mẫu nào bị đổi.
type NoteTemplateStore interface {
	ListByUser(ctx context.Context, userID int64) ([]domain.NoteTemplate, error)
	Create(ctx context.Context, t domain.NoteTemplate) (domain.NoteTemplate, error)
	UpdateOwned(ctx context.Context, id, userID int64, fields map[string]any) error
	DeleteOwned(ctx context.Context, id, userID int64) error
	ReorderOwned(ctx context.Context, userID int64, ids []int64) error
}

// JournalNoteStore là nơi cất ghi chú theo kỳ.
//
// Mọi method nhận accountID và TỰ lọc theo nó: quyền sở hữu là phần của HỢP
// ĐỒNG, không phải việc service phải nhớ kiểm. Thao tác lên ghi chú của
// account khác trả repository.ErrNotFound — cố ý không phải Forbidden, để
// không tiết lộ rằng ghi chú đó tồn tại.
//
// Hai hành vi là hợp đồng, không phải chi tiết cài đặt:
//
//  1. ListByAccount sắp theo period_key TĂNG DẦN và chỉ trả ghi chú của đúng
//     kỳ được hỏi.
//  2. Upsert khoá trên (account_id, period, period_key): gọi hai lần cùng khoá
//     cho ra MỘT hàng mang nội dung lần sau, GIỮ NGUYÊN created_at lần đầu.
type JournalNoteStore interface {
	ListByAccount(ctx context.Context, accountID int64, period domain.Period) ([]domain.JournalNote, error)
	Upsert(ctx context.Context, n domain.JournalNote) (domain.JournalNote, error)
	DeleteOwned(ctx context.Context, accountID int64, ref domain.PeriodRef) error
}

var _ JournalNoteStore = (*repository.JournalNoteRepo)(nil)
