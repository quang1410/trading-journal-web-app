package resend_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/mailer"
	"journal/internal/mailer/resend"
)

func TestSendPostsJSONWithBearerKey(t *testing.T) {
	var gotAuth, gotPath, gotType string
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		gotType = r.Header.Get("Content-Type")
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		_, _ = w.Write([]byte(`{"id":"mail_1"}`))
	}))
	defer srv.Close()

	c := resend.Client{BaseURL: srv.URL, APIKey: "re_test", From: "Journal <no-reply@x.io>"}
	err := c.Send(context.Background(), mailer.Message{To: "a@x.io", Subject: "S", Text: "T", HTML: "<p>T</p>"})
	require.NoError(t, err)

	require.Equal(t, "Bearer re_test", gotAuth)
	require.Equal(t, "/emails", gotPath)
	require.Equal(t, "application/json", gotType)
	require.Equal(t, "Journal <no-reply@x.io>", body["from"])
	require.Equal(t, []any{"a@x.io"}, body["to"])
	require.Equal(t, "S", body["subject"])
	require.Equal(t, "T", body["text"])
	require.Equal(t, "<p>T</p>", body["html"])
}

func TestSendReportsStatusOnFailure(t *testing.T) {
	for _, status := range []int{http.StatusUnprocessableEntity, http.StatusInternalServerError} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"message":"nope"}`))
		}))
		c := resend.Client{BaseURL: srv.URL, APIKey: "k", From: "f@x.io"}
		err := c.Send(context.Background(), mailer.Message{To: "a@x.io", Subject: "S", Text: "T"})
		srv.Close()
		require.Error(t, err)
		require.Contains(t, err.Error(), fmt.Sprintf("status %d", status))
	}
}
