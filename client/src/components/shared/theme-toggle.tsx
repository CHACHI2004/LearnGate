import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <Button aria-label={`Switch to ${next} theme`} onClick={toggleTheme} size="icon" variant="ghost">
      <Icon aria-hidden="true" size={18} />
    </Button>
  );
}
