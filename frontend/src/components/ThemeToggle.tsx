import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { applyTheme, readStoredTheme, storeTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  const sangTiepTheo = theme === "dark";
  return (
    <Button variant="outline" size="sm" onClick={() => setTheme(sangTiepTheo ? "light" : "dark")}>
      {sangTiepTheo ? "Giao diện sáng" : "Giao diện tối"}
    </Button>
  );
}
