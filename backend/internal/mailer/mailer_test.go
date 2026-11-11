package mailer_test

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/mailer"
)

const link = "https://app.example.com/verify-email?token=abc_DEF-123"

func TestVerifyEmailTemplateIsBilingual(t *testing.T) {
	vi := mailer.VerifyEmail("a@example.com", "vi", link)
	en := mailer.VerifyEmail("a@example.com", "en", link)

	require.Equal(t, "a@example.com", vi.To)
	require.NotEqual(t, vi.Subject, en.Subject)
	for _, m := range []mailer.Message{vi, en} {
		require.Contains(t, m.Text, link)
		require.Contains(t, m.HTML, `href="`+link+`"`)
	}
	require.Contains(t, vi.Subject, "Xác minh")
	require.Contains(t, en.Subject, "Verify")
}

// Locale lạ rơi về tiếng Việt, giống domain.NormalizeLocale.
func TestVerifyEmailUnknownLocaleFallsBackToVietnamese(t *testing.T) {
	require.Equal(t, mailer.VerifyEmail("a@x.io", "vi", link).Subject,
		mailer.VerifyEmail("a@x.io", "fr", link).Subject)
}

// Link đi vào HTML phải được escape: token là base64url nên vô hại, nhưng
// APP_URL là cấu hình, và template không được tin cấu hình.
func TestVerifyEmailEscapesLinkInHTML(t *testing.T) {
	m := mailer.VerifyEmail("a@x.io", "en", `https://x.io/?a=1&b="<x>`)
	require.NotContains(t, m.HTML, `"<x>`)
	require.True(t, strings.Contains(m.HTML, "&amp;b=") || strings.Contains(m.HTML, "&#38;b="))
}

func TestLogMailerRecordsMessages(t *testing.T) {
	var lm mailer.LogMailer
	msg := mailer.Message{To: "a@x.io", Subject: "s", Text: "t", HTML: "<p>t</p>"}
	require.NoError(t, lm.Send(context.Background(), msg))
	require.Equal(t, []mailer.Message{msg}, lm.Sent())
}
