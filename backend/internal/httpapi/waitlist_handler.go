package httpapi

import (
	"net/http"

	"journal/internal/domain"
	"journal/internal/service"
)

type WaitlistHandler struct{ svc *service.WaitlistService }

// website là ô honeypot của form: người thật để trống.
type waitlistJoinRequest struct {
	Email   string `json:"email"`
	Locale  string `json:"locale"`
	Source  string `json:"source"`
	Website string `json:"website"`
}

type waitlistAnswersRequest struct {
	Email       string   `json:"email"`
	JournalTool string   `json:"journal_tool"`
	Markets     []string `json:"markets"`
	PropStatus  string   `json:"prop_status"`
}

func (h *WaitlistHandler) Join(w http.ResponseWriter, r *http.Request) {
	var req waitlistJoinRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	err := h.svc.Join(r.Context(), service.WaitlistJoin{
		Email: req.Email, Locale: req.Locale, Source: req.Source, Honeypot: req.Website,
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, map[string]bool{"joined": true})
}

func (h *WaitlistHandler) SaveAnswers(w http.ResponseWriter, r *http.Request) {
	var req waitlistAnswersRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	err := h.svc.SaveAnswers(r.Context(), service.WaitlistAnswersInput{
		Email: req.Email,
		Answers: domain.WaitlistAnswerCodes{
			JournalTool: req.JournalTool, Markets: req.Markets, PropStatus: req.PropStatus,
		},
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, map[string]bool{"saved": true})
}
