package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

// Contract test: MỘT bộ test, chạy HAI lượt — một lượt trên adapter GORM
// (Postgres thật), một lượt trên adapter in-memory.
//
// Đây là hàng rào chống thứ nguy hiểm nhất mà việc chuyển test sang in-memory
// mang lại: adapter giả dần dần "dễ tính" hơn Postgres, test vẫn xanh, và
// cái xanh đó nói dối. Hai lượt cùng một bộ khẳng định nghĩa là mọi hành vi
// mà service dựa vào đều đúng ở CẢ HAI nơi, hoặc đỏ ở một nơi.
//
// Lượt Postgres cần Docker nên nó tự skip khi chạy `make test-pure`; lượt
// in-memory luôn chạy. Nhờ vậy `go test -short` vẫn kiểm được hợp đồng.

func newCtx() context.Context { return context.Background() }

// sampleTrade dựng một lệnh tối thiểu hợp lệ cho account.
func sampleTrade(accountID int64, symbol, setup string, profit string) domain.Trade {
	return domain.Trade{
		AccountID: accountID,
		EnteredAt: time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC),
		Symbol:    symbol,
		Direction: "Long",
		Profit:    decimal.RequireFromString(profit),
		Fee:       decimal.Zero,
		Setup:     setup,
	}
}

