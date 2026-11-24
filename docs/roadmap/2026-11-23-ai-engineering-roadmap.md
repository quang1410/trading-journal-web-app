# Lộ trình AI Engineering — vừa học vừa tích hợp vào Trading Journal

Ngày: 2026-11-23 · Trạng thái: A1–A6 đã chốt ngày 23/11/2026 (§3), chờ OK để bắt đầu AI-01
Viết lại từ `wealth_labs_ai_engineering_roadmap.md` cho đúng repo này.

**Nhịp:** 16 tuần, 2–3 giờ/ngày, 6 ngày/tuần.
**Dự kiến:** bắt đầu thứ Hai 30/11/2026, kết thúc khoảng 21/03/2027. Chạy song song với
[lộ trình 3 tháng](2026-10-31-roadmap-11-2026-01-2027.md), xem cách xếp lịch ở §5.

---

## 1. Khác gì so với bản gốc

Bản gốc viết cho một stack giả định. Bảng dưới là những chỗ đã sửa cho khớp repo thật.

| Bản gốc | Repo này | Hệ quả cho plan |
|---|---|---|
| Next.js | Vite + React 19, TanStack Query, shadcn | UI AI là component React thường, chuỗi đi qua `strings.ts` (song ngữ, nội suy **một ngoặc** `{n}`) |
| Go "trên Vercel" | Go chi/GORM chạy dưới dạng **Vercel Services** (`vercel.json`: `web` + `api`) | Python có thể thành **service thứ ba** `ai` trong cùng `vercel.json`, không cần nền tảng khác (xem A4) |
| Supabase là DB | Supabase lúc chạy prod, Postgres 16 Docker khi chạy local và trong testcontainers | pgvector phải có ở **cả ba** nơi: image `pgvector/pgvector:pg16` cho local/test, bật extension trên Supabase |
| Tính `total_r` | **Chưa có trường R.** Lệnh chỉ có `profit`, `profit_theory`, `fee`. `actual_r` thuộc ICT Phase 3 | Tuần 1 tính Net P&L, win rate, profit factor. Các chỉ số theo R để sau khi ICT Phase 3 xong |
| Python tự tính metrics | Go đã có `internal/metrics`, `internal/aggregate`, `internal/scoring` (coverage ≥ 96%) | Bài tập Python là **tính lại để đối chiếu** với `/stats`, không thay thế Go |
| Feature flag chung chung | Chưa có hệ thống flag. Router đã gắn route có điều kiện (`router.go`) | Dùng env `AI_ENABLED` cộng một bảng allowlist theo user, xem T3 |
| Rate limit chung chung | Đã có `SharedRateLimit` chạy trên Postgres (`rate_limit_counters`, K-04) | Dùng lại cho route AI, thêm trần token/ngày |
| Redis, queue | Không có | Giữ nguyên: không thêm. Việc nền chạy bằng cron của Vercel (đã dùng cho replay bars) |
| OpenAI trả phí | **Ngân sách 0 đồng** (A2, A3) | Local dùng Ollama, prod dùng free tier Groq (LLM) và Cloudflare Workers AI (embedding). Quota miễn phí **dùng chung cho mọi user**, nên phải chia lượt (§2 nguyên tắc 11) |
| Một màn AI riêng | AI nằm **trong Dashboard** (A6) | Tính năng AI đầu tiên là nhận xét Dashboard, dựa trên `/stats` và `/charts` có sẵn. Không phụ thuộc ICT journal nên chạy song song được |

## 2. Nguyên tắc (bổ sung vào quy tắc CLAUDE.md, không thay thế)

1. **Go là nguồn sự thật cho mọi con số.** Số nào AI nhắc tới cũng phải có trong payload Go
   gửi sang (từ `metrics.Enrich`, `ComputeKPI`, `aggregate`). Có **validator tất định** chặn
   output chứa số không có trong input (T5).
2. **Python chỉ điều phối AI**: prompt, gọi LLM, embedding, RAG, eval. Python không giữ chuỗi kết
   nối DB. Muốn dữ liệu thì đi qua tool do Go cấp (T11).
3. **Không có tool ghi.** Phiên bản đầu, agent không có bất kỳ tool nào để tạo, sửa hay xoá
   lệnh, tài khoản, ghi chú. Kiểu guardrail này chắc nhất: không có thì không gọi được.
   Thứ AI sinh ra (ví dụ bản nháp ghi chú tuần) chỉ là **gợi ý**, người dùng tự bấm chèn.
4. **Quy tắc CLAUDE.md áp dụng luôn cho Python:**
   - Tiền dùng `decimal.Decimal`, không dùng `float` (quy tắc 1). Pandas chỉ dùng để khám phá
     dữ liệu, không đưa vào đường tính tiền.
   - Giờ lưu UTC, tính theo `accounts.timezone` bằng `zoneinfo` (quy tắc 4).
   - Enum chấm điểm tiếng Việt chép nguyên văn, có contract test với `/api/meta/enums`
     (quy tắc 5).
   - Lệnh đã xoá mềm (`deleted_at`) không bao giờ vào prompt, cũng không vào index RAG
     (quy tắc 6).
   - Định danh, key JSON, tên file viết tiếng Anh. Comment viết tiếng Việt (quy tắc 9).
5. **Kết quả AI không phải "trường suy diễn"** theo nghĩa quy tắc 2, nên được lưu. Nhưng mỗi
   bản ghi phải kèm `model`, `prompt_version`, `input_hash`. Lệnh bị sửa thì so hash để biết
   bản review đã cũ.
6. **Package thuần giữ nguyên ranh giới.** Code gọi AI nằm ở package mới `internal/aiclient`
   và ở `service`/`httpapi`. Cấm import vào `scoring`, `metrics`, `aggregate`. Chỉ số mới mà
   agent cần (ví dụ phân theo phiên NY/London) thì viết thành hàm thuần trong `aggregate`,
   kèm test.
7. **Test không gọi LLM thật.** CI dùng `FakeProvider` hoặc response đã ghi sẵn. Eval chạy
   LLM thật thì chạy tay qua `make eval`, vì tốn tiền và kết quả không tất định.
