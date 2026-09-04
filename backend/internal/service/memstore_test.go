package service_test

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/repository"
)

// Adapter in-memory cho các seam của service. Chỉ tồn tại trong test — file
// đuôi _test.go nên không lọt vào binary production.
//
// Vì sao viết tay thay vì sinh mock: mock kiểm được "có gọi hàm không", còn
// thứ service thật sự dựa vào là HÀNH VI — stt tăng dần và quét cả lệnh đã
// xoá, soft delete lần hai báo ErrNotFound, Facets loại chuỗi rỗng. Mock
// không diễn đạt được mấy điều đó, nên nó sẽ xanh cả khi service sai.
//
// Ràng buộc "adapter này cư xử giống Postgres" KHÔNG dựa vào thiện chí: nó
// được ghim bằng store_contract_test.go, bộ test chạy hai lượt trên cả hai
// adapter. Sửa một hành vi ở đây mà không sửa ở repo thật sẽ làm contract đỏ.

// memTradeStore giữ lệnh trong RAM.
//
// deleted map ID → thời điểm xoá, tách khỏi domain.Trade vì domain.Trade cố ý
// không mang trường DeletedAt (nó chỉ mang thứ người dùng nhập) — đúng như
// bảng trades thật, nơi deleted_at là cột của hạ tầng.
type memTradeStore struct {
	hat     sync.Mutex
	rows    map[int64]domain.Trade
	deleted map[int64]time.Time
	nextID  int64

	// countListByAccount đếm số lần nạp toàn bảng. Task 2 dùng nó để chứng minh
	// một request chỉ nạp MỘT lần.
	countListByAccount int
}

func newMemTradeStore() *memTradeStore {
	return &memTradeStore{
		rows:    map[int64]domain.Trade{},
		deleted: map[int64]time.Time{},
		nextID:  1,
	}
}

// bySTT trả các lệnh của account thoả dieuKien, đã sắp theo stt tăng dần.
func (m *memTradeStore) bySTT(accountID int64, condition func(id int64) bool) []domain.Trade {
	var out []domain.Trade
	for id, t := range m.rows {
		if t.AccountID == accountID && condition(id) {
			out = append(out, t)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].STT < out[j].STT })
	return out
}

func (m *memTradeStore) notDeleted(id int64) bool {
	_, already := m.deleted[id]
	return !already
}

func (m *memTradeStore) ListByAccount(_ context.Context, accountID int64) ([]domain.Trade, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	m.countListByAccount++
	return m.bySTT(accountID, m.notDeleted), nil
}

// ListDeletedByAccount trả lệnh trong thùng rác, mới xoá lên trước — cùng thứ
// tự với repo thật (`ORDER BY deleted_at DESC, stt DESC`).
func (m *memTradeStore) ListDeletedByAccount(_ context.Context, accountID int64) ([]domain.Trade, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	out := m.bySTT(accountID, func(id int64) bool { return !m.notDeleted(id) })
	sort.SliceStable(out, func(i, j int) bool {
		ti, tj := m.deleted[out[i].ID], m.deleted[out[j].ID]
		if !ti.Equal(tj) {
			return ti.After(tj)
		}
		return out[i].STT > out[j].STT
	})
	return out, nil
}

// ByID nạp lệnh KỂ CẢ đã xoá mềm — Restore và middleware kiểm quyền sở hữu
// đều phải đọc được lệnh trong thùng rác.
func (m *memTradeStore) ByID(_ context.Context, id int64) (domain.Trade, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	t, ok := m.rows[id]
	if !ok {
		return domain.Trade{}, repository.ErrNotFound
	}
	return t, nil
}

// nextSTT cấp stt kế tiếp, quét CẢ lệnh đã xoá mềm.
//
// Đây là hành vi sống còn (bất biến I4): đếm sót lệnh đã xoá thì xoá lệnh
// cuối rồi tạo lệnh mới sẽ cấp lại đúng stt vừa trống, và lúc khôi phục lệnh
// cũ sẽ đụng UNIQUE (account_id, stt) ở repo thật.
func (m *memTradeStore) nextSTT(accountID int64) int {
	max := 0
	for _, t := range m.rows {
		if t.AccountID == accountID && t.STT > max {
			max = t.STT
		}
	}
	return max + 1
}

func (m *memTradeStore) Create(_ context.Context, t domain.Trade) (domain.Trade, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	t.ID = m.nextID
	m.nextID++
	t.STT = m.nextSTT(t.AccountID) // stt do người gọi đặt bị GHI ĐÈ (quy tắc 7)
	m.rows[t.ID] = t
	return t, nil
}