// tradeStoreContract là bộ khẳng định dùng chung. moiStore trả một store rỗng
// kèm id của một account đã tồn tại (repo thật cần account có thật vì có khoá
// ngoại account_id).
func tradeStoreContract(t *testing.T, eachStore func(t *testing.T) (service.TradeStore, int64)) {
	t.Run("stt cấp tuần tự từ 1", func(t *testing.T) {
		st, acc := eachStore(t)
		for i, want := range []int{1, 2, 3} {
			got, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
			require.NoError(t, err)
			require.Equal(t, want, got.STT, "lệnh thứ %d", i+1)
		}
	})

	t.Run("stt do người gọi đặt bị ghi đè", func(t *testing.T) {
		st, acc := eachStore(t)
		tr := sampleTrade(acc, "XAUUSD", "A", "10")
		tr.STT = 999 // quy tắc 7: bỏ qua, không báo lỗi
		got, err := st.Create(newCtx(), tr)
		require.NoError(t, err)
		require.Equal(t, 1, got.STT)
	})

	// Bất biến I4. Đây là hành vi dễ cài sai nhất ở adapter in-memory, và cài
	// sai thì hỏng ở một chỗ cách xa nguyên nhân: khôi phục lệnh cũ đụng
	// UNIQUE (account_id, stt).
	t.Run("stt quét cả lệnh đã xoá mềm", func(t *testing.T) {
		st, acc := eachStore(t)
		a, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)
		b, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "20"))
		require.NoError(t, err)
		require.Equal(t, 2, b.STT)

		require.NoError(t, st.SoftDelete(newCtx(), b.ID))

		c, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "30"))
		require.NoError(t, err)
		require.Equal(t, 3, c.STT, "stt phải là 3, không được tái dùng stt 2 của lệnh đã xoá")

		// Khôi phục lệnh cũ không được đụng lệnh mới.
		require.NoError(t, st.Restore(newCtx(), b.ID))
		rows, err := st.ListByAccount(newCtx(), acc)
		require.NoError(t, err)
		require.Len(t, rows, 3)
		require.Equal(t, []int{1, 2, 3}, []int{rows[0].STT, rows[1].STT, rows[2].STT})
		_ = a
	})

	t.Run("ListByAccount chỉ trả lệnh chưa xoá, sắp theo stt tăng dần", func(t *testing.T) {
		st, acc := eachStore(t)
		for _, p := range []string{"10", "20", "30"} {
			_, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", p))
			require.NoError(t, err)
		}
		rows, err := st.ListByAccount(newCtx(), acc)
		require.NoError(t, err)
		require.Len(t, rows, 3)
		require.Equal(t, []int{1, 2, 3}, []int{rows[0].STT, rows[1].STT, rows[2].STT})

		require.NoError(t, st.SoftDelete(newCtx(), rows[1].ID))
		rows, err = st.ListByAccount(newCtx(), acc)
		require.NoError(t, err)
		require.Len(t, rows, 2)
		require.Equal(t, []int{1, 3}, []int{rows[0].STT, rows[1].STT})
	})

	t.Run("ListByAccount không lẫn account khác", func(t *testing.T) {
		st, acc := eachStore(t)
		_, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)
		rows, err := st.ListByAccount(newCtx(), acc+12345)
		require.NoError(t, err)
		require.Empty(t, rows)
	})

	// Bất biến I5.
	t.Run("xoá hai lần trả ErrNotFound", func(t *testing.T) {
		st, acc := eachStore(t)
		tr, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)
		require.NoError(t, st.SoftDelete(newCtx(), tr.ID))
		require.ErrorIs(t, st.SoftDelete(newCtx(), tr.ID), repository.ErrNotFound)
	})

	t.Run("khôi phục lệnh chưa xoá trả ErrNotFound", func(t *testing.T) {
		st, acc := eachStore(t)
		tr, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)
		require.ErrorIs(t, st.Restore(newCtx(), tr.ID), repository.ErrNotFound)
	})

	t.Run("ByID đọc được cả lệnh trong thùng rác", func(t *testing.T) {
		st, acc := eachStore(t)
		tr, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)
		require.NoError(t, st.SoftDelete(newCtx(), tr.ID))

		got, err := st.ByID(newCtx(), tr.ID)
		require.NoError(t, err, "Restore cần đọc được lệnh đã xoá")
		require.Equal(t, tr.ID, got.ID)
	})

	t.Run("ByID không tồn tại trả ErrNotFound", func(t *testing.T) {
		st, _ := eachStore(t)
		_, err := st.ByID(newCtx(), 987654)
		require.ErrorIs(t, err, repository.ErrNotFound)
	})

	t.Run("ListDeletedByAccount chỉ trả lệnh đã xoá", func(t *testing.T) {
		st, acc := eachStore(t)
		a, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)
		_, err = st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "20"))
		require.NoError(t, err)
		require.NoError(t, st.SoftDelete(newCtx(), a.ID))

		rows, err := st.ListDeletedByAccount(newCtx(), acc)
		require.NoError(t, err)
		require.Len(t, rows, 1)
		require.Equal(t, a.ID, rows[0].ID)
	})

	// Thứ tự thùng rác là hành vi NGƯỜI DÙNG THẤY (trang /trades/trash), và là
	// chỗ fake dễ lệch repo thật nhất: fake đóng dấu bằng time.Now() —
	// nanosecond, không bao giờ trùng — còn Postgres dùng now(), tức timestamp
	// của TRANSACTION, cắt còn microsecond. Hai lệnh xoá trong cùng một
	// transaction sẽ HOÀ ở Postgres và rơi xuống tiebreaker stt DESC, nhưng
	// không bao giờ hoà ở fake. Nên phải ghim CẢ HAI khoá sắp xếp, tách nhau.
	t.Run("ListDeletedByAccount xếp mới xoá lên trước", func(t *testing.T) {
		st, acc := eachStore(t)
		var ids []int64
		for _, sym := range []string{"AAA", "BBB", "CCC"} {
			tr, err := st.Create(newCtx(), sampleTrade(acc, sym, "A", "10"))
			require.NoError(t, err)
			ids = append(ids, tr.ID)
		}
		// Xoá theo thứ tự 0, 2, 1 — khác cả thứ tự tạo lẫn thứ tự stt, nên một
		// cài đặt trả nguyên thứ tự chèn hay quên hẳn ORDER BY đều trượt.
		for _, i := range []int{0, 2, 1} {
			require.NoError(t, st.SoftDelete(newCtx(), ids[i]))
		}

		rows, err := st.ListDeletedByAccount(newCtx(), acc)
		require.NoError(t, err)
		require.Len(t, rows, 3)
		got := []int64{rows[0].ID, rows[1].ID, rows[2].ID}
		require.Equal(t, []int64{ids[1], ids[2], ids[0]}, got,
			"thùng rác phải xếp deleted_at DESC: xoá sau lên trên")
	})

	// Tiebreaker stt DESC, tách riêng khỏi test trên.
	//
	// Ở repo thật đây là nhánh chạy THẬT mỗi khi hai lệnh bị xoá trong cùng
	// một transaction (now() bằng nhau). Ở fake nó gần như không bao giờ chạy,
	// nên ghim bằng cách gọi SoftDelete rồi so sánh tập hợp là vô nghĩa — phải
	// ép hai bản ghi có cùng dấu thời gian. Cách duy nhất làm được điều đó qua
	// interface chung là xoá rồi kiểm bất biến yếu hơn: với deleted_at bằng
	// nhau HOẶC tăng dần theo thứ tự xoá, danh sách không bao giờ được xếp
	// theo stt TĂNG dần.
	t.Run("ListDeletedByAccount không bao giờ xếp stt tăng dần", func(t *testing.T) {
		st, acc := eachStore(t)
		var ids []int64
		for _, sym := range []string{"AAA", "BBB"} {
			tr, err := st.Create(newCtx(), sampleTrade(acc, sym, "A", "10"))
			require.NoError(t, err)
			ids = append(ids, tr.ID)
		}
		// Xoá stt nhỏ TRƯỚC. Nếu deleted_at hoà (Postgres, cùng transaction)
		// thì stt DESC phải đảo lại; nếu không hoà thì deleted_at DESC cũng
		// đảo lại. Hai đường đều dẫn tới cùng một kết quả.
		require.NoError(t, st.SoftDelete(newCtx(), ids[0]))
		require.NoError(t, st.SoftDelete(newCtx(), ids[1]))

		rows, err := st.ListDeletedByAccount(newCtx(), acc)
		require.NoError(t, err)
		require.Len(t, rows, 2)
		require.Greater(t, rows[0].STT, rows[1].STT,
			"deleted_at hoà thì phải rơi xuống tiebreaker stt DESC")
	})

	t.Run("CreateBatch cấp dãy stt liên tiếp theo thứ tự slice", func(t *testing.T) {
		st, acc := eachStore(t)
		_, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)

		batch := []domain.Trade{
			sampleTrade(acc, "EURUSD", "B", "1"),
			sampleTrade(acc, "EURUSD", "B", "2"),
			sampleTrade(acc, "EURUSD", "B", "3"),
		}
		got, err := st.CreateBatch(newCtx(), acc, batch)
		require.NoError(t, err)
		require.Len(t, got, 3)
		require.Equal(t, []int{2, 3, 4}, []int{got[0].STT, got[1].STT, got[2].STT})
		// Thứ tự slice là hợp đồng: profit phải đi kèm đúng stt của nó.
		require.Equal(t, "1", got[0].Profit.String())
		require.Equal(t, "3", got[2].Profit.String())
	})

	t.Run("CreateBatch rỗng không lỗi", func(t *testing.T) {
		st, acc := eachStore(t)
		got, err := st.CreateBatch(newCtx(), acc, nil)
		require.NoError(t, err)
		require.Empty(t, got)
	})

	t.Run("CreateBatch không sửa slice của người gọi", func(t *testing.T) {
		st, acc := eachStore(t)
		batch := []domain.Trade{sampleTrade(acc, "EURUSD", "B", "1")}
		_, err := st.CreateBatch(newCtx(), acc, batch)
		require.NoError(t, err)
		require.Equal(t, 0, batch[0].STT, "slice đầu vào phải giữ nguyên")
	})

	t.Run("UpdateFields ghi đúng cột được gửi", func(t *testing.T) {
		st, acc := eachStore(t)
		tr, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)

		require.NoError(t, st.UpdateFields(newCtx(), tr.ID, map[string]any{
			"symbol": "EURUSD",
			"notes":  "đã sửa",
		}))
		got, err := st.ByID(newCtx(), tr.ID)
		require.NoError(t, err)
		require.Equal(t, "EURUSD", got.Symbol)
		require.Equal(t, "đã sửa", got.Notes)
		require.Equal(t, "10", got.Profit.String(), "cột không gửi phải giữ nguyên")
	})

	// Đây là lý do UpdateFields nhận map chứ không nhận struct: GORM bỏ qua
	// mọi zero value khi Updates bằng struct, nên đặt notes = "" sẽ lặng lẽ
	// không có tác dụng.
	t.Run("UpdateFields ghi được giá trị rỗng", func(t *testing.T) {
		st, acc := eachStore(t)
		tr, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)
		require.NoError(t, st.UpdateFields(newCtx(), tr.ID, map[string]any{"notes": ""}))

		got, err := st.ByID(newCtx(), tr.ID)
		require.NoError(t, err)
		require.Equal(t, "", got.Notes)
	})

	t.Run("UpdateFields ghi nil xuống cột NULLable", func(t *testing.T) {
		st, acc := eachStore(t)
		tr := sampleTrade(acc, "XAUUSD", "A", "10")
		entry := decimal.RequireFromString("1900")
		tr.Entry = &entry
		created, err := st.Create(newCtx(), tr)
		require.NoError(t, err)

		require.NoError(t, st.UpdateFields(newCtx(), created.ID, map[string]any{"entry": nil}))
		got, err := st.ByID(newCtx(), created.ID)
		require.NoError(t, err)
		require.Nil(t, got.Entry, "gửi null tường minh phải xoá về NULL, không phải 0")
	})

	t.Run("UpdateFields trên lệnh đã xoá trả ErrNotFound", func(t *testing.T) {
		st, acc := eachStore(t)
		tr, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)
		require.NoError(t, st.SoftDelete(newCtx(), tr.ID))

		err = st.UpdateFields(newCtx(), tr.ID, map[string]any{"symbol": "EURUSD"})
		require.ErrorIs(t, err, repository.ErrNotFound)
	})

	t.Run("UpdateFields rỗng không lỗi", func(t *testing.T) {
		st, acc := eachStore(t)
		tr, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "A", "10"))
		require.NoError(t, err)
		require.NoError(t, st.UpdateFields(newCtx(), tr.ID, map[string]any{}))
	})

	t.Run("Facets loại chuỗi rỗng và sắp theo bảng chữ cái", func(t *testing.T) {
		st, acc := eachStore(t)
		for _, cell := range []struct{ symbol, setup string }{
			{"XAUUSD", "Breakout"},
			{"EURUSD", "Pullback"},
			{"XAUUSD", ""}, // setup rỗng: không được vào dropdown
		} {
			_, err := st.Create(newCtx(), sampleTrade(acc, cell.symbol, cell.setup, "10"))
			require.NoError(t, err)
		}
		symbols, setups, err := st.Facets(newCtx(), acc)
		require.NoError(t, err)
		require.Equal(t, []string{"EURUSD", "XAUUSD"}, symbols)
		require.Equal(t, []string{"Breakout", "Pullback"}, setups)
	})

	t.Run("Facets bỏ qua lệnh đã xoá", func(t *testing.T) {
		st, acc := eachStore(t)
		tr, err := st.Create(newCtx(), sampleTrade(acc, "XAUUSD", "ChiCoOLenhNay", "10"))
		require.NoError(t, err)
		_, err = st.Create(newCtx(), sampleTrade(acc, "EURUSD", "Pullback", "10"))
		require.NoError(t, err)
		require.NoError(t, st.SoftDelete(newCtx(), tr.ID))

		symbols, setups, err := st.Facets(newCtx(), acc)
		require.NoError(t, err)
		require.Equal(t, []string{"EURUSD"}, symbols)
		require.Equal(t, []string{"Pullback"}, setups,
			"giá trị chỉ còn trong thùng rác thì lọc theo nó chắc chắn ra rỗng")
	})
}

