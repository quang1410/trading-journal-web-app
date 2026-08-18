.PHONY: test test-pure up down logs migrate tidy

# Toàn bộ test Go. Từ Phase 2a trở đi lệnh này CẦN Docker: test của
# repository/service/httpapi chạy trên Postgres thật qua testcontainers.
# Không có Docker thì dùng `make test-pure`.
test:
	cd backend && go test ./... -count=1 -timeout 300s

# Chỉ ba package thuần. Phải chạy dưới 1 giây và KHÔNG cần Docker —
# nếu lệnh này bắt đầu cần Postgres thì ranh giới package đã bị phá.
test-pure:
	cd backend && go test ./internal/scoring/... ./internal/metrics/... ./internal/aggregate/... -count=1

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api

migrate:
	docker compose run --rm migrate

tidy:
	cd backend && go mod tidy
