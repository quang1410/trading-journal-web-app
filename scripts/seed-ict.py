#!/usr/bin/env python3
"""Tạo dữ liệu test theo mẫu nhật ký ICT/SMC.

Nguồn là bảng Excel người dùng đang dùng, cột:
  STT · TRADING DAY · NEWS · INDICES · MODEL · SMT · SL/TP · MACRO
  · FOLLOW PLAN? · R:R · P&L · P&L % · W/L · NHẬN XÉT

Bốn cột KHÔNG có chỗ chứa riêng trong schema, và mỗi cột một lý do:

  P&L %, W/L  — trường SUY DIỄN. Quy tắc 2 của CLAUDE.md cấm lưu: P&L % tính
                được từ profit và vốn, W/L tính được từ dấu của profit. Lưu
                thêm một bản là tạo ra thứ sẽ lệch khi lệnh được sửa.
  NEWS, SMT   — schema chưa có cột. Đưa vào ghi chú để không mất dữ liệu, thay
                vì im lặng bỏ đi.

Chạy:  API=http://localhost:8000 ACCOUNT=1 python3 scripts/seed-ict.py
"""

import json
import os
import random
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

API = os.environ.get("API", "http://localhost:8000")
EMAIL = os.environ.get("EMAIL", "quachtuananh2016@gmail.com")
PASSWORD = os.environ.get("PASSWORD", "quachtuananh2016")
ACCOUNT = os.environ.get("ACCOUNT", "1")
COUNT = int(os.environ.get("COUNT", "20"))

# Giờ vào lệnh tính theo giờ NEW YORK — các khung macro dưới đây là giờ phiên
# Mỹ, không phải giờ máy đang chạy script.
TZ = ZoneInfo("America/New_York")

# 1R của tài khoản: vốn 100.000 × risk 1%. Bảng gốc dùng đúng quy ước này —
# -0,5R ứng với -500 USD và -0,50%.
ONE_R = 1000

# Mô hình vào lệnh của hệ thống ICT/SMC. Đây là ô `setup` — người dùng tự đặt
# tên, không phải enum của backend.
MODELS = ["OB+", "CISD", "FVG", "SMT + CISD", "Turtle Soup", "Silver Bullet"]

# Khung giờ macro: nửa giờ mà thanh khoản hay bị quét. Đi vào GIỜ của
# entered_at, và nhắc lại trong ghi chú vì đó là thông tin phân tích.
MACROS = [
    ("9H30-9H45", 9, 30),
    ("9H45-10H15", 9, 50),
    ("10H15-10H45", 10, 20),
    ("10H45-11H15", 10, 50),
    ("13H15-13H45", 13, 20),
]

NEWS = ["Không có", "Không có", "Không có", "CPI", "FOMC", "NFP", "PPI"]
INDICES = ["NQ", "NQ", "NQ", "ES", "YM"]
TIMEFRAMES = ["M5", "M15", "M15", "H1"]

# Link chart giả lập theo đúng dạng TradingView người dùng đang dán vào cột
# NHẬN XÉT. Chuỗi 8 ký tự cho giống mã thật.
CHART_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789"

# Câu tự giải theo lối viết trong bảng gốc: quét thanh khoản -> đổi cấu trúc
# -> vào lệnh -> mục tiêu.
LIQUIDITY = [
    "quét asian low (SSL)",
    "quét asian high (BSL)",
    "quét london low (SSL)",
    "quét equal highs (BSL)",
    "quét previous day low (SSL)",
]
TARGETS = [
    "50% fvg h1 (IRL)",
    "previous day high (ERL)",
    "equal highs còn sót (ERL)",
    "ob h4 phía trên (IRL)",
    "asian high (ERL)",
]


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def login():
    res = call("POST", "/api/auth/login", body={"email": EMAIL, "password": PASSWORD})
    return res["data"]["access_token"]


def chart_link(rng):
    return "https://www.tradingview.com/x/" + "".join(rng.choice(CHART_CHARS) for _ in range(8)) + "/"


def make_notes(rng, model, macro, news, smt, won, rr):
    """Ghi chú HTML — cột notes lưu HTML từ editor Quill.

    NEWS và SMT nằm ở đây vì schema chưa có cột cho chúng; bỏ đi thì mất luôn
    thông tin phân tích, mà đó mới là thứ người dùng đọc lại sau này.
    """
    lines = [
        f"<p>Link trade: <a href=\"{chart_link(rng)}\">chart</a></p>",
        "<p>Tự giải:</p>",
        "<ul>"
        f"<li>H1: {rng.choice(LIQUIDITY)}</li>"
        f"<li>Nến {macro[0].split('-')[0].lower()} quét ob h1, đóng trong range cây trước → crt</li>"
        f"<li>Vào lệnh theo {model} sau khi đổi cấu trúc</li>"
        f"<li>Mục tiêu {rng.choice(TARGETS)}</li>"
        "</ul>",
        f"<p>News: {news} · SMT: {'có phân kỳ' if smt else 'không'} · Macro: {macro[0]}</p>",
    ]
    if won:
        lines.append(f"<p>Bài học: giữ đúng kế hoạch, chạm chốt lời {rr}R.</p>")
    else:
        lines.append("<p>Bài học: " + rng.choice([
            "vào sớm hơn tín hiệu xác nhận, chờ nến đóng.",
            "setup đúng nhưng dừng lỗ quá sát, bị quét rồi mới chạy.",
            "không có SMT xác nhận mà vẫn vào.",
            "vào ngược khung H1, đi theo nhiễu M5.",
        ]) + "</p>")
    return "".join(lines)