// TestTradeStoreContract_InMemory chạy hợp đồng trên adapter in-memory.
// Không cần Docker.
func TestTradeStoreContract_InMemory(t *testing.T) {
	tradeStoreContract(t, func(t *testing.T) (service.TradeStore, int64) {
		return newMemTradeStore(), 1
	})
}

// TestTradeStoreContract_Postgres chạy CÙNG hợp đồng trên repo GORM thật.
//
// Hai lượt cùng xanh là bằng chứng adapter in-memory chưa trôi lệch. Lượt này
// cần Docker nên nó bị bỏ qua ở `make test-pure`.
func TestTradeStoreContract_Postgres(t *testing.T) {
	if testing.Short() {
		t.Skip("cần Postgres; chạy `make test` để bao gồm lượt này")
	}
	tradeStoreContract(t, func(t *testing.T) (service.TradeStore, int64) {
		db := testdb.New(t)
		users := repository.NewUserRepo(db)
		u, err := users.Create(newCtx(), "hopdong@example.com", "hash")
		require.NoError(t, err)
		acc, err := repository.NewAccountRepo(db).Create(newCtx(), domain.Account{
			UserID:         u.ID,
			Code:           "HD1",
			Name:           "Hợp đồng",
			Currency:       "USD",
			Timezone:       "Asia/Ho_Chi_Minh",
			InitialBalance: decimal.RequireFromString("10000"),
			RiskPerTrade:   decimal.RequireFromString("0.01"),
		})
		require.NoError(t, err)
		return repository.NewTradeRepo(db), acc.ID
	})
}

