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
# Phase 6 thêm service: nó nhận các interface Store (internal/service/store.go)
# nên test chạy trên adapter in-memory. Cờ -short bỏ qua lượt contract test
# chạy trên Postgres; `make test` vẫn chạy cả hai lượt.
test-pure:
	cd backend && go test -short ./internal/scoring/... ./internal/metrics/... ./internal/aggregate/... ./internal/importer/... ./internal/exporter/... ./internal/csvformat/... ./internal/domain/... ./internal/service/... -count=1

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
# phải là user được đăng ký đầu tiên. docker-compose.e2e.yml gỡ cổng host của
# db/api nên chạy được song song với stack dev; đổi cổng web bằng
# `make e2e E2E_WEB_PORT=58080` nếu 8080 đang bận.
E2E_WEB_PORT ?= 8080
E2E_PROJECT ?= jrnl-e2e
E2E_COMPOSE = docker compose -p $(E2E_PROJECT) -f docker-compose.yml -f docker-compose.e2e.yml

e2e:
	@# !reset / !override trong docker-compose.e2e.yml cần Compose ≥ 2.24; bản cũ
	@# hơn chỉ báo lỗi parse khó hiểu.
	@v=$$(docker compose version --short); v=$${v#v}; \
		[ "$$(printf '%s\n2.24.0\n' "$$v" | sort -V | head -1)" = "2.24.0" ] || \
		{ echo "make e2e cần Docker Compose >= 2.24 (đang có $$v)"; exit 1; }
	@# Dọn trước, không chỉ dọn sau: một lần chạy bị ngắt giữa chừng để lại
	@# volume, và kịch bản đầu tiên đòi hỏi CHƯA có user nào. JWT_SECRET giả chỉ
	@# để compose nội suy được file — thiếu nó thì `down` hỏng, mà lỗi bị nuốt.
	@JWT_SECRET=unused $(E2E_COMPOSE) down -v >/dev/null 2>&1 || true
	@# RATE_LIMIT_OFF: kịch bản đăng nhập hơn 20 lần một phút từ cùng một IP,
	@# vượt ngưỡng 10/phút của K-04. Lockout theo email vẫn bật.
	RATE_LIMIT_OFF=1 E2E_WEB_PORT=$(E2E_WEB_PORT) JWT_SECRET=$${JWT_SECRET:-$$(openssl rand -base64 48)} $(E2E_COMPOSE) up -d --build
	@echo "chờ stack sẵn sàng..."
	@for i in $$(seq 1 60); do \
		curl -sf http://localhost:$(E2E_WEB_PORT)/api/meta/enums >/dev/null && break || sleep 2; \
	done
	cd frontend && npx playwright install --with-deps chromium
	cd frontend && E2E_BASE_URL=http://localhost:$(E2E_WEB_PORT) E2E_COMPOSE_PROJECT=$(E2E_PROJECT) npm run e2e; \
		status=$$?; cd .. ; JWT_SECRET=unused $(E2E_COMPOSE) down -v; exit $$status

# --renew-anon-volumes: node_modules của web nằm trong volume ẩn danh (docker-compose.dev.yml),
# Compose giữ lại volume đó qua mỗi lần dựng lại container nên dependency mới thêm vào
# package.json không bao giờ tới được Vite. Làm mới volume để lấy node_modules của ảnh vừa build.
up-dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --renew-anon-volumes