8. **Tắt được trong một bước.** Đặt `AI_ENABLED=false` thì mọi route AI trả 404, mọi tính
   năng nhật ký chạy y nguyên. Có test canh điều này.
9. **Ship kèm test.** Phần Build của mỗi tuần là 1–2 việc `AI-xx` (§11). Mỗi việc làm thẳng
   theo mục Testing của CLAUDE.md: viết test fail trước, chạy test thật trước khi báo xong,
   mỗi việc một commit. Phần Learn không phải việc cần ship.
10. **Có đồng ý mới gửi dữ liệu.** AI mở cho mọi user trên prod (A1), nên dữ liệu lệnh của
    người khác sẽ đi sang nhà cung cấp bên thứ ba. Vì vậy:
    - Lần đầu dùng AI, user phải bấm đồng ý. Lưu `ai_consent_at` cho từng user. Chưa đồng ý
      thì Go không gửi gì đi.
    - Có trang quyền riêng tư ghi rõ nhà cung cấp nào nhận dữ liệu gì.
    - **Không gửi dữ liệu user tới nhà cung cấp nào dùng dữ liệu free tier để huấn luyện.**
      Theo các nguồn thứ cấp, free tier của Gemini rơi vào loại này. Đọc điều khoản của từng
      nhà cung cấp trước khi đưa vào danh sách cho phép.
    - Payload chỉ gồm những gì cần: không email, không tên tài khoản, `account_id` thay bằng
      mã tạm.
11. **Quota miễn phí là tài nguyên chung.** Một bộ đếm toàn hệ thống theo từng nhà cung cấp,
    cộng lượt theo user mỗi ngày (ví dụ 5 lượt nhận xét, 20 câu hỏi). Hết lượt thì UI báo
    "Hết lượt AI hôm nay, quay lại sau 07:00", không lỗi đỏ. Dashboard vẫn chạy y nguyên.
12. **Free tier có thể đổi hoặc biến mất bất cứ lúc nào.** Adapter có chuỗi dự phòng giữa các
    nhà cung cấp, cấu hình bằng env, và có nhãn "AI tạm thời không khả dụng" khi tất cả đều hỏng.

## 3. Quyết định đã chốt (23/11/2026)

| # | Câu hỏi | Chốt | Hệ quả trong plan |
|---|---|---|---|
| **A1** | AI cho ai | **Mọi user trên production** | Bắt buộc màn đồng ý, trang quyền riêng tư, lượt theo user (§2 nguyên tắc 10–11). Allowlist `ai_access` chỉ dùng trong giai đoạn thử, tới Checkpoint 2 thì thay bằng cờ bật cho tất cả. Đăng ký hiện đang đóng, nên "mọi user" là những user đang có |
| **A2** | Nhà cung cấp | **Miễn phí** | Xem bảng chọn nhà cung cấp ngay dưới đây |
| **A3** | Ngân sách | **0 đồng** | Không có trần $; thay bằng quota miễn phí, lượt theo user, chuỗi dự phòng |
| **A4** | Python chạy ở đâu | **Vercel**, service `ai` thứ ba trong `vercel.json`, không có rewrite công khai | Xác minh ở T3: cách Go gọi service nội bộ, thời gian chạy, cold start |
| **A5** | Ngôn ngữ đầu ra | **Theo ngôn ngữ giao diện** của từng user | System prompt viết tiếng Anh (là code), output vi/en (là text UI) |
| **A6** | Đặt AI ở đâu | **Trong Dashboard** của user | Tính năng LLM đầu tiên là nhận xét Dashboard (T5–T6), không chờ ICT. Trade Review mở từ Dashboard (hộp lệnh theo ngày của lịch). Weekly Review là một thẻ trên Dashboard. Trợ lý hỏi đáp là ngăn kéo mở từ Dashboard |

### Chọn nhà cung cấp miễn phí

Đã tra cứu ngày 23/11/2026. Hầu hết là blog bên thứ ba, nên **phải kiểm lại trang chính thức
khi làm T4**. Free tier thay đổi thường xuyên.

| Việc | Môi trường | Nhà cung cấp | Vì sao | Giới hạn (theo nguồn thứ cấp) |
|---|---|---|---|---|
| Học, dev, test thủ công | Local | **Ollama**, model nhỏ chạy trên máy (ví dụ `qwen` hoặc `llama` 7–8B) | Miễn phí, chạy offline, dữ liệu không rời máy. Hợp để học prompt mà không lo hết quota | Phụ thuộc máy. **Không chạy được trên Vercel** |
| LLM trên prod | Vercel | **Groq** (ví dụ `openai/gpt-oss-120b`, có tool calling) | Không cần thẻ thanh toán, quota/ngày khá rộng | ~30 req/phút, ~1.000 req/ngày, ~200k token/ngày cho cả hệ thống |
| LLM dự phòng | Vercel | **Cloudflare Workers AI** hoặc **OpenRouter `:free`** | Dùng khi Groq hết quota hoặc lỗi | Cloudflare: 10.000 Neuron/ngày dùng chung mọi model. OpenRouter: 50 req/ngày, chỉ đủ làm dự phòng |
| Embedding | Local + prod | **`bge-m3`**: Ollama ở local, Cloudflare Workers AI (`@cf/baai/bge-m3`) trên prod | Đa ngôn ngữ, đọc tốt tiếng Việt. **Cùng một model ở cả hai nơi**, nên vector tương thích (1024 chiều) | Ăn chung pool Neuron của Cloudflare |
| Test tự động, CI | — | `FakeProvider`, `FakeEmbedder` | Tất định, không tốn quota | — |
| **Không dùng cho dữ liệu user** | — | Gemini free tier | Các nguồn cho biết dữ liệu free tier được dùng để cải thiện sản phẩm và có thể được người đọc duyệt. Chỉ dùng được cho thí nghiệm với dữ liệu giả | — |

**Hệ quả của "0 đồng + mọi user":** khoảng 1.000 request/ngày chia cho toàn bộ user. Với lượt
5 nhận xét/user/ngày thì đủ cho khoảng 150–200 user hoạt động. Khi vượt, giải pháp là thêm
nhà cung cấp miễn phí vào chuỗi dự phòng hoặc cache kết quả (§T13). Nếu sau này muốn trả phí,
chỉ cần đổi config adapter.