// CreateBatch cấp dãy stt liên tiếp theo đúng thứ tự slice đầu vào.
//
// Thứ tự slice là HỢP ĐỒNG chứ không phải chi tiết: stt quyết định thứ tự
// lũy kế, nên đảo nó là dựng một đường equity không có thật.
func (m *memTradeStore) CreateBatch(_ context.Context, accountID int64, ts []domain.Trade) ([]domain.Trade, error) {
	if len(ts) == 0 {
		return []domain.Trade{}, nil
	}
	m.hat.Lock()
	defer m.hat.Unlock()

	batch := make([]domain.Trade, len(ts))
	copy(batch, ts) // bản sao: người gọi không nên thấy slice của mình bị sửa stt

	next := m.nextSTT(accountID)
	for i := range batch {
		batch[i].AccountID = accountID
		batch[i].STT = next + i
		batch[i].ID = m.nextID
		m.nextID++
	}
	// Ghi sau khi đã dựng xong cả lô: hỏng giữa chừng thì không dòng nào vào,
	// giống hệt transaction của repo thật.
	for _, t := range batch {
		m.rows[t.ID] = t
	}
	return batch, nil
}

// UpdateFields ghi đúng những cột có trong fields.
//
// Tên cột phải khớp TỪNG CHỮ với tên cột SQL mà patchToFields sinh ra; lệch
// một tên là lặng lẽ không ghi gì. Nhánh default panic để một cột mới thêm
// vào patchToFields không thể trôi qua adapter này mà không ai biết.
func (m *memTradeStore) UpdateFields(_ context.Context, id int64, fields map[string]any) error {
	if len(fields) == 0 {
		return nil
	}
	m.hat.Lock()
	defer m.hat.Unlock()

	t, ok := m.rows[id]
	// Cùng điều kiện với repo thật (`WHERE id = ? AND deleted_at IS NULL`):
	// sửa một lệnh trong thùng rác là ErrNotFound.
	if !ok || !m.notDeleted(id) {
		return repository.ErrNotFound
	}

	// moneyPtr đổi giá trị nhận được thành *decimal.Decimal; nil giữ nguyên nil
	// để "xoá giá trị" đi tới được đích, đúng như cột NULLable ở DB.
	moneyPtr := func(v any) *decimal.Decimal {
		if v == nil {
			return nil
		}
		d := v.(decimal.Decimal)
		return &d
	}

	for col, v := range fields {
		switch col {
		case "entered_at":
			t.EnteredAt = v.(time.Time)
		case "symbol":
			t.Symbol = v.(string)
		case "direction":
			t.Direction = v.(string)
		case "profit":
			t.Profit = v.(decimal.Decimal)
		case "fee":
			t.Fee = v.(decimal.Decimal)
		case "setup":
			t.Setup = v.(string)
		case "notes":
			t.Notes = v.(string)
		case "timeframe":
			t.Timeframe = v.(string)
		case "entry_quality":
			t.EntryQuality = v.(string)
		case "in_trade_quality":
			t.InTradeQuality = v.(string)
		case "exit_quality":
			t.ExitQuality = v.(string)
		case "psychology":
			t.Psychology = v.(string)
		case "entry":
			t.Entry = moneyPtr(v)
		case "exit":
			t.Exit = moneyPtr(v)
		case "volume":
			t.Volume = moneyPtr(v)
		case "profit_theory":
			t.ProfitTheory = moneyPtr(v)
		case "updated_at":
			// Repo thật đặt updated_at = now() bên trong chính nó; domain.Trade
			// không mang trường này nên ở đây không có gì để ghi.
		default:
			panic("memTradeStore.UpdateFields: cột lạ " + col +
				" — thêm cột vào patchToFields thì phải thêm cả ở đây")
		}
	}
	m.rows[id] = t
	return nil
}

// SoftDelete đánh dấu đã xoá. Xoá lần hai trả ErrNotFound thay vì lặng lẽ
// báo thành công — cùng ngữ nghĩa với `deleted_at IS NULL` trong WHERE.
func (m *memTradeStore) SoftDelete(_ context.Context, id int64) error {
	m.hat.Lock()
	defer m.hat.Unlock()
	if _, ok := m.rows[id]; !ok {
		return repository.ErrNotFound
	}
	if !m.notDeleted(id) {
		return repository.ErrNotFound
	}
	m.deleted[id] = time.Now()
	return nil
}

// Restore đưa lệnh ra khỏi thùng rác. Khôi phục một lệnh CHƯA xoá trả
// ErrNotFound — im lặng chấp nhận sẽ che mất việc frontend gọi nhầm.
func (m *memTradeStore) Restore(_ context.Context, id int64) error {
	m.hat.Lock()
	defer m.hat.Unlock()
	if _, ok := m.rows[id]; !ok {
		return repository.ErrNotFound
	}
	if m.notDeleted(id) {
		return repository.ErrNotFound
	}
	delete(m.deleted, id)
	return nil
}

