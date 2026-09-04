#!/usr/bin/env bash
# Sinh dữ liệu demo qua API THẬT (không đụng thẳng vào DB).
#
# Vì sao đi qua API chứ không INSERT thẳng: stt do backend cấp (quy tắc 7) và
# lũy kế tính theo thứ tự stt (quy tắc 8). INSERT tay là tự đặt stt, tức tự
# dựng một đường equity không có thật, và bug ở tầng service sẽ không lộ ra.
#
# Chạy lại được nhiều lần: nếu user đã tồn tại thì đăng nhập tiếp, và mỗi lần
# chạy tạo một ACCOUNT MỚI (mã có hậu tố thời gian) nên không trộn số liệu.
#
#   ./scripts/seed-demo.sh
#   API=http://localhost:8000 EMAIL=... PASSWORD=... TRADES=200 ./scripts/seed-demo.sh
set -euo pipefail

API="${API:-http://localhost:8000}"
EMAIL="${EMAIL:-quachtuananh2016@gmail.com}"
PASSWORD="${PASSWORD:-quachtuananh2016}"
TRADES="${TRADES:-160}"

command -v jq >/dev/null || { echo "cần jq: brew install jq" >&2; exit 1; }
curl -sf -m 5 "$API/healthz" >/dev/null || { echo "API không phản hồi ở $API — chạy 'make up-dev' trước" >&2; exit 1; }

say() { printf '\033[36m%s\033[0m\n' "$*"; }

# ---- 1. user ---------------------------------------------------------------
body=$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')
res=$(curl -s -X POST "$API/api/auth/register" -H 'Content-Type: application/json' -d "$body")
if ! TOKEN=$(jq -er '.data.access_token' <<<"$res" 2>/dev/null); then
  # đã có user: đăng nhập
  res=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "$body")
  TOKEN=$(jq -er '.data.access_token' <<<"$res") || { echo "đăng nhập hỏng: $res" >&2; exit 1; }
  say "→ user đã có, đăng nhập lại: $EMAIL"
else
  say "→ tạo user mới: $EMAIL"
fi
AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

# ---- 2. account ------------------------------------------------------------
# API không có DELETE account, nên chạy lại mà cứ tạo mới thì sau vài lần màn
# hình chọn tài khoản đầy rác không xoá được. Dùng lại account demo nếu đã có;
# đặt CODE để ép tạo cái mới khi thật sự muốn một bộ số liệu sạch.
CODE="${CODE:-}"
if [[ -z "$CODE" ]]; then
  existing=$(curl -s "$API/api/accounts" "${AUTH[@]}" \
    | jq -r '[.data[] | select(.code | startswith("DEMO"))][0] // empty')
  if [[ -n "$existing" ]]; then
    ACC=$(jq -er '.id' <<<"$existing")
    CODE=$(jq -er '.code' <<<"$existing")
    say "→ dùng lại account demo #$ACC ($CODE) — đặt CODE=... để tạo cái mới"
  fi
fi
if [[ -z "${ACC:-}" ]]; then
  CODE="${CODE:-DEMO$(date +%H%M%S)}"
  acc=$(curl -s -X POST "$API/api/accounts" "${AUTH[@]}" -d "$(jq -nc --arg c "$CODE" '{
    code:$c, name:"Tài khoản demo", currency:"USD", timezone:"Asia/Ho_Chi_Minh",
    initial_balance:"10000", risk_per_trade:"0.01"}')")
  ACC=$(jq -er '.data.id' <<<"$acc") || { echo "tạo account hỏng: $acc" >&2; exit 1; }
fi
say "→ account #$ACC ($CODE) — vốn 10000 USD, rủi ro 1%/lệnh (1R = 100)"

# ---- 3. nạp/rút ------------------------------------------------------------
# Có cả rút để bất biến "current_balance KHÔNG chịu bộ lọc" (quy tắc 8, ngoại
# lệ a) có cái mà kiểm: đổi bộ lọc tháng thì số dư phải đứng yên.
cf() { curl -s -o /dev/null -X POST "$API/api/accounts/$ACC/cash-flows" "${AUTH[@]}" \
  -d "$(jq -nc --arg d "$1" --arg a "$2" --arg t "$3" --arg n "$4" \
       '{date:$d,amount:$a,type:$t,note:$n}')"; }
if [[ $(curl -s "$API/api/accounts/$ACC/cash-flows" "${AUTH[@]}" | jq -r '.data | length') == "0" ]]; then
cf "2026-03-02" "5000" "deposit"  "nạp thêm đợt 1"
cf "2026-05-11" "3000" "deposit"  "nạp thêm đợt 2"
cf "2026-07-20" "2000" "withdraw" "rút một phần lợi nhuận"
say "→ 3 giao dịch tiền (nạp 8000, rút 2000)"
else
say "→ đã có giao dịch tiền, bỏ qua"
fi

# ---- 4. lệnh ---------------------------------------------------------------
# Chuỗi enum lấy NGUYÊN VĂN từ domain/enums.go — đây là khoá chấm điểm (quy
# tắc 5), lệch một dấu là sai điểm.
SYMBOLS=(XAUUSD EURUSD GBPUSD BTCUSD US30 USDJPY)
SETUPS=("Breakout" "Pullback" "Reversal" "Range" "Trend continuation")
TFS=(M15 M30 H1 H4 D1)
ENTRYQ=("Đúng kế hoạch" "Quá sớm" "Quá muộn" "Bốc đồng")
INTRADEQ=("Tuân thủ kế hoạch" "Dời Chốt lời" "Dời dừng lỗ ra xa" "Muốn thoát lệnh")
EXITQ=("Chạm Chốt lời" "Chạm Dừng lỗ" "Thoát chủ động (lý do kỹ thuật)" "Thoát lệnh cảm tính, sợ hãi")
PSYCH=("Không lỗi" "SỢ BỎ LỠ (FOMO)" "SỢ HÃI" "HI VỌNG" "THAM LAM" "GIAO DỊCH TRẢ THÙ" "LUÔN MUỐN MÌNH ĐÚNG")