def main():
    token = login()
    rng = random.Random(20260810)  # cố định để chạy lại ra cùng dữ liệu

    # Ngày giao dịch: lùi về trước, chỉ lấy thứ 2 đến thứ 6 — thị trường Mỹ
    # không mở cuối tuần, và một nhật ký có lệnh ngày chủ nhật là nhật ký sai.
    day = datetime(2026, 8, 10, tzinfo=TZ)
    days = []
    while len(days) < COUNT:
        if day.weekday() < 5:
            days.append(day)
        day += timedelta(days=1)

    # Thắng/thua định TRƯỚC rồi xáo, không rút độc lập từng lệnh.
    #
    # Rút độc lập với xác suất 45% trên 20 lệnh có sai số rất rộng — lần chạy
    # đầu ra đúng 25% thắng, và một nhật ký toàn lệnh thua thì biểu đồ equity
    # chỉ là một đường đi xuống, không test được gì. Định trước số lượng thì
    # tỉ lệ luôn đúng, phần ngẫu nhiên chỉ còn là THỨ TỰ.
    #
    # Hai lệnh đầu chép nguyên văn từ bảng gốc nên đều thua; 18 lệnh còn lại
    # lấy 9 thắng để tổng thể ra 45%.
    outcomes = [True] * 9 + [False] * 9
    rng.shuffle(outcomes)

    created = 0
    for i, d in enumerate(days):
        macro = MACROS[i % len(MACROS)] if i < 2 else rng.choice(MACROS)
        model = "OB+" if i == 0 else "CISD" if i == 1 else rng.choice(MODELS)
        news = "Không có" if i < 2 else rng.choice(NEWS)
        smt = False if i < 2 else rng.random() < 0.4
        symbol = "NQ" if i < 2 else rng.choice(INDICES)

        # Hai dòng đầu chép NGUYÊN VĂN từ bảng người dùng đưa, để đối chiếu
        # được; từ dòng thứ ba trở đi mới sinh ngẫu nhiên.
        if i == 0:
            won, rr, profit = False, -0.5, "-500"
        elif i == 1:
            won, rr, profit = False, -0.25, "-250"
        else:
            won = outcomes[i - 2]
            if won:
                rr = rng.choice([1.5, 2, 2, 2.5, 3, 4])
                profit = str(int(rr * ONE_R))
            else:
                rr = rng.choice([-0.25, -0.5, -0.5, -1])
                profit = str(int(rr * ONE_R))

        entered = d.replace(hour=macro[1], minute=macro[2], second=0, microsecond=0)

        body = {
            "entered_at": entered.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "symbol": symbol,
            "direction": "Long" if rng.random() < 0.5 else "Short",
            "timeframe": rng.choice(TIMEFRAMES),
            "setup": model,
            "entry": None,
            "exit": None,
            "volume": None,
            "profit": profit,
            # Lãi lý thuyết CHỈ cho lệnh thắng: với lệnh thua, R:R âm là số đã
            # lỗ chứ không phải "số đáng lẽ có", ghi vào là sai nghĩa của cột.
            "profit_theory": str(int(rr * ONE_R)) if won else None,
            "fee": "0",
            "entry_quality": "Đúng kế hoạch" if won or rng.random() < 0.6 else "Bốc đồng",
            "in_trade_quality": "Tuân thủ kế hoạch" if rng.random() < 0.7 else "Dời dừng lỗ ra xa",
            # Cột SL/TP của bảng: chạm dừng lỗ hay chạm chốt lời.
            "exit_quality": "Chạm Chốt lời" if won else "Chạm Dừng lỗ",
            "psychology": "Không lỗi" if won or rng.random() < 0.5 else rng.choice(
                ["SỢ BỎ LỠ (FOMO)", "GIAO DỊCH TRẢ THÙ", "THAM LAM", "SỢ HÃI"]
            ),
            "notes": make_notes(rng, model, macro, news, smt, won, abs(rr)),
        }
        call("POST", f"/api/accounts/{ACCOUNT}/trades", token, body)
        created += 1
        print(f"  {created:2d}. {d:%d/%m/%Y} {macro[0]:12s} {symbol:3s} {model:12s} "
              f"{'WIN ' if won else 'LOSS'} {profit:>6s} USD")

    print(f"\nĐã tạo {created} lệnh cho account {ACCOUNT}.")


if __name__ == "__main__":
    main()
