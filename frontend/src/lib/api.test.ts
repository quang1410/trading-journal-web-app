import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { api, ApiError, __resetApiForTest } from "./api";
import { clearSession, getAccessToken, setOnSessionDead, setSession } from "./session";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const errorMsg = (code: number, msg: string, status: number) =>
  HttpResponse.json({ code, msg, data: null }, { status });

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setOnSessionDead(null);
});

test("bóc envelope và trả về data", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([{ id: 1 }])));
  await expect(api.get("/accounts")).resolves.toEqual([{ id: 1 }]);
});

test("code khác 0 thành ApiError mang cả code lẫn msg của backend", async () => {
  server.use(http.post(`${BASE}/auth/register`, () => errorMsg(1403, "đã có tài khoản, đăng ký đã đóng", 403)));
  const err = (await api.post("/auth/register", {}).catch((e) => e)) as ApiError;
  expect(err).toBeInstanceOf(ApiError);
  expect(err.code).toBe(1403);
  expect(err.msg).toBe("đã có tài khoản, đăng ký đã đóng");
  expect(err.status).toBe(403);
});

// nginx trả 502 với body HTML là chuyện có thật. JSON.parse sẽ ném
// SyntaxError, mà mọi chỗ bắt lỗi ở FE lại đang trông chờ ApiError.
test("body không phải JSON vẫn thành ApiError chứ không phải SyntaxError", async () => {
  server.use(http.get(`${BASE}/accounts`, () => new HttpResponse("<html>502</html>", { status: 502 })));
  const err = (await api.get("/accounts").catch((e) => e)) as ApiError;
  expect(err).toBeInstanceOf(ApiError);
  expect(err.code).toBe(1500);
});

test("JSON hợp lệ nhưng không phải envelope cũng thành ApiError", async () => {
  server.use(http.get(`${BASE}/accounts`, () => HttpResponse.json({ chao: "ban" })));
  await expect(api.get("/accounts")).rejects.toBeInstanceOf(ApiError);
});

test("gắn Authorization khi đã có token", async () => {
  let header: string | null = null;
  server.use(
    http.get(`${BASE}/accounts`, ({ request }) => {
      header = request.headers.get("Authorization");
      return envelope([]);
    }),
  );
  setSession("abc", { id: 1, email: "a@b.c" });
  await api.get("/accounts");
  expect(header).toBe("Bearer abc");
});

test("401 thì refresh rồi thử lại đúng một lần", async () => {
  let accountsCallCount = 0;
  let stillValid = false;
  server.use(
    http.post(`${BASE}/auth/refresh`, () => {
      stillValid = true;
      return envelope({ access_token: "moi", user: { id: 1, email: "a@b.c" } });
    }),
    http.get(`${BASE}/accounts`, () => {
      accountsCallCount++;
      return stillValid ? envelope([{ id: 7 }]) : errorMsg(1401, "hết hạn", 401);
    }),
  );
  setSession("cu", { id: 1, email: "a@b.c" });

  await expect(api.get("/accounts")).resolves.toEqual([{ id: 7 }]);
  expect(accountsCallCount).toBe(2);
  expect(getAccessToken()).toBe("moi");
});

// BÀI TEST ĐẮT NHẤT CỦA PLAN.
// Backend xoay vòng refresh token và phát hiện tái sử dụng: hai refresh song
// song mang CÙNG một cookie thì cái thứ hai bị đọc là replay và backend thu
// hồi MỌI phiên của user. Không có khoá single-flight thì app tự sát ngay lần
// đầu có nhiều query cùng hết hạn.
test("năm request song song cùng ăn 401 chỉ gây ĐÚNG MỘT lần refresh", async () => {
  let refreshCount = 0;
  let stillValid = false;
  server.use(
    http.post(`${BASE}/auth/refresh`, async () => {
      refreshCount++;
      // Giữ cửa sổ song song mở, đúng như mạng thật.
      await new Promise((r) => setTimeout(r, 20));
      stillValid = true;
      return envelope({ access_token: "moi", user: { id: 1, email: "a@b.c" } });
    }),
    http.get(`${BASE}/accounts`, () => (stillValid ? envelope([]) : errorMsg(1401, "hết hạn", 401))),
  );
  setSession("cu", { id: 1, email: "a@b.c" });

  await Promise.all(Array.from({ length: 5 }, () => api.get("/accounts")));

  expect(refreshCount).toBe(1);
});

test("refresh thất bại thì báo phiên chết và ném lại đúng lỗi gốc", async () => {
  let daBaoChet = false;
  server.use(
    http.post(`${BASE}/auth/refresh`, () => errorMsg(1401, "phiên đăng nhập không hợp lệ, đăng nhập lại", 401)),
    http.get(`${BASE}/accounts`, () => errorMsg(1401, "hết hạn", 401)),
  );
  setOnSessionDead(() => { daBaoChet = true; });
  setSession("cu", { id: 1, email: "a@b.c" });

  const err = (await api.get("/accounts").catch((e) => e)) as ApiError;
  expect(err).toBeInstanceOf(ApiError);
  expect(err.code).toBe(1401);
  expect(daBaoChet).toBe(true);
  expect(getAccessToken()).toBeNull();
});

// Sai mật khẩu trả 401. Nếu đường /auth/* cũng được tự refresh thì mỗi lần gõ
// sai mật khẩu sẽ bắn thêm một refresh vô nghĩa, và với backend có phát hiện
// tái sử dụng thì đó là rủi ro thật chứ không chỉ là lãng phí.
test("401 trên đường /auth/* KHÔNG kích refresh", async () => {
  let refreshCount = 0;
  server.use(
    http.post(`${BASE}/auth/refresh`, () => { refreshCount++; return envelope(null); }),
    http.post(`${BASE}/auth/login`, () => errorMsg(1401, "email hoặc mật khẩu không đúng", 401)),
  );

  await expect(api.post("/auth/login", { email: "a@b.c", password: "sai" })).rejects.toBeInstanceOf(ApiError);
  expect(refreshCount).toBe(0);
});