## 4. Kiến trúc mục tiêu

```text
Browser (Vite/React)
   │  /api/*  (cookie auth hiện có)
   ▼
Go API (Vercel service "api")
   ├─ auth, quyền sở hữu account (đã có)
   ├─ metrics.Enrich / ComputeKPI / aggregate  ← mọi con số
   ├─ internal/aiclient  ── HTTPS + secret ──►  Python FastAPI (Vercel service "ai", không public)
   │                                                ├─ prompts/ (có version)
   │                                                ├─ providers/ (Groq → Cloudflare → lỗi; Ollama local; Fake)
   │                                                ├─ rag/ (retrieve, rerank, cite)
   │                                                └─ agent/ (vòng lặp, giới hạn tool call)
   │                     ◄── tool calls (token ngắn hạn, gắn account, chỉ đọc) ──┘
   ▼
Postgres (Supabase prod / Docker local)
   ├─ bảng hiện có: trades, accounts, journal_notes, ...
   ├─ ai_runs, ai_insights, ai_feedback, users.ai_consent_at   (GĐ2)
   └─ kb_documents, kb_chunks (pgvector)              (GĐ3)
```

**Luồng một request AI:**

1. Trình duyệt gọi `POST /api/accounts/{id}/ai/...`.
2. Go kiểm tra auth, quyền sở hữu account, `AI_ENABLED`, user đã đồng ý chưa, rate limit,
   lượt AI của user và quota chung.
3. Go lấy dữ liệu, tính số bằng `metrics` và `aggregate`, rồi dựng payload tối thiểu. Ghi chú
   Quill HTML được chuyển thành text thuần.
4. Python gọi LLM và validate theo schema. Validator số liệu chạy ở bước này.
5. Go kiểm tra lại, lưu `ai_runs` và kết quả, rồi trả về cho trình duyệt.

## 5. Xếp lịch cùng lộ trình hiện tại

| Tuần | Ngày | Giai đoạn AI | Lộ trình sản phẩm cùng lúc |
|---|---|---|---|
| 0 | 23–29/11 | Tiền điều kiện (§6) | S2, gate D1/D2 30/11 |
| 1–3 | 30/11–20/12 | GĐ1 Python & nền | S3 ICT Phase 2 |
| 4–6 | 21/12–10/01 | GĐ2 LLM, nhận xét Dashboard | S4 (lễ, công suất giảm) |
| 7–10 | 11/01–07/02 | GĐ3 RAG | S5–S6, nhánh GO/NO-GO |
| 11–13 | 08/02–28/02 | GĐ4 Agent & production | Quý mới |
| 14–16 | 01/03–21/03 | GĐ5 Analytics, Weekly Review, portfolio | |

Vì AI nằm trong Dashboard và dùng `/stats`, `/charts` có sẵn (A6), không giai đoạn nào phải chờ
ICT journal. Khi ICT Phase 3 xong thì thêm grade và R vào payload, không cần làm lại.

Nếu D1 = GO thì tháng 1 nặng việc beta. Khi đó **kéo dài GĐ3 thêm 2–3 tuần**, đừng bỏ bài
tập hay bỏ test. Nếu chỉ có 1 giờ mỗi ngày thì kéo dài cả lộ trình theo đúng tỷ lệ.

## 6. Tuần 0 — Tiền điều kiện (trước khi ghi bất cứ dữ liệu AI nào lên prod)

Các mục này nằm trong lộ trình 3 tháng (S1–S2) nhưng chưa làm. Lộ trình AI kéo chúng lên trước.

- [ ] **Backup `pg_dump` + thử khôi phục.** Bắt buộc trước migration AI đầu tiên lên Supabase.
- [ ] **Theo dõi lỗi.** Cần có trước khi có lời gọi ra ngoài tới LLM.
- [ ] **CI** (route-table test, `-race`). Route AI gắn có điều kiện, nên phải có
      `chi.Walk` canh.
- [x] Chốt A1–A6.
- [ ] Python 3.12+, `uv` (hoặc venv + pip), extension Python cho VS Code; `.gitignore` có
      `.venv/` và `ai-service/.env`.
- [ ] Cài Ollama, kéo một model chat nhỏ và `bge-m3`. Tạo tài khoản Groq và Cloudflare, chưa
      cần dùng ngay.
- [ ] Đọc điều khoản dữ liệu của Groq và Cloudflare Workers AI: có dùng dữ liệu API để huấn
      luyện không, lưu bao lâu. Ghi kết quả vào `docs/ai/providers.md`. Đây là đầu vào cho
      trang quyền riêng tư (A1).

---

## 7. Lộ trình 16 tuần

Mỗi tuần có ba phần:

- **Learn:** kiến thức cần nắm.
- **Build:** việc `AI-xx` ship trong tuần, kèm test.
- **Done when:** tiêu chí nghiệm thu, đo được.

### Giai đoạn 1 — Python & nền (T1–T3)

#### Tuần 1 — Python nền tảng, qua bài "tính lại KPI của chính mình"

**Learn**

- Cú pháp, kiểu dữ liệu, function, module.
- `list`/`dict`/`set`, comprehension, exception.
- `decimal.Decimal` (vì sao không dùng float), `zoneinfo`, `csv`.
- `pytest` cơ bản, `@pytest.mark.parametrize` (bản Python của table-driven test).

**Build** (AI-01)

- Tạo `ai-service/` ở root (cạnh `backend/`, `frontend/`) với `pyproject.toml`, `app/`,
  `tests/`, `README.md`.
- Script `trade_stats.py` đọc file CSV xuất từ chính app (`GET /accounts/{id}/trades.csv`).
  Header tiếng Việt theo file Excel gốc, xem `internal/csvformat`.
- Đọc `internal/metrics` để hiểu định nghĩa thắng/thua/hoà, `net = profit − fee`, cách tính
  profit factor. Sau đó cài lại bằng Python: tổng lệnh, thắng, thua, hoà, win rate, Net P&L,
  profit factor. Xuất JSON.
- Dùng dữ liệu đã ẩn danh hoặc tài khoản demo. Không dùng CSV prod thật trong repo.

**Done when**