// ─────────────────────────────────────────────────────────────────────────
// Hợp đồng cho bốn seam còn lại.
//
// Task 1 chỉ dựng contract cho TradeStore, nên bốn adapter kia chạy test mà
// không ai đối chiếu với Postgres — đúng thứ nguy hiểm mà chính file này
// cảnh báo ở đầu. Bổ sung ở đây; mỗi bộ vẫn chạy hai lượt.
// ─────────────────────────────────────────────────────────────────────────

func accountStoreContract(t *testing.T, eachStore func(t *testing.T) (service.AccountStore, int64)) {
	sampleAccount := func(userID int64, code string) domain.Account {
		return domain.Account{
			UserID: userID, Code: code, Name: "Chính",
			Currency: "USD", Timezone: "Asia/Ho_Chi_Minh",
			InitialBalance: decimal.RequireFromString("10000"),
			RiskPerTrade:   decimal.RequireFromString("0.01"),
		}
	}

	t.Run("Create rồi ByID đọc lại được", func(t *testing.T) {
		st, uid := eachStore(t)
		a, err := st.Create(newCtx(), sampleAccount(uid, "A1"))
		require.NoError(t, err)
		require.NotZero(t, a.ID)

		got, err := st.ByID(newCtx(), a.ID)
		require.NoError(t, err)
		require.Equal(t, "A1", got.Code)
		require.Equal(t, "10000", got.InitialBalance.String())
	})

	// UNIQUE (user_id, code) của migration 0001. Service dịch ErrDuplicate
	// thành 409; adapter nuốt lỗi này là mất một mã lỗi HTTP.
	t.Run("Create trùng code của cùng user trả ErrDuplicate", func(t *testing.T) {
		st, uid := eachStore(t)
		_, err := st.Create(newCtx(), sampleAccount(uid, "A1"))
		require.NoError(t, err)
		_, err = st.Create(newCtx(), sampleAccount(uid, "A1"))
		require.ErrorIs(t, err, repository.ErrDuplicate)
	})

	t.Run("ByID không tồn tại trả ErrNotFound", func(t *testing.T) {
		st, _ := eachStore(t)
		_, err := st.ByID(newCtx(), 987654)
		require.ErrorIs(t, err, repository.ErrNotFound)
	})

	t.Run("ListByUser chỉ trả account của user đó, sắp theo id", func(t *testing.T) {
		st, uid := eachStore(t)
		for _, c := range []string{"A1", "A2"} {
			_, err := st.Create(newCtx(), sampleAccount(uid, c))
			require.NoError(t, err)
		}
		rows, err := st.ListByUser(newCtx(), uid)
		require.NoError(t, err)
		require.Len(t, rows, 2)
		require.Equal(t, "A1", rows[0].Code)
		require.Equal(t, "A2", rows[1].Code)

		empty, err := st.ListByUser(newCtx(), uid+9999)
		require.NoError(t, err)
		require.Empty(t, empty)
	})

	t.Run("Update ghi các cột sửa được", func(t *testing.T) {
		st, uid := eachStore(t)
		a, err := st.Create(newCtx(), sampleAccount(uid, "A1"))
		require.NoError(t, err)

		a.Name = "Đã đổi"
		a.Timezone = "UTC"
		require.NoError(t, st.Update(newCtx(), a))

		got, err := st.ByID(newCtx(), a.ID)
		require.NoError(t, err)
		require.Equal(t, "Đã đổi", got.Name)
		require.Equal(t, "UTC", got.Timezone)
	})

	// Repo thật KHÔNG kiểm RowsAffected ở Update. Fake nghiêm hơn production
	// là sai hướng — nó làm test xanh cho một luật production không có.
	t.Run("Update account không tồn tại là no-op báo thành công", func(t *testing.T) {
		st, uid := eachStore(t)
		a := sampleAccount(uid, "KHONGCO")
		a.ID = 987654
		require.NoError(t, st.Update(newCtx(), a))
	})
}

