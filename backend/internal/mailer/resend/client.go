// Package resend gửi thư qua HTTP API của Resend (https://resend.com/docs/api-reference/emails/send-email).
package resend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"journal/internal/mailer"
)

// DefaultBaseURL là API của Resend.
const DefaultBaseURL = "https://api.resend.com"

// Client thoả mailer.Mailer.
type Client struct {
	BaseURL string // rỗng → DefaultBaseURL
	APIKey  string
	From    string // vd "Trading journal <no-reply@example.com>"; domain phải đã xác minh ở Resend
	HTTP    *http.Client
}

var _ mailer.Mailer = Client{}

type sendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Text    string   `json:"text"`
	HTML    string   `json:"html,omitempty"`
}

func (c Client) Send(ctx context.Context, m mailer.Message) error {
	payload, err := json.Marshal(sendRequest{From: c.From, To: []string{m.To}, Subject: m.Subject, Text: m.Text, HTML: m.HTML})
	if err != nil {
		return fmt.Errorf("resend: encode: %w", err)
	}
	base := c.BaseURL
	if base == "" {
		base = DefaultBaseURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/emails", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("resend: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")

	hc := c.HTTP
	if hc == nil {
		// Có trần thời gian: request đăng ký đang chờ thư này, không được treo theo Resend.
		hc = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := hc.Do(req)
	if err != nil {
		return fmt.Errorf("resend: send: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("resend: send: status %d: %s", resp.StatusCode, bytes.TrimSpace(snippet))
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	return nil
}
