import { clearSession, fireSessionDead, getAccessToken, setSession, type User } from "./session";

export class ApiError extends Error {
  constructor(
    readonly code: number,
    readonly msg: string,
    readonly status: number,
  ) {
    super(msg);
    this.name = "ApiError";
  }
}

export type Session = { access_token: string; user: User };

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

// Bốn đường này LÀ cơ chế auth, nên không được tự refresh khi gặp 401.
const DUONG_AUTH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

let inflight: Promise<boolean> | null = null;
let khoiDong: Promise<boolean> | null = null;

async function goi(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // same-origin: cookie refresh có Path=/api/auth và chỉ đi khi cùng origin.
  return fetch(`${BASE}${path}`, { ...init, headers, credentials: "same-origin" });
}

async function boc<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(1500, "máy chủ trả về dữ liệu không đọc được", res.status);
  }
  const e = body as { code?: unknown; msg?: unknown; data?: unknown };
  if (typeof e?.code !== "number") {
    throw new ApiError(1500, "máy chủ trả về dữ liệu sai định dạng", res.status);
  }
  if (e.code !== 0) {
    throw new ApiError(e.code, typeof e.msg === "string" ? e.msg : "lỗi không rõ", res.status);
  }
  return e.data as T;
}

/**
 * Xoay refresh token. GUARD ĐÚNG/SAI: `inflight` gộp mọi lần gọi song song
 * vào MỘT request. Backend phát hiện tái sử dụng — hai refresh song song mang
 * cùng một cookie sẽ bị đọc là replay và giết sạch mọi phiên của user.
 */
export function refreshSession(): Promise<boolean> {
  // ??= chứ không tự tham chiếu trong finally: TS từ chối biến được dùng
  // trước khi gán, và cách này cũng đọc thẳng hơn.
  inflight ??= xoay().finally(() => {
    inflight = null;
  });
  return inflight;
}

// xoay() không bao giờ reject — mọi lỗi đều thành `false` — nên chuỗi
// .finally ở trên không tạo unhandled rejection.
async function xoay(): Promise<boolean> {
  try {
    const s = await boc<Session>(await goi("/auth/refresh", { method: "POST" }));
    setSession(s.access_token, s.user);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

/**
 * Khôi phục phiên lúc mở app. Ghi nhớ kết quả để StrictMode gọi effect hai lần
 * cũng chỉ xoay một vòng. Đây CHỈ là vệ sinh, không phải guard đúng/sai: một
 * lần xoay thừa vẫn hợp lệ vì cookie đã đổi. Đừng viết test kiểu "gỡ biến này
 * thì phiên phải chết" — nó sẽ không chết.
 */
export function bootstrapSession(): Promise<boolean> {
  khoiDong ??= refreshSession();
  return khoiDong;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await goi(path, init);
  const laAuth = DUONG_AUTH.some((p) => path.startsWith(p));
  if (res.status !== 401 || laAuth) return boc<T>(res);

  const ok = await refreshSession();
  if (!ok) {
    fireSessionDead();
    return boc<T>(res); // ném lại chính lỗi 1401 gốc, chưa đọc body lần nào
  }
  // `init` phải dùng lại được: body luôn là chuỗi, không bao giờ là stream.
  return boc<T>(await goi(path, init));
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

/** Chỉ dùng trong test: xoá khoá giữa các case. */
export function __resetApiForTest(): void {
  inflight = null;
  khoiDong = null;
}