func cashFlowStoreContract(t *testing.T, eachStore func(t *testing.T) (service.CashFlowStore, int64)) {
	sample := func(accID int64, day string, amount, kind string) domain.CashFlow {
		d, err := time.Parse("2006-01-02", day)
		require.NoError(t, err)
		return domain.CashFlow{
			AccountID: accID, Date: d,
			Amount: decimal.RequireFromString(amount), Type: kind,
		}
	}

	t.Run("Create rồi ByID đọc lại được", func(t *testing.T) {
		st, acc := eachStore(t)
		cf, err := st.Create(newCtx(), sample(acc, "2026-06-09", "500", domain.CashFlowDeposit))
		require.NoError(t, err)
		got, err := st.ByID(newCtx(), cf.ID)
		require.NoError(t, err)
		require.Equal(t, "500", got.Amount.String())
		require.Equal(t, domain.CashFlowDeposit, got.Type)
	})

	t.Run("ListByAccount sắp theo ngày rồi tới id", func(t *testing.T) {
		st, acc := eachStore(t)
		for _, cell := range []struct{ ngay, tien string }{
			{"2026-06-11", "300"}, {"2026-06-09", "100"}, {"2026-06-10", "200"},
		} {
			_, err := st.Create(newCtx(), sample(acc, cell.ngay, cell.tien, domain.CashFlowDeposit))
			require.NoError(t, err)
		}
		rows, err := st.ListByAccount(newCtx(), acc)
		require.NoError(t, err)
		require.Len(t, rows, 3)
		require.Equal(t, "100", rows[0].Amount.String())
		require.Equal(t, "200", rows[1].Amount.String())
		require.Equal(t, "300", rows[2].Amount.String())
	})

	t.Run("ListByAccount không lẫn account khác", func(t *testing.T) {
		st, acc := eachStore(t)
		_, err := st.Create(newCtx(), sample(acc, "2026-06-09", "100", domain.CashFlowDeposit))
		require.NoError(t, err)
		rows, err := st.ListByAccount(newCtx(), acc+9999)
		require.NoError(t, err)
		require.Empty(t, rows)
	})

	// account_id nằm ngay trong điều kiện xoá: không có khe hở giữa lúc kiểm
	// quyền sở hữu và lúc xoá.
	t.Run("DeleteOwned sai account trả ErrNotFound và KHÔNG xoá", func(t *testing.T) {
		st, acc := eachStore(t)
		cf, err := st.Create(newCtx(), sample(acc, "2026-06-09", "100", domain.CashFlowDeposit))
		require.NoError(t, err)

		require.ErrorIs(t, st.DeleteOwned(newCtx(), cf.ID, acc+9999), repository.ErrNotFound)
		_, err = st.ByID(newCtx(), cf.ID)
		require.NoError(t, err, "bản ghi phải còn nguyên")

		require.NoError(t, st.DeleteOwned(newCtx(), cf.ID, acc))
		_, err = st.ByID(newCtx(), cf.ID)
		require.ErrorIs(t, err, repository.ErrNotFound, "xoá CỨNG, không phải xoá mềm")
	})

	t.Run("ByID không tồn tại trả ErrNotFound", func(t *testing.T) {
		st, _ := eachStore(t)
		_, err := st.ByID(newCtx(), 987654)
		require.ErrorIs(t, err, repository.ErrNotFound)
	})
}