# Ngẫu nhiên nhưng TÁI LẬP ĐƯỢC: cùng seed cho ra cùng bộ số, nên khi một
# biểu đồ trông sai thì còn dựng lại được đúng bộ dữ liệu đó mà soi.
RANDOM=20260905
say "→ đang tạo $TRADES lệnh..."

ok=0; fail=0
for ((i = 0; i < TRADES; i++)); do
  # rải đều từ 2026-01-05 tới nay, giờ trong phiên
  day=$(( i * 240 / TRADES ))          # 0..239 ngày
  date=$(date -j -v+"${day}"d -f '%Y-%m-%d' '2026-01-05' '+%Y-%m-%d')
  hour=$(( 8 + RANDOM % 10 ))
  min=$(printf '%02d' $(( RANDOM % 60 )))
  at="${date}T$(printf '%02d' $hour):${min}:00+07:00"

  eq="${ENTRYQ[$((RANDOM % 4))]}"
  xq="${EXITQ[$((RANDOM % 4))]}"
  ps="${PSYCH[$((RANDOM % 7))]}"

  # Lãi/lỗ tương quan với chất lượng lệnh — để radar và biểu đồ theo điểm nói
  # lên điều gì đó, thay vì nhiễu trắng. Lệnh đúng kế hoạch thắng nhiều hơn.
  if [[ "$eq" == "Đúng kế hoạch" && "$xq" == "Chạm Chốt lời" ]]; then win=$(( RANDOM % 100 < 78 ))
  elif [[ "$eq" == "Bốc đồng" || "$ps" == "GIAO DỊCH TRẢ THÙ" ]];   then win=$(( RANDOM % 100 < 24 ))
  else                                                                   win=$(( RANDOM % 100 < 52 )); fi

  if (( win )); then profit="$(( 40 + RANDOM % 380 )).$(printf '%02d' $((RANDOM % 100)))"
  else               profit="-$(( 30 + RANDOM % 220 )).$(printf '%02d' $((RANDOM % 100)))"; fi
  theory="$(( 60 + RANDOM % 300 )).00"
  fee="$(( 1 + RANDOM % 7 )).$(printf '%02d' $((RANDOM % 100)))"

  sym="${SYMBOLS[$((RANDOM % 6))]}"
  entry="$(( 1500 + RANDOM % 2000 )).$(printf '%02d' $((RANDOM % 100)))"
  exitp="$(( 1500 + RANDOM % 2000 )).$(printf '%02d' $((RANDOM % 100)))"

  payload=$(jq -nc \
    --arg at "$at" --arg sym "$sym" \
    --arg dir "$( ((RANDOM % 2)) && echo Long || echo Short )" \
    --arg entry "$entry" --arg exitp "$exitp" \
    --arg vol "0.$(( 1 + RANDOM % 9 ))" \
    --arg profit "$profit" --arg theory "$theory" --arg fee "$fee" \
    --arg setup "${SETUPS[$((RANDOM % 5))]}" --arg tf "${TFS[$((RANDOM % 5))]}" \
    --arg eq "$eq" --arg iq "${INTRADEQ[$((RANDOM % 4))]}" --arg xq "$xq" --arg ps "$ps" \
    '{entered_at:$at, symbol:$sym, direction:$dir, entry:$entry, exit:$exitp,
      volume:$vol, profit:$profit, profit_theory:$theory, fee:$fee,
      setup:$setup, timeframe:$tf, entry_quality:$eq, in_trade_quality:$iq,
      exit_quality:$xq, psychology:$ps, notes:""}')

  if curl -sf -o /dev/null -X POST "$API/api/accounts/$ACC/trades" "${AUTH[@]}" -d "$payload"; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1))
    (( fail <= 3 )) && curl -s -X POST "$API/api/accounts/$ACC/trades" "${AUTH[@]}" -d "$payload" >&2
  fi
  (( i % 20 == 19 )) && printf '   %d/%d\n' "$((i + 1))" "$TRADES"
done
say "→ $ok lệnh tạo xong$( ((fail)) && echo ", $fail HỎNG" )"

# vài lệnh vào thùng rác để trang /trades/trash có cái mà xem
ids=$(curl -s "$API/api/accounts/$ACC/trades?limit=5" "${AUTH[@]}" | jq -r '.data.items[].id' | head -3)
for id in $ids; do curl -s -o /dev/null -X DELETE "$API/api/trades/$id" "${AUTH[@]}"; done
say "→ 3 lệnh đưa vào thùng rác"

# ---- 5. tóm tắt ------------------------------------------------------------
echo
curl -s "$API/api/accounts/$ACC/stats" "${AUTH[@]}" | jq -r '.data |
  "  tổng lệnh      \(.total_trades)",
  "  lãi ròng       \(.net_profit)",
  "  số dư          \(.current_balance)",
  "  win rate       \((.win_pct // 0 | tonumber * 100 * 100 | round / 100))%",
  "  profit factor  \(.profit_factor)"'
echo
say "Xong. Đăng nhập http://localhost:5173 — $EMAIL / $PASSWORD"
