// Access token sống ở đây, trong một biến cấp module — KHÔNG phải state React,
// KHÔNG phải localStorage (spec mẹ §7.2). Cấp module là điều kiện để api.ts
// khoá được refresh, vì khoá phải sống lâu hơn vòng đời component.

export type User = { id: number; email: string };

let accessToken: string | null = null;
let user: User | null = null;
let baoChet: (() => void) | null = null;

export const getAccessToken = (): string | null => accessToken;
export const getUser = (): User | null => user;

export function setSession(token: string, u: User): void {
  accessToken = token;
  user = u;
}

export function clearSession(): void {
  accessToken = null;
  user = null;
}

/** AuthProvider đăng ký hàm này để dọn cache và đẩy về /login. */
export function setOnSessionDead(cb: (() => void) | null): void {
  baoChet = cb;
}

export function fireSessionDead(): void {
  clearSession();
  baoChet?.();
}