- **Golden test:** với cùng một file CSV, kết quả Python **bằng đúng** `/stats` của Go, so bằng
  `Decimal` chứ không so xấp xỉ. Đây là bài học "Go là nguồn sự thật": lệch thì Python sai.
- Có test cho: CSV hợp lệ, CSV rỗng, thiếu cột bắt buộc, giá trị không phải số, lệnh hoà,
  không có lệnh thắng, không có lệnh thua, lệnh có `fee` khác 0.
- Tự viết lại được script mà không cần mở bài mẫu.

#### Tuần 2 — Kiểu dữ liệu, Pydantic, Pandas

**Learn**

- Type hints, Pydantic v2 (model, validator, `model_dump_json`).
- Logging, cấu trúc project.
- Pandas `groupby` để khám phá dữ liệu.

**Build** (AI-02)

- Model `Trade` bằng Pydantic, khớp key JSON của `trade_dto.go`. Tiền là `Decimal`. Giờ là
  `datetime` có tz.
- **Contract test enum:** tập giá trị `entry_quality`, `psychology`… trong Python phải bằng
  `/api/meta/enums`. Dùng fixture JSON chụp từ API và cập nhật khi enum đổi.
- Notebook hoặc script Pandas: win rate theo `setup`, theo thứ trong tuần (theo
  `accounts.timezone`), rồi so với `/charts`. Chỉ để học và đối chiếu, không ship.

**Done when**

- Dữ liệu sai bị Pydantic từ chối với lỗi rõ ràng, có test.
- Contract test enum xanh.
- Bảng theo thứ khớp `/charts`. Nếu lệch, ghi lại nguyên nhân (thường do timezone).

#### Tuần 3 — FastAPI và nối với Go

**Learn**

- FastAPI: route, request/response model, dependency injection, OpenAPI.
- HTTP status, timeout, auth giữa các service.
- `context.WithTimeout` bên Go, `httptest.Server`.

**Build** (AI-03, AI-04)

- Python có hai endpoint. `GET /health`. `POST /v1/analyze/trades` nhận danh sách lệnh và trả
  tóm tắt tất định (chưa gọi LLM).
- Auth service-to-service: header `X-AI-Secret`, so sánh constant-time. Thiếu hoặc sai trả 401.
- Go có package `internal/aiclient`: timeout 10 s, không retry khi lỗi 4xx, lỗi mạng map sang
  `apperr` trả 503 với `msg` tiếng Việt.
- Route `POST /api/accounts/{id}/ai/analyze`, chỉ gắn khi `AI_ENABLED=true`. Thêm bảng
  `ai_access(user_id)` làm allowlist (migration `0010`).
- `docker-compose.dev.yml` thêm service `ai`. `vercel.json` thêm service `ai` **không** có
  rewrite công khai. Xác minh cách gọi nội bộ (quyết định A4).
- `Makefile` thêm `make test-ai` (pytest), và `make test` gọi luôn target này.

**Done when**

- Go test với AI giả qua `httptest`: AI chậm quá timeout thì trả 503; AI chết thì `/trades`,
  `/stats` vẫn 200.
- Route-table test: `AI_ENABLED=false` thì route AI không tồn tại; `true` thì có.
- Gọi được Go → Python ở local và trên Preview của Vercel.
- README `ai-service/` hướng dẫn chạy local.

**Checkpoint 1:** Python service chạy cạnh Go, tắt được, không ảnh hưởng nhật ký.

---

### Giai đoạn 2 — LLM Engineering (T4–T6)

#### Tuần 4 — LLM API cơ bản

**Learn**

- Token, context window, system prompt và user prompt, temperature.
- Streaming, rate limit, retry có backoff.
- Quota và rate limit của free tier. API kiểu OpenAI-compatible (Groq, Ollama, OpenRouter
  đều hỗ trợ), nên một client dùng được cho nhiều nhà cung cấp.
- Thực hành prompt trên Ollama ở local trước, không tốn quota.

**Build** (AI-05)

- `providers/` có interface `LLMProvider` với các bản cài `OllamaProvider`, `GroqProvider`,
  `CloudflareProvider`, `FakeProvider` (trả response đã ghi sẵn, dùng cho test).
- `FallbackChain`: thử lần lượt theo env `LLM_CHAIN=groq,cloudflare`. Nhà cung cấp nào trả
  429 thì bị đánh dấu "hết quota tới mốc reset". Local đặt `LLM_CHAIN=ollama`.
- Bảng `ai_runs`: `user_id`, `account_id`, `feature`, `provider`, `model`, `prompt_version`,
  `latency_ms`, `input_tokens`, `output_tokens`, `status`, `created_at`. **Không lưu raw prompt.**
- Hai bộ đếm, dùng lại mẫu upsert nguyên tử của `rate_limit_counters`:
  - Lượt theo user/ngày. Quá lượt trả 429 kèm `Retry-After` (FE đã biết xử lý từ K-04).
  - Quota chung theo nhà cung cấp/ngày. Dừng ở 90% để còn chỗ cho retry.

**Done when**

- API key chỉ có ở env của service `ai`, không có trong `frontend/`.
- Có test cho: timeout, 429 của nhà cung cấp đầu chuyển sang nhà cung cấp sau, mọi nhà cung cấp
  đều hỏng trả 503 thân thiện, input quá dài bị cắt hoặc từ chối.
- Đổi nhà cung cấp hay model chỉ cần đổi env, không sửa code nghiệp vụ.
- Cùng một prompt chạy được trên cả Ollama và Groq.

#### Tuần 5 — Structured Outputs và validator số liệu

**Learn**

- JSON Schema, structured output, tool use.
- Version cho prompt.
- Phân biệt nội dung do model sinh với dữ liệu do hệ thống tính.

**Build** (AI-06)

- Go dựng payload "nhận xét Dashboard" **theo đúng bộ lọc user đang xem**. Giữ quy tắc 8: KPI
  tính trên tập đã lọc, số dư và nạp/rút tính trên toàn bộ. Payload gồm:
  - KPI từ `ComputeKPI` cộng cỡ mẫu n.
  - Các breakdown từ `aggregate`: setup, thứ trong tuần, symbol, direction, `trade_class`,
    `psychology`.
  - Drawdown và streak hiện tại.
  - Không kèm `notes` thô. Dashboard chỉ cần số đã tính.
  - Khi ICT Phase 3 xong: expectancy theo grade.