func userStoreContract(t *testing.T, eachStore func(t *testing.T) service.UserStore) {
	t.Run("Count đếm đúng, Create rồi đọc lại được", func(t *testing.T) {
		st := eachStore(t)
		n, err := st.Count(newCtx())
		require.NoError(t, err)
		require.Zero(t, n, "store mới phải rỗng")

		u, err := st.Create(newCtx(), "a@example.com", "hash")
		require.NoError(t, err)
		require.NotZero(t, u.ID)

		n, err = st.Count(newCtx())
		require.NoError(t, err)
		require.EqualValues(t, 1, n)

		got, err := st.ByEmail(newCtx(), "a@example.com")
		require.NoError(t, err)
		require.Equal(t, u.ID, got.ID)
		require.Equal(t, "hash", got.PasswordHash)

		got, err = st.ByID(newCtx(), u.ID)
		require.NoError(t, err)
		require.Equal(t, "a@example.com", got.Email)
	})

	// UNIQUE(email): luật "chỉ user đầu tiên được đăng ký" dựa vào Count,
	// còn đăng ký trùng email phải ra ErrDuplicate.
	t.Run("Create trùng email trả ErrDuplicate", func(t *testing.T) {
		st := eachStore(t)
		_, err := st.Create(newCtx(), "a@example.com", "hash")
		require.NoError(t, err)
		_, err = st.Create(newCtx(), "a@example.com", "hash2")
		require.ErrorIs(t, err, repository.ErrDuplicate)
	})

	t.Run("không tìm thấy trả ErrNotFound", func(t *testing.T) {
		st := eachStore(t)
		_, err := st.ByEmail(newCtx(), "khong@example.com")
		require.ErrorIs(t, err, repository.ErrNotFound)
		_, err = st.ByID(newCtx(), 987654)
		require.ErrorIs(t, err, repository.ErrNotFound)
	})
}

