package service_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/service"
)

func TestWaitlistJoinStoresNormalizedRow(t *testing.T) {
	st := newMemWaitlistStore()
	svc := service.NewWaitlistService(st)

	err := svc.Join(newCtx(), service.WaitlistJoin{Email: " Toi@Gmail.com ", Locale: "en", Source: "FB-Group"})
	require.NoError(t, err)

	got, ok := st.get("toi@gmail.com")
	require.True(t, ok)
	require.Equal(t, "en", got.Locale)
	require.Equal(t, "fb-group", *got.Source)
}

func TestWaitlistJoinTreatsCaseAndSpacesAsSameEmail(t *testing.T) {
	st := newMemWaitlistStore()
	svc := service.NewWaitlistService(st)

	require.NoError(t, svc.Join(newCtx(), service.WaitlistJoin{Email: " Toi@Gmail.com ", Locale: "vi"}))
	require.NoError(t, svc.Join(newCtx(), service.WaitlistJoin{Email: "toi@gmail.com", Locale: "en"}))

	require.Len(t, st.rows, 1)
	got, _ := st.get("toi@gmail.com")
	require.Equal(t, "vi", got.Locale, "the first signup wins")
}

// Bot điền ô ẩn: trả thành công như thường để nó không biết mình bị lọc,
// nhưng không ghi gì.
func TestWaitlistJoinHoneypotStoresNothing(t *testing.T) {
	st := newMemWaitlistStore()
	svc := service.NewWaitlistService(st)

	err := svc.Join(newCtx(), service.WaitlistJoin{Email: "bot@example.com", Honeypot: "http://spam.example"})
	require.NoError(t, err)
	require.Empty(t, st.rows)
}

// Honeypot kiểm TRƯỚC email: bot gửi email rác vẫn nhận 200, không nhận một
// 400 tiết lộ rằng có luật kiểm email.
func TestWaitlistJoinHoneypotWinsOverInvalidEmail(t *testing.T) {
	svc := service.NewWaitlistService(newMemWaitlistStore())
	require.NoError(t, svc.Join(newCtx(), service.WaitlistJoin{Email: "not-an-email", Honeypot: "x"}))
}

func TestWaitlistJoinRejectsInvalidEmail(t *testing.T) {
	svc := service.NewWaitlistService(newMemWaitlistStore())

	err := svc.Join(newCtx(), service.WaitlistJoin{Email: "toi@localhost"})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 400, e.Status)
	require.Equal(t, 1400, e.Code)
	require.Equal(t, "email không hợp lệ", e.Msg)
}

func TestWaitlistSaveAnswers(t *testing.T) {
	t.Run("saves for a known email", func(t *testing.T) {
		st := newMemWaitlistStore()
		svc := service.NewWaitlistService(st)
		require.NoError(t, svc.Join(newCtx(), service.WaitlistJoin{Email: "toi@gmail.com"}))

		err := svc.SaveAnswers(newCtx(), service.WaitlistAnswersInput{
			Email: "TOI@gmail.com",
			Answers: domain.WaitlistAnswerCodes{
				JournalTool: "spreadsheet", Markets: []string{"vn_stocks", "crypto"}, PropStatus: "never",
			},
		})
		require.NoError(t, err)

		got, _ := st.get("toi@gmail.com")
		require.Equal(t, "spreadsheet", *got.JournalTool)
		require.Equal(t, "crypto,vn_stocks", got.Markets)
		require.Equal(t, "never", *got.PropStatus)
		require.NotNil(t, got.AnsweredAt)
	})

	t.Run("unknown email is not an error", func(t *testing.T) {
		svc := service.NewWaitlistService(newMemWaitlistStore())
		require.NoError(t, svc.SaveAnswers(newCtx(), service.WaitlistAnswersInput{Email: "ghost@example.com"}))
	})

	t.Run("unknown code is a validation error", func(t *testing.T) {
		svc := service.NewWaitlistService(newMemWaitlistStore())
		err := svc.SaveAnswers(newCtx(), service.WaitlistAnswersInput{
			Email: "a@example.com", Answers: domain.WaitlistAnswerCodes{JournalTool: "excel"},
		})
		e := apperr.As(err)
		require.NotNil(t, e)
		require.Equal(t, 1400, e.Code)
	})

	t.Run("invalid email is a validation error", func(t *testing.T) {
		svc := service.NewWaitlistService(newMemWaitlistStore())
		err := svc.SaveAnswers(newCtx(), service.WaitlistAnswersInput{Email: "nope"})
		require.Equal(t, 1400, apperr.As(err).Code)
	})
}
