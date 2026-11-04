package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"journal/internal/domain"
	"journal/internal/service"
)

type NoteTemplateHandler struct{ svc *service.NoteTemplateService }

// DTO riêng, không marshal thẳng domain.NoteTemplate: struct domain mang tag
// GORM, lôi ra API là rò rỉ tầng lưu trữ (cùng lý do Enriched/KPI có DTO
// riêng ở Phase 3a).
type noteTemplateDTO struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	BodyHTML  string    `json:"body_html"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func toNoteTemplateDTO(t domain.NoteTemplate) noteTemplateDTO {
	return noteTemplateDTO{
		ID:        t.ID,
		Name:      t.Name,
		BodyHTML:  t.BodyHTML,
		Position:  t.Position,
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
}

// make(..., 0, n) chứ không var: slice rỗng phải marshal thành [] chứ không
// phải null — null.map(...) là crash ở frontend.
func toNoteTemplateDTOs(list []domain.NoteTemplate) []noteTemplateDTO {
	out := make([]noteTemplateDTO, 0, len(list))
	for _, t := range list {
		out = append(out, toNoteTemplateDTO(t))
	}
	return out
}

type noteTemplateCreateRequest struct {
	Name     string `json:"name"`
	BodyHTML string `json:"body_html"`
}

// Tristate tự cài UnmarshalJSON nên nó decode thẳng từ body: Set bật đúng bằng
// "khoá có mặt", và null phân biệt được với vắng mặt. Service từ chối null cho
// hai cột NOT NULL này.
type noteTemplatePatchRequest struct {
	Name     service.Tristate[string] `json:"name"`
	BodyHTML service.Tristate[string] `json:"body_html"`
}

type noteTemplateOrderRequest struct {
	IDs []int64 `json:"ids"`
}

func (h *NoteTemplateHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.List(r.Context(), UserID(r.Context()))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toNoteTemplateDTOs(list))
}

func (h *NoteTemplateHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req noteTemplateCreateRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	created, err := h.svc.Create(r.Context(), UserID(r.Context()), service.NoteTemplateCreate{
		Name:     req.Name,
		BodyHTML: req.BodyHTML,
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toNoteTemplateDTO(created))
}

func (h *NoteTemplateHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		Fail(w, http.StatusBadRequest, 1400, "id mẫu ghi chú không hợp lệ")
		return
	}
	var req noteTemplatePatchRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	updated, err := h.svc.Update(r.Context(), UserID(r.Context()), id, service.NoteTemplatePatch{
		Name:     req.Name,
		BodyHTML: req.BodyHTML,
	})
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toNoteTemplateDTO(updated))
}

func (h *NoteTemplateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		Fail(w, http.StatusBadRequest, 1400, "id mẫu ghi chú không hợp lệ")
		return
	}
	if err := h.svc.Delete(r.Context(), UserID(r.Context()), id); err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, nil)
}

func (h *NoteTemplateHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	var req noteTemplateOrderRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	if err := h.svc.Reorder(r.Context(), UserID(r.Context()), req.IDs); err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, nil)
}
