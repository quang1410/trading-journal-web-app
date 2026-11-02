package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

const token = "123:secret-token"

func TestSendPostsMessage(t *testing.T) {
	var gotPath string
	var got sendRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		require.NoError(t, json.NewDecoder(r.Body).Decode(&got))
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	c := Client{Token: token, ChatID: "42", BaseURL: srv.URL}
	require.NoError(t, c.Send(context.Background(), "xin chào"))
	require.Equal(t, "/bot"+token+"/sendMessage", gotPath)
	require.Equal(t, sendRequest{ChatID: "42", Text: "xin chào", DisableWebPagePreview: true}, got)
}

func TestSendReturnsTelegramDescription(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"ok":false,"description":"Bad Request: chat not found"}`))
	}))
	defer srv.Close()

	err := Client{Token: token, ChatID: "42", BaseURL: srv.URL}.Send(context.Background(), "x")
	require.ErrorContains(t, err, "chat not found")
	require.NotContains(t, err.Error(), token)
}

func TestSendNetworkErrorDoesNotLeakToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := srv.URL
	srv.Close() // kết nối sẽ bị từ chối

	err := Client{Token: token, ChatID: "42", BaseURL: url}.Send(context.Background(), "x")
	require.Error(t, err)
	require.False(t, strings.Contains(err.Error(), "secret-token"), "error leaks the token: %v", err)
}

func TestSendRequiresConfig(t *testing.T) {
	require.Error(t, Client{ChatID: "42"}.Send(context.Background(), "x"))
	require.Error(t, Client{Token: token}.Send(context.Background(), "x"))
}
