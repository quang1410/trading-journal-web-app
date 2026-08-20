export type Theme = "dark" | "light";

// Khoá này cũng xuất hiện trong script inline của index.html. Đổi một nơi
// thì phải đổi cả hai — theme.test.ts canh điều đó.
export const THEME_KEY = "journal.theme";

type Doc = Pick<Storage, "getItem">;
type Ghi = Pick<Storage, "setItem">;

export function readStoredTheme(store: Doc = localStorage): Theme {
  return store.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

export function storeTheme(t: Theme, store: Ghi = localStorage): void {
  store.setItem(THEME_KEY, t);
}

export function applyTheme(t: Theme, root: HTMLElement = document.documentElement): void {
  root.setAttribute("data-theme", t);
}