- **Ngưỡng cỡ mẫu là luật trong code**, không giao cho prompt. Nhóm nào có n < 20 thì Go gắn cờ
  `small_sample`, và prompt bị cấm kết luận về nhóm đó.
- Schema output (key tiếng Anh, nội dung theo locale):

  ```json
  {
    "summary": "...",
    "insights": [
      {"text": "...", "kind": "strength | weakness | pattern",
       "evidence": [{"metric": "win_rate", "group": "setup=NY AM"}],
       "drilldown": {"setup": "NY AM"}}
    ],
    "actions": ["..."],
    "confidence": "limited | moderate | high"
  }
  ```

- Lưu prompt ở `ai-service/prompts/dashboard_insight/v1.md`. Đổi prompt thì tạo `v2`, không
  sửa đè.
- **Validator tất định:**
  - Mỗi `evidence` phải trỏ tới metric và nhóm có thật trong payload.
  - Mọi con số xuất hiện trong text phải có trong payload. Không có thì loại bản đó và thử
    lại tối đa một lần.
  - Insight dựa trên nhóm `small_sample` thì bị loại.
- Model miễn phí nhỏ dễ sai schema hơn model trả phí, nên validator và retry ở đây là bắt buộc,
  không phải phần thêm.

**Done when**

- Output sai schema hoặc có số "bịa" thì bị chặn, trả 502 với `msg` thân thiện. Có test dùng
  `FakeProvider` trả output độc hại.
- Mỗi kết quả truy được `provider`, `model`, `prompt_version`.
- Đổi bộ lọc thì payload đổi theo. Có test so payload với `/stats` và `/charts` cùng bộ lọc.

#### Tuần 6 — Nhận xét Dashboard v1 (có UI)

**Learn**

- UX của tác vụ chậm: loading, error, retry.
- `useMutation` của TanStack Query.
- Hiển thị streaming (tuỳ chọn).

**Build** (AI-07)

- Màn đồng ý dùng AI (một lần cho mỗi user, lưu `users.ai_consent_at`) và trang quyền riêng tư
  (nguyên tắc 10).
- Bảng `ai_insights`: `user_id`, `account_id`, `feature`, `filter_hash`, `input_hash`,
  `provider`, `model`, `prompt_version`, `output` jsonb, `created_at`.
- **Thẻ "AI nhận xét" trên `DashboardPage`.** Người dùng bấm thì mới chạy, không tự chạy khi
  mở trang, để khỏi đốt quota. Thẻ hiển thị:
  - Tóm tắt, các insight kèm bằng chứng, hành động.
  - Link drill-down sang trang Lệnh với bộ lọc tương ứng.
  - Số lượt còn lại hôm nay.
- **Cache:** cùng `filter_hash` và `input_hash` thì trả bản đã lưu, không gọi LLM. Có lệnh mới
  hoặc sửa lệnh thì hash đổi, thẻ hiện nhãn "Bản nhận xét cũ" kèm nút chạy lại.
- Chuỗi UI vào `strings.ts` (vi + en). Cảnh báo dùng `text-warn`. Dòng miễn trừ: "Không phải
  lời khuyên đầu tư".
- Focus trả về nút mở khi đóng (bài học K-50).

**Done when**

- User B gọi nhận xét cho account của user A thì bị từ chối. Có test HTTP.
- Chưa đồng ý thì không có request nào đi sang service `ai`. Có test.
- Có test FE cho loading, error, hết lượt, nhãn "cũ". Chuỗi có tham số assert kết quả đã nội suy.
- Kiểm a11y đạt: bàn phím, focus, contrast. `make e2e` có một bước nhận xét dùng AI giả.

**Checkpoint 2:** chạy trên prod với allowlist chỉ có chủ dự án trong 1 tuần để đo quota thực
tế. Sau đó bật cho mọi user (A1).

---

### Giai đoạn 3 — RAG (T7–T10)

#### Tuần 7 — Embedding và pgvector

**Learn**

- Embedding, cosine similarity.
- Index HNSW và IVFFlat, lọc theo metadata.

**Build** (AI-08)

- Đổi image Postgres local và testcontainers sang `pgvector/pgvector:pg16`. Bật extension
  `vector` trên Supabase, thử trên một project staging trước.
- Migration `kb_documents(id, user_id, kind, title, source_ref, version, deleted_at)` và
  `kb_chunks(id, document_id, user_id, ordinal, text, embedding vector(N), tsv tsvector)`.
- Embedding đi qua adapter: `bge-m3` 1024 chiều, chạy Ollama ở local và Cloudflare Workers AI
  trên prod. Có `FakeEmbedder` cho test. Ghi tên model vào mỗi chunk. Đổi model thì phải embed
  lại toàn bộ, vì vector của hai model khác nhau không so được với nhau.

**Done when**

- Lưu được vector và truy vấn được top-K.
- Có test cho: truy vấn rỗng, tài liệu chưa có embedding, chunk của user khác không bao giờ
  được trả về.
- Không đổi bảng `trades`.

#### Tuần 8 — Xử lý tài liệu và chunking

**Learn**

- Trích text từ Markdown, PDF, HTML.
- Chiến lược chunk, overlap, version của tài liệu.

**Build** (AI-09)

Kho tri thức có hai nguồn.

1. **Playbook do user upload** (Markdown/PDF/text): ICT concepts, setup NY AM, quản lý rủi ro,
   tâm lý.
   - Trần 4 MB mỗi file, khớp trần import của K-03 và giới hạn body 4,5 MB của Vercel.
   - Chỉ nhận MIME trong danh sách cho phép.
2. **Nhật ký của chính user:** `notes` của lệnh và `journal_notes` (ghi chú Ngày/Tuần/Tháng).
   - Chuyển HTML sang text trước khi chunk.
   - Sửa ghi chú thì embed lại.
   - Xoá mềm lệnh thì loại chunk khỏi kết quả tìm kiếm.

Không có queue: embed đồng bộ khi lưu nếu tài liệu nhỏ, còn lại để cron Vercel quét các tài
liệu "chưa embed".