// Facets trả symbol và setup KHÁC NHAU của lệnh CHƯA xoá, sắp theo bảng chữ
// cái, đã loại chuỗi rỗng (một mục trống là mục người dùng không chọn được).
func (m *memTradeStore) Facets(_ context.Context, accountID int64) (symbols, setups []string, err error) {
	m.hat.Lock()
	defer m.hat.Unlock()

	symbolSet := map[string]bool{}
	setupSet := map[string]bool{}
	for id, t := range m.rows {
		if t.AccountID != accountID || !m.notDeleted(id) {
			continue
		}
		if t.Symbol != "" {
			symbolSet[t.Symbol] = true
		}
		if t.Setup != "" {
			setupSet[t.Setup] = true
		}
	}
	sortKeys := func(set map[string]bool) []string {
		out := make([]string, 0, len(set))
		for v := range set {
			out = append(out, v)
		}
		sort.Strings(out)
		return out
	}
	return sortKeys(symbolSet), sortKeys(setupSet), nil
}

// memAccountStore giữ account trong RAM.
type memAccountStore struct {
	hat    sync.Mutex
	rows   map[int64]domain.Account
	nextID int64
}

func newMemAccountStore() *memAccountStore {
	return &memAccountStore{rows: map[int64]domain.Account{}, nextID: 1}
}

