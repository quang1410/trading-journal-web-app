import { useEffect, useState } from "react";

/** Giao diện sáng/tối hiện tại của app (thuộc tính data-theme của <html>), cập nhật khi người dùng đổi. */
export function useAppTheme(): string {
  const read = () => document.documentElement.getAttribute("data-theme") ?? "";
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}