Quota embedding là pool Neuron dùng chung của Cloudflare. Vì vậy:

- Giới hạn số tài liệu và tổng dung lượng theo user.
- Cron chỉ embed tới 70% pool mỗi ngày, phần còn lại để dành cho câu hỏi của user.

**Done when**

- Upload, cập nhật, xoá tài liệu thì chunk thay đổi tương ứng. Có test.
- Mỗi chunk mang `user_id`.

#### Tuần 9 — Pipeline RAG

**Learn**

- Top-K, ngưỡng similarity.
- Hybrid search: vector kết hợp full-text Postgres.
- Rerank, ghép context, trích dẫn nguồn, cách trả lời khi không có kết quả.

**Build** (AI-10)

- Pipeline: câu hỏi → embedding → truy vấn SQL **có `WHERE user_id = $1` cứng trong Go**,
  không để Python tự lọc → hybrid (vector + `tsvector`) → ghép context có giới hạn token → LLM
  → kiểm tra mỗi citation thuộc tập chunk đã truy xuất → trả câu trả lời kèm nguồn.
- Full-text cho tiếng Việt: Postgres không có stemmer tiếng Việt, dùng config `simple` cộng
  `unaccent`. Ghi nhận giới hạn này.
- Bộ 30 câu hỏi mẫu có đáp án là các chunk mong đợi, đo recall@5.

**Done when**

- Câu trả lời có nguồn. Không có chunk nào vượt ngưỡng thì trả lời "không tìm thấy trong tài
  liệu của bạn".
- Test cross-user: câu hỏi trúng hệ đúng nội dung tài liệu của user khác vẫn ra 0 kết quả.
- Có số recall@5 làm mốc nền.

#### Tuần 10 — Trợ lý tri thức (có UI)

**Build** (AI-11)

- Ngăn kéo "Hỏi playbook & nhật ký" mở từ Dashboard (A6): khung hỏi, câu trả lời, danh sách
  nguồn. Bấm nguồn thì mở đoạn trích, hoặc mở thẳng lệnh hay ghi chú kỳ tương ứng.
- Lịch sử hội thoại lưu theo user. Giới hạn số chunk và token cho mỗi câu hỏi.

**Done when**

- Đánh giá tay trên bộ câu hỏi mẫu, ghi kết quả vào `docs/ai/evals/`.
- Kiểm a11y đạt: bàn phím, focus, contrast. Test cross-user ở tầng HTTP.

**Checkpoint 3:** hỏi được playbook và nhật ký của chính mình, câu trả lời có nguồn.

---

### Giai đoạn 4 — Agent & Production (T11–T13)

#### Tuần 11 — Tool calling

**Learn**

- Agent khác chatbot ở đâu. Tool use, vòng lặp agent.
- Human-in-the-loop. Ngân sách tool call.

**Build** (AI-12)

Bộ tool **chỉ đọc**, map thẳng vào code đã có:

| Tool | Dựa trên |
|---|---|
| `get_account_stats(filter)` | `ComputeKPI`. Giữ quy tắc 8: số dư tính trên toàn bộ, KPI tính trên tập đã lọc |
| `get_breakdown(dimension, filter)` | `aggregate` (setup, weekday, symbol, direction, trade_class) |
| `get_session_breakdown(filter)` | **Hàm thuần mới** trong `aggregate`: phiên Á/London/NY tính từ `entered_at` theo `accounts.timezone` |
| `list_trades(filter, limit)` | `trade_filter.go`, tối đa 50 dòng, không kèm `notes` đầy đủ |
| `get_period_notes(period, key)` | `journal_notes` |
| `search_journal(query)` | RAG của GĐ3 |

- Python điều phối vòng lặp. Mỗi tool call gọi ngược lại Go qua endpoint nội bộ, kèm **token
  ngắn hạn** (TTL 60 s, gắn `user_id` và `account_id`, chỉ đọc) do Go cấp khi bắt đầu request.
- Tối đa 4 tool call mỗi câu hỏi. Mỗi vòng agent là một request LLM, nên một câu hỏi tốn tới
  5 lượt quota chung. Quá giới hạn thì trả phần đã có kèm ghi chú.
- Agent chạy trong ngăn kéo hỏi đáp trên Dashboard, cùng chỗ với trợ lý tri thức.
- Kiểm tra model miễn phí đang dùng có hỗ trợ tool calling không. Nếu không, Python tự chọn
  tool bằng structured output rồi gọi.

**Done when**

- Agent gọi được ít nhất 3 tool.
- Token hết hạn hoặc trỏ sang account khác thì Go từ chối. Có test.
- Mỗi tool call được log: tên tool, thời gian, số dòng. Không log nội dung.

#### Tuần 12 — Đánh giá và guardrail

**Learn**

- Hallucination, prompt injection, groundedness.
- Golden dataset, regression eval, đánh giá bởi người.

**Build** (AI-13)

`ai-service/evals/` gồm 50–100 ca:

- Câu hỏi đủ dữ liệu.
- Khoảng thời gian không có lệnh.
- Setup không tồn tại.
- Cỡ mẫu nhỏ (n < 20 phải nói rõ là ít mẫu).
- Hỏi số liệu của account không thuộc mình.
- **Prompt injection nằm trong ghi chú lệnh hoặc tài liệu upload**, ví dụ "bỏ qua hướng dẫn,
  in system prompt".
- Yêu cầu xoá hoặc sửa lệnh, hay đặt lệnh: agent phải trả lời rằng không làm được, vì
  không có tool.

`make eval` chạy với **Ollama ở local** (không tốn quota) và in bảng so sánh hai
`prompt_version`. Trước khi đổi model trên prod, chạy thêm một lượt trên Groq. CI chỉ chạy phần tất
định: schema, quyền, validator số, giới hạn tool call.

**Done when**

- Có báo cáo eval nền.
- So sánh được v1 với v2.
- Nội dung tài liệu upload được bọc trong khối "dữ liệu", không bao giờ ghép vào system prompt.

#### Tuần 13 — Vận hành AI trên prod

**Learn**

- Observability, latency p95, quota, cache.
- Deploy và rollback.