func (m *memAccountStore) ListByUser(_ context.Context, userID int64) ([]domain.Account, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	var out []domain.Account
	for _, a := range m.rows {
		if a.UserID == userID {
			out = append(out, a)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// Create cưỡng chế UNIQUE (user_id, code) của migration 0001. Thiếu nhánh này
// thì service không bao giờ trả 409 trong test, và một hồi quy ở đó sẽ lọt.
func (m *memAccountStore) Create(_ context.Context, a domain.Account) (domain.Account, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	for _, ok := range m.rows {
		if ok.UserID == a.UserID && ok.Code == a.Code {
			return domain.Account{}, repository.ErrDuplicate
		}
	}
	a.ID = m.nextID
	m.nextID++
	m.rows[a.ID] = a
	return a, nil
}

func (m *memAccountStore) ByID(_ context.Context, id int64) (domain.Account, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	a, ok := m.rows[id]
	if !ok {
		return domain.Account{}, repository.ErrNotFound
	}
	return a, nil
}

// Update ghi đè các cột sửa được. user_id và id cố ý không đổi: chuyển chủ
// sở hữu một account không phải thao tác hợp lệ.
func (m *memAccountStore) Update(_ context.Context, a domain.Account) error {
	m.hat.Lock()
	defer m.hat.Unlock()
	old, ok := m.rows[a.ID]
	if !ok {
		// Repo thật KHÔNG kiểm RowsAffected ở Update, nên sửa một account
		// không tồn tại là no-op báo thành công. Fake nghiêm hơn production
		// là sai hướng: nó làm test xanh cho một luật production không có.
		return nil
	}
	for _, khac := range m.rows {
		if khac.ID != a.ID && khac.UserID == old.UserID && khac.Code == a.Code {
			return repository.ErrDuplicate
		}
	}
	old.Code = a.Code
	old.Name = a.Name
	old.InitialBalance = a.InitialBalance
	old.RiskPerTrade = a.RiskPerTrade
	old.Currency = a.Currency
	old.Timezone = a.Timezone
	m.rows[a.ID] = old
	return nil
}

// memCashFlowStore giữ giao dịch nạp/rút trong RAM.
type memCashFlowStore struct {
	hat    sync.Mutex
	rows   map[int64]domain.CashFlow
	nextID int64
}

func newMemCashFlowStore() *memCashFlowStore {
	return &memCashFlowStore{rows: map[int64]domain.CashFlow{}, nextID: 1}
}

// ListByAccount sắp theo ngày rồi tới id — cùng thứ tự với repo thật
// (`ORDER BY date ASC, id ASC`).
func (m *memCashFlowStore) ListByAccount(_ context.Context, accountID int64) ([]domain.CashFlow, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	var out []domain.CashFlow
	for _, cf := range m.rows {
		if cf.AccountID == accountID {
			out = append(out, cf)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].Date.Equal(out[j].Date) {
			return out[i].Date.Before(out[j].Date)
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

func (m *memCashFlowStore) Create(_ context.Context, cf domain.CashFlow) (domain.CashFlow, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	cf.ID = m.nextID
	m.nextID++
	m.rows[cf.ID] = cf
	return cf, nil
}

func (m *memCashFlowStore) ByID(_ context.Context, id int64) (domain.CashFlow, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	cf, ok := m.rows[id]
	if !ok {
		return domain.CashFlow{}, repository.ErrNotFound
	}
	return cf, nil
}

// DeleteOwned xoá CỨNG, và account_id nằm ngay trong điều kiện nên không có
// khe hở giữa lúc kiểm quyền sở hữu và lúc xoá.
func (m *memCashFlowStore) DeleteOwned(_ context.Context, id, accountID int64) error {
	m.hat.Lock()
	defer m.hat.Unlock()
	cf, ok := m.rows[id]
	if !ok || cf.AccountID != accountID {
		return repository.ErrNotFound
	}
	delete(m.rows, id)
	return nil
}

// memUserStore giữ user trong RAM.
type memUserStore struct {
	hat    sync.Mutex
	rows   map[int64]repository.UserRow
	nextID int64
}

func newMemUserStore() *memUserStore {
	return &memUserStore{rows: map[int64]repository.UserRow{}, nextID: 1}
}

func (m *memUserStore) Count(_ context.Context) (int64, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	return int64(len(m.rows)), nil
}

// Create cưỡng chế UNIQUE(email): luật "chỉ user đầu tiên được đăng ký" dựa
// vào Count, còn đăng ký trùng email phải ra ErrDuplicate.
func (m *memUserStore) Create(_ context.Context, email, passwordHash string) (repository.UserRow, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	for _, u := range m.rows {
		if u.Email == email {
			return repository.UserRow{}, repository.ErrDuplicate
		}
	}
	row := repository.UserRow{
		ID:           m.nextID,
		Email:        email,
		PasswordHash: passwordHash,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	m.nextID++
	m.rows[row.ID] = row
	return row, nil
}

func (m *memUserStore) ByEmail(_ context.Context, email string) (repository.UserRow, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	for _, u := range m.rows {
		if u.Email == email {
			return u, nil
		}
	}
	return repository.UserRow{}, repository.ErrNotFound
}

func (m *memUserStore) ByID(_ context.Context, id int64) (repository.UserRow, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	u, ok := m.rows[id]
	if !ok {
		return repository.UserRow{}, repository.ErrNotFound
	}
	return u, nil
}

// memRefreshTokenStore giữ refresh token đã băm trong RAM.
type memRefreshTokenStore struct {
	hat    sync.Mutex
	rows   map[int64]repository.RefreshTokenRow
	nextID int64
}

func newMemRefreshTokenStore() *memRefreshTokenStore {
	return &memRefreshTokenStore{rows: map[int64]repository.RefreshTokenRow{}, nextID: 1}
}

func (m *memRefreshTokenStore) Create(_ context.Context, userID int64, tokenHash string, expiresAt time.Time) error {
	m.hat.Lock()
	defer m.hat.Unlock()
	row := repository.RefreshTokenRow{
		ID:        m.nextID,
		UserID:    userID,
		TokenHash: tokenHash,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}
	m.nextID++
	m.rows[row.ID] = row
	return nil
}

func (m *memRefreshTokenStore) ByHash(_ context.Context, tokenHash string) (repository.RefreshTokenRow, error) {
	m.hat.Lock()
	defer m.hat.Unlock()
	for _, r := range m.rows {
		if r.TokenHash == tokenHash {
			return r, nil
		}
	}
	return repository.RefreshTokenRow{}, repository.ErrNotFound
}

func (m *memRefreshTokenStore) Revoke(_ context.Context, id int64, at time.Time) error {
	m.hat.Lock()
	defer m.hat.Unlock()
	r, ok := m.rows[id]
	if !ok {
		return repository.ErrNotFound
	}
	// Thu hồi lần hai KHÔNG dời mốc thời gian: repo thật có
	// `WHERE id = ? AND revoked_at IS NULL`, cố ý giữ lần thu hồi ĐẦU TIÊN.
	// Mốc đó là bằng chứng token bị dùng lại; ghi đè là xoá bằng chứng.
	if r.RevokedAt != nil {
		return nil
	}
	r.RevokedAt = &at
	m.rows[id] = r
	return nil
}

func (m *memRefreshTokenStore) RevokeAllForUser(_ context.Context, userID int64, at time.Time) error {
	m.hat.Lock()
	defer m.hat.Unlock()
	for id, r := range m.rows {
		if r.UserID == userID && r.RevokedAt == nil {
			r.RevokedAt = &at
			m.rows[id] = r
		}
	}
	return nil
}