func refreshTokenStoreContract(t *testing.T, eachStore func(t *testing.T) (service.RefreshTokenStore, int64)) {
	tomorrow := time.Now().Add(24 * time.Hour).UTC()

	t.Run("Create rồi ByHash đọc lại được", func(t *testing.T) {
		st, uid := eachStore(t)
		require.NoError(t, st.Create(newCtx(), uid, "hash-1", tomorrow))

		got, err := st.ByHash(newCtx(), "hash-1")
		require.NoError(t, err)
		require.Equal(t, uid, got.UserID)
		require.Nil(t, got.RevokedAt, "token mới phải còn sống")
	})

	t.Run("ByHash không tồn tại trả ErrNotFound", func(t *testing.T) {
		st, _ := eachStore(t)
		_, err := st.ByHash(newCtx(), "khong-co")
		require.ErrorIs(t, err, repository.ErrNotFound)
	})

	t.Run("Revoke đánh dấu thu hồi", func(t *testing.T) {
		st, uid := eachStore(t)
		require.NoError(t, st.Create(newCtx(), uid, "hash-1", tomorrow))
		row, err := st.ByHash(newCtx(), "hash-1")
		require.NoError(t, err)

		at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		require.NoError(t, st.Revoke(newCtx(), row.ID, at))

		got, err := st.ByHash(newCtx(), "hash-1")
		require.NoError(t, err)
		require.NotNil(t, got.RevokedAt)
	})

	// Repo thật có `WHERE revoked_at IS NULL`: thu hồi lần hai KHÔNG dời mốc.
	// Mốc đầu tiên là bằng chứng token bị dùng lại; ghi đè là xoá bằng chứng.
	t.Run("Revoke lần hai KHÔNG dời mốc thời gian", func(t *testing.T) {
		st, uid := eachStore(t)
		require.NoError(t, st.Create(newCtx(), uid, "hash-1", tomorrow))
		row, err := st.ByHash(newCtx(), "hash-1")
		require.NoError(t, err)

		first := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		after := time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC)
		require.NoError(t, st.Revoke(newCtx(), row.ID, first))
		require.NoError(t, st.Revoke(newCtx(), row.ID, after))

		got, err := st.ByHash(newCtx(), "hash-1")
		require.NoError(t, err)
		require.NotNil(t, got.RevokedAt)
		require.Equal(t, first.Unix(), got.RevokedAt.UTC().Unix(),
			"phải giữ mốc thu hồi ĐẦU TIÊN")
	})

	t.Run("RevokeAllForUser thu hồi mọi token còn sống", func(t *testing.T) {
		st, uid := eachStore(t)
		for _, h := range []string{"h1", "h2", "h3"} {
			require.NoError(t, st.Create(newCtx(), uid, h, tomorrow))
		}
		at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		require.NoError(t, st.RevokeAllForUser(newCtx(), uid, at))

		for _, h := range []string{"h1", "h2", "h3"} {
			got, err := st.ByHash(newCtx(), h)
			require.NoError(t, err)
			require.NotNil(t, got.RevokedAt, "token %q phải bị thu hồi", h)
		}
	})
}