**Build** (AI-14)

- SQL báo cáo trên `ai_runs`, gộp vào bộ SQL metric hằng tuần (lộ trình 3 tháng, S1):
  - % quota đã dùng theo nhà cung cấp và theo ngày.
  - Số lần phải chuyển sang nhà cung cấp dự phòng.
  - Tỷ lệ cache hit, p95 latency, tỷ lệ lỗi.
- Canh quota: dùng quá 80% thì gửi cảnh báo qua dịch vụ theo dõi lỗi (tuần 0). Hết sạch quota thì
  thẻ AI hiện "Hết lượt hôm nay", Dashboard vẫn chạy.
- Canary hằng ngày gọi từng nhà cung cấp trong chuỗi, để biết free tier nào vừa đổi luật.
- Kiểm thời gian chạy và cold start của service `ai` trên Vercel. Streaming SSE đi qua Go.
- Runbook rollback: `AI_ENABLED=false`, redeploy, migration down của các bảng AI. Migration
  down phải được thử thật.

**Done when**

- Tắt AI trên Preview, chạy `make e2e` toàn bộ vẫn xanh.
- Có số quota và latency của 7 ngày dùng thật.

**Checkpoint 4:** agent phân tích dữ liệu thật qua tool có kiểm soát, đo được quota, tắt được.

---

### Giai đoạn 5 — Sản phẩm & portfolio (T14–T16)

#### Tuần 14 — AI Trade Review, mở từ Dashboard

Phần nhận xét tổng thể đã làm ở T5–T6. Tuần này đi xuống từng lệnh.

**Build** (AI-15)

- Nút "AI phân tích" trên từng lệnh trong hộp lệnh theo ngày của lịch (`DayTradesDialog`) trên
  Dashboard.
- Payload gồm:
  - Trường gốc của lệnh, `notes` chuyển sang text.
  - Trường suy diễn: `net`, `score_*`, `trade_class`, `hold_seconds`.
  - Grade và checklist ICT nếu đã có.
- Output gồm quan sát kèm trường làm bằng chứng, lỗi, hành động. Dùng chung validator với T5.
- Bảng dùng chung `ai_insights` với `feature = trade_review`. Lệnh bị sửa thì hiện nhãn "cũ".
  Lệnh xoá mềm thì ẩn bản review.

**Done when**

- Test cross-user, test lệnh đã xoá mềm, test output độc hại.
- Kiểm a11y đạt: bàn phím, focus, contrast. Focus trả về nút đã mở.

#### Tuần 15 — AI Weekly Review

**Build** (AI-16)

- Thẻ "Review tuần" trên Dashboard, dựa trên `/periods` và ghi chú kỳ đã có. Nút "Gợi ý review
  tuần" cũng có trong hộp ghi chú Tuần. Mỗi tuần chỉ tạo một lần, có cache.
- AI soạn bản nháp gồm năm phần:
  1. Hiệu suất: số liệu từ Go.
  2. Setup tốt nhất và kém nhất, kèm n.
  3. Lỗi thực thi lấy từ `score_*` và ghi chú.
  4. Nhận xét.
  5. Kế hoạch tuần tới.
- Người dùng **tự chèn** bản nháp vào ghi chú, AI không tự ghi.
- Bảng `ai_feedback` cho nút hữu ích / không hữu ích trên từng insight.
- Tạo lại được cho một tuần bất kỳ. Tuần không có lệnh thì nói rõ, không bịa.

#### Tuần 16 — Hoàn thiện portfolio

- E2E đầy đủ: lệnh → review → hỏi playbook → agent.
- Kiểm thử phân quyền toàn bộ route AI.
- Tài liệu `docs/ai/`: kiến trúc, bảo mật, eval, quota, các trade-off.
- README cập nhật. Video demo dùng tài khoản demo, không dùng dữ liệu thật.

**Checkpoint 5:** đủ để demo và giải thích được mọi quyết định kỹ thuật khi đi phỏng vấn.

---

## 8. Lịch học hằng ngày (2,5 giờ)

| Hoạt động | Thời lượng |
|---|---|
| Học kiến thức mới (docs chính thức) | 45 phút |
| Bài thực hành nhỏ, không đụng repo | 45 phút |
| Làm việc `AI-xx` của tuần (TDD) | 45 phút |
| Ghi `docs/ai/learning-log.md`: hôm nay hiểu gì, chỗ nào còn mơ hồ | 15 phút |

| Ngày | Việc |
|---|---|
| Thứ 2–3 | Phần Learn của tuần, bài tập rời |
| Thứ 4–5 | Code việc `AI-xx` (TDD) |
| Thứ 6 | Tự review diff so với `main` (skill `code-review`), sửa finding |
| Thứ 7 | Chạy test đầy đủ, commit, cập nhật scorecard và learning log |
| Chủ nhật | Nghỉ |

## 9. Tài liệu học

| Chủ đề | Nguồn |
|---|---|
| Python | https://docs.python.org/3/tutorial/ |
| `decimal`, `zoneinfo` | https://docs.python.org/3/library/decimal.html · https://docs.python.org/3/library/zoneinfo.html |
| pytest | https://docs.pytest.org/ |
| Pydantic | https://docs.pydantic.dev/latest/ |
| FastAPI | https://fastapi.tiangolo.com/tutorial/ |
| Pandas | https://pandas.pydata.org/docs/ |
| Ollama (local, API tương thích OpenAI) | https://ollama.com · https://github.com/ollama/ollama/blob/main/docs/api.md |
| Groq (free tier, rate limit, tool use) | https://console.groq.com/docs |
| Cloudflare Workers AI (LLM, `bge-m3`, giá Neuron) | https://developers.cloudflare.com/workers-ai/ |
| OpenRouter (model `:free`) | https://openrouter.ai/docs |
| pgvector | https://github.com/pgvector/pgvector |
| Postgres full-text | https://www.postgresql.org/docs/16/textsearch.html |
| Supabase | https://supabase.com/docs |
| Vercel Services, Python runtime | https://vercel.com/docs |

API của các nhà cung cấp thay đổi thường xuyên. Đọc docs bản hiện hành trước khi làm mỗi việc.

## 10. Scorecard

