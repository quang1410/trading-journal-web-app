package httpapi

import "journal/internal/service"

// DTO là hợp đồng với frontend. Struct của domain và của repository KHÔNG
// được marshal thẳng: chúng đổi hình dạng vì lý do nội bộ, hợp đồng API thì không.

type credentialsRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type userDTO struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
}

type sessionDTO struct {
	AccessToken string  `json:"access_token"`
	User        userDTO `json:"user"`
}

func toSessionDTO(s service.Session) sessionDTO {
	return sessionDTO{
		AccessToken: s.AccessToken,
		User:        userDTO{ID: s.User.ID, Email: s.User.Email},
	}
}
