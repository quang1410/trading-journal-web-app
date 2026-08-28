.PHONY: test test-pure lint up down logs migrate tidy test-fe e2e up-dev

# Toàn bộ test Go. Từ Phase 2a trở đi lệnh này CẦN Docker: test của
# repository/service/httpapi chạy trên Postgres thật qua testcontainers.
# Không có Docker thì dùng `make test-pure`.
test:
	cd backend && go test ./... -count=1 -timeout 300s

# Chỉ các package thuần. Phải chạy nhanh và KHÔNG cần Docker — nếu lệnh này
# bắt đầu cần Postgres thì ranh giới package đã bị phá.
# Phase 5 thêm importer/exporter: chúng chỉ nhận io.Reader/io.Writer nên vẫn
# thuộc nhóm này.
test-pure:
	cd backend && go test ./internal/scoring/... ./internal/metrics/... ./internal/aggregate/... ./internal/importer/... ./internal/exporter/... -count=1

# lint: gofmt + vet. Cố ý không thêm golangci-lint để khỏi thêm phụ thuộc
# và khỏi thêm một bước cài đặt vào CI.
lint:
	@cd backend && test -z "$$(gofmt -l .)" || (echo "gofmt còn file chưa format:"; gofmt -l .; exit 1)
	cd backend && go vet ./...

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

# Node của frontend. Ghim ở .nvmrc. Cổng chặn dưới đây KHÔNG phải hình thức:
# trên Node 16, Intl.NumberFormat.format("12345678901234567890.12") không ném
# lỗi mà lặng lẽ ép sang double rồi ăn mất bốn chữ số cuối — đúng thứ mà quy
# tắc "tiền là chuỗi" sinh ra để chặn.
NODE_MAJOR := $(shell node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)

# Toàn bộ kiểm tra frontend. Không cần Docker.
test-fe:
	@test "$(NODE_MAJOR)" -ge 20 || { \
		echo "cần Node >= 20 (xem .nvmrc), đang dùng $$(node -v 2>/dev/null || echo 'không tìm thấy node')"; \
		echo "chạy: nvm use"; exit 1; }
	cd frontend && npx tsc --noEmit && npm run test && npm run build

# E2E trên stack Docker THẬT, dưới project cách ly nên volume dev của người
# dùng không bị đụng. DB sạch mỗi lần chạy — cần thiết vì kịch bản đầu tiên
# phải là user được đăng ký đầu tiên.
e2e:
	@# Dọn trước, không chỉ dọn sau: một lần chạy bị ngắt giữa chừng để lại
	@# volume, và kịch bản đầu tiên đòi hỏi CHƯA có user nào.
	@docker compose -p jrnl-e2e down -v >/dev/null 2>&1 || true
	JWT_SECRET=$${JWT_SECRET:-$$(openssl rand -base64 48)} docker compose -p jrnl-e2e up -d --build
	@echo "chờ stack sẵn sàng..."
	@for i in $$(seq 1 60); do \
		curl -sf http://localhost:8080/api/meta/enums >/dev/null && break || sleep 2; \
	done
	cd frontend && npx playwright install --with-deps chromium
	cd frontend && E2E_BASE_URL=http://localhost:8080 npm run e2e; \
		status=$$?; cd .. ; docker compose -p jrnl-e2e down -v; exit $$status

up-dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
