// Package telegram gửi tin nhắn qua Telegram Bot API (sendMessage).
//
// Token bot nằm trong URL (https://api.telegram.org/bot<token>/sendMessage), và lỗi của net/http
// chép nguyên URL — nên mọi lỗi trả ra đều đã xoá URL, không bao giờ để token lọt vào log.
package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// DefaultBaseURL là gốc Bot API.
const DefaultBaseURL = "https://api.telegram.org"

// Client gửi tin tới một chat. BaseURL / HTTP rỗng thì dùng mặc định.
type Client struct {
	Token   string
	ChatID  string
	BaseURL string
	HTTP    *http.Client
}

type sendRequest struct {
	ChatID                string `json:"chat_id"`
	Text                  string `json:"text"`
	DisableWebPagePreview bool   `json:"disable_web_page_preview"`
}

type apiResponse struct {
	OK          bool   `json:"ok"`
	Description string `json:"description"`
}

// Send gửi text dạng văn bản thuần (không parse_mode, nên không phải escape ký tự nào).
func (c Client) Send(ctx context.Context, text string) error {
	if c.Token == "" || c.ChatID == "" {
		return errors.New("telegram: token or chat id is empty")
	}
	base := c.BaseURL
	if base == "" {
		base = DefaultBaseURL
	}
	hc := c.HTTP
	if hc == nil {
		hc = http.DefaultClient
	}
	body, err := json.Marshal(sendRequest{ChatID: c.ChatID, Text: text, DisableWebPagePreview: true})
	if err != nil {
		return fmt.Errorf("telegram: encode message: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/bot"+c.Token+"/sendMessage", bytes.NewReader(body))
	if err != nil {
		return errors.New("telegram: build request failed")
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := hc.Do(req)
	if err != nil {
		var ue *url.Error
		if errors.As(err, &ue) {
			ue.URL = "telegram"
		}
		return fmt.Errorf("telegram: send message: %w", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<16))
	var ar apiResponse
	_ = json.Unmarshal(raw, &ar)
	if res.StatusCode != http.StatusOK || !ar.OK {
		return fmt.Errorf("telegram: HTTP %d: %s", res.StatusCode, ar.Description)
	}
	return nil
}