// ── Bốn seam còn lại: mỗi bộ chạy hai lượt ──────────────────────────────

func TestAccountStoreContract_InMemory(t *testing.T) {
	accountStoreContract(t, func(t *testing.T) (service.AccountStore, int64) {
		return newMemAccountStore(), 1
	})
}

func TestAccountStoreContract_Postgres(t *testing.T) {
	if testing.Short() {
		t.Skip("cần Postgres; chạy `make test` để bao gồm lượt này")
	}
	accountStoreContract(t, func(t *testing.T) (service.AccountStore, int64) {
		db := testdb.New(t)
		u, err := repository.NewUserRepo(db).Create(newCtx(), "acc@example.com", "hash")
		require.NoError(t, err)
		return repository.NewAccountRepo(db), u.ID
	})
}

func TestCashFlowStoreContract_InMemory(t *testing.T) {
	cashFlowStoreContract(t, func(t *testing.T) (service.CashFlowStore, int64) {
		return newMemCashFlowStore(), 1
	})
}

func TestCashFlowStoreContract_Postgres(t *testing.T) {
	if testing.Short() {
		t.Skip("cần Postgres; chạy `make test` để bao gồm lượt này")
	}
	cashFlowStoreContract(t, func(t *testing.T) (service.CashFlowStore, int64) {
		db := testdb.New(t)
		u, err := repository.NewUserRepo(db).Create(newCtx(), "cf@example.com", "hash")
		require.NoError(t, err)
		acc, err := repository.NewAccountRepo(db).Create(newCtx(), domain.Account{
			UserID: u.ID, Code: "CF1", Name: "Cash", Currency: "USD",
			Timezone:       "Asia/Ho_Chi_Minh",
			InitialBalance: decimal.RequireFromString("10000"),
			RiskPerTrade:   decimal.RequireFromString("0.01"),
		})
		require.NoError(t, err)
		return repository.NewCashFlowRepo(db), acc.ID
	})
}

func TestUserStoreContract_InMemory(t *testing.T) {
	userStoreContract(t, func(t *testing.T) service.UserStore { return newMemUserStore() })
}

func TestUserStoreContract_Postgres(t *testing.T) {
	if testing.Short() {
		t.Skip("cần Postgres; chạy `make test` để bao gồm lượt này")
	}
	userStoreContract(t, func(t *testing.T) service.UserStore {
		return repository.NewUserRepo(testdb.New(t))
	})
}

func TestRefreshTokenStoreContract_InMemory(t *testing.T) {
	refreshTokenStoreContract(t, func(t *testing.T) (service.RefreshTokenStore, int64) {
		return newMemRefreshTokenStore(), 1
	})
}

func TestRefreshTokenStoreContract_Postgres(t *testing.T) {
	if testing.Short() {
		t.Skip("cần Postgres; chạy `make test` để bao gồm lượt này")
	}
	refreshTokenStoreContract(t, func(t *testing.T) (service.RefreshTokenStore, int64) {
		db := testdb.New(t)
		u, err := repository.NewUserRepo(db).Create(newCtx(), "rt@example.com", "hash")
		require.NoError(t, err)
		return repository.NewRefreshTokenRepo(db), u.ID
	})
}