Chỉ đánh dấu khi **tự làm và giải thích được**, không phải khi đã xem xong bài.

**Python**

- [ ] Script độc lập dùng `Decimal` và `zoneinfo`
- [ ] Golden test khớp `/stats`
- [ ] FastAPI có auth giữa các service
- [ ] pytest có parametrize

**LLM**

- [ ] Adapter provider, chuỗi dự phòng, Fake provider
- [ ] Structured output, validator số
- [ ] Version cho prompt
- [ ] Lượt theo user, quota chung, cache

**RAG**

- [ ] pgvector trên cả local, test và Supabase
- [ ] Pipeline chunk và embed
- [ ] Hybrid search
- [ ] Citation được kiểm tra
- [ ] Đo recall@5

**Agent**

- [ ] Tool chỉ đọc, token ngắn hạn
- [ ] Giới hạn số tool call
- [ ] Eval 50+ ca
- [ ] Test prompt injection

**Vận hành**

- [ ] Kill switch có test
- [ ] Đo quota và p95
- [ ] Rollback đã thử thật
- [ ] Cách ly dữ liệu giữa các user
- [ ] Màn đồng ý và trang quyền riêng tư

**Sản phẩm (đều nằm trong Dashboard)**

- [ ] Nhận xét Dashboard
- [ ] Trợ lý tri thức
- [ ] Agent
- [ ] Trade Review
- [ ] Weekly Review

## 11. Danh sách việc theo tuần

Mỗi việc một commit, message tiếng Việt theo kiểu các commit cũ. Cột "Sau" là việc phải xong trước.

| ID | Việc | Tuần | Cỡ | Sau |
|---|---|---|---|---|
| AI-01 | `ai-service/` + tính lại KPI từ CSV, golden test khớp `/stats` | T1 | M | — |
| AI-02 | Model Pydantic + contract test enum `/meta/enums` | T2 | S | AI-01 |
| AI-03 | FastAPI `/health`, `/v1/analyze/trades`, auth secret | T3 | S | AI-02 |
| AI-04 | Go `aiclient` + route có cờ + `ai_access` + compose/vercel service `ai` | T3 | M | AI-03, backup |
| AI-05 | Adapter Ollama/Groq/Cloudflare/Fake + chuỗi dự phòng + `ai_runs` + lượt user + quota chung | T4 | M | AI-04, `docs/ai/providers.md` |
| AI-06 | Payload nhận xét Dashboard theo bộ lọc + validator số + cờ `small_sample` + prompt v1 | T5 | M | AI-05 |
| AI-07 | Thẻ "AI nhận xét" trên Dashboard + cache + màn đồng ý + trang quyền riêng tư | T6 | L | AI-06 |
| AI-08 | pgvector + bảng kb + `bge-m3` | T7 | M | AI-07 |
| AI-09 | Ingest playbook + nhật ký | T8 | L | AI-08 |
| AI-10 | Pipeline RAG + bộ 30 câu + recall@5 | T9 | M | AI-09 |
| AI-11 | Ngăn kéo trợ lý tri thức trên Dashboard | T10 | M | AI-10 |
| AI-12 | Tool chỉ đọc + phân theo phiên trong `aggregate` + token ngắn hạn | T11 | L | AI-10 |
| AI-13 | Bộ eval + `make eval` | T12 | M | AI-12 |
| AI-14 | Báo cáo quota/latency, cảnh báo 80%, canary nhà cung cấp, runbook rollback | T13 | M | AI-13, theo dõi lỗi |
| AI-15 | Trade Review mở từ hộp lệnh theo ngày trên Dashboard | T14 | M | AI-14 |
| AI-16 | Thẻ Weekly Review trên Dashboard | T15 | M | AI-15 |

## 12. Rủi ro

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| AI lấn át ICT journal, giống Replay từng lấn át | Cao | Cao | Học và làm AI theo khung giờ riêng (§8), ICT vẫn là P0 của lộ trình 3 tháng; nguyên tắc đóng băng áp dụng cả cho AI |
| AI nói ra số sai | Trung | Rất cao | Validator số tất định, mọi số lấy từ Go, test so khớp |
| Rò dữ liệu giữa các user qua RAG | Thấp | Rất cao | `WHERE user_id` cứng trong Go, test cross-user ở cả SQL và HTTP |
| Free tier bị cắt hoặc đổi luật | Cao | Trung | Chuỗi dự phòng, canary hằng ngày, đổi nhà cung cấp bằng env. Dashboard không phụ thuộc AI |
| Hết quota chung vào giờ cao điểm | Trung | Thấp | Lượt theo user, cache theo hash, chặn ở 90%, thông báo "hết lượt" thay vì lỗi |
| Model miễn phí nhỏ trả lời kém, sai schema | Cao | Trung | Validator, retry một lần, eval so sánh model trên Ollama trước khi đổi |
| Dữ liệu user bị nhà cung cấp free dùng để huấn luyện | Trung | Cao | Đọc điều khoản (tuần 0), loại nhà cung cấp có huấn luyện, màn đồng ý, payload tối thiểu |
| Python trên Vercel không hợp (timeout, cold start) | Trung | Trung | Xác minh ở T3 (A4) |
| Học theo kiểu chép code, không hiểu | Trung | Cao | Scorecard "giải thích được", learning log, tự viết lại bài T1 |

## 13. Định nghĩa thành công

Sau 16 tuần, chủ dự án:

1. Giải thích được vòng đời một request: React → Go → Python → LLM → Go → React, và vì sao
   mọi con số đi qua Go.
2. Tự viết, test và deploy được một service Python.
3. Thiết kế được structured output, validator và tool calling có giới hạn quyền.
4. Xây được RAG có cách ly dữ liệu giữa các user, đo được chất lượng truy xuất.
5. Có bộ eval để so sánh các phiên bản prompt và model.
6. Theo dõi được quota, latency, lỗi, và tắt AI trong một bước mà nhật ký không hỏng.
7. Có demo và tài liệu đủ để dùng làm portfolio.

**Nguyên tắc xuyên suốt:** học một phần, viết test trước, tích hợp một phần, ghi lại điều đã
học. Độ tin cậy và khả năng giải thích quan trọng hơn số lượng tính năng AI.
