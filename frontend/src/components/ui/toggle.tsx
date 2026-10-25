import * as React from "react";
import { Toggle as TogglePrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Nút bật/tắt (aria-pressed) của shadcn new-york: Đậm / Nghiêng, Khoá hình… Dùng chung bộ lớp với
// ToggleGroupItem.
const toggleVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // nền đảo màu khi bật — như ô Đậm / Nghiêng và các ô độ dày nét của TradingView
        default: "text-foreground hover:bg-surface-raised data-[state=on]:bg-foreground data-[state=on]:text-background",
        outline: "border border-border text-foreground hover:bg-surface-raised data-[state=on]:bg-foreground data-[state=on]:text-background",
        // nút trên thanh công cụ: bật thì chỉ tô nền nhạt
        ghost: "text-foreground hover:bg-surface-raised data-[state=on]:bg-surface-raised",
        // Không màu: người gọi tự tô theo trạng thái. Dùng cho nút nằm trên nền do người dùng
        // chọn (nút A/L trên trục giá của chart), nơi màu theme không đảm bảo đọc được.
        plain: "",
      },
      size: {
        default: "h-8 min-w-8 px-1.5",
        sm: "h-7 min-w-7 px-1",
        icon: "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Toggle({ className, variant, size, ...props }: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size }), className)} {...props} />;
}

export { Toggle, toggleVariants };
