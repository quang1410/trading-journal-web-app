import * as React from "react";
import { Toggle as TogglePrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Nút bật/tắt (aria-pressed) của shadcn new-york: Đậm / Nghiêng, Khoá hình… Dùng chung bộ lớp với
// ToggleGroupItem.
const toggleVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap text-foreground transition-colors outline-none hover:bg-surface-raised focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // nền đảo màu khi bật — như ô Đậm / Nghiêng và các ô độ dày nét của TradingView
        default: "data-[state=on]:bg-foreground data-[state=on]:text-background",
        outline: "border border-border data-[state=on]:bg-foreground data-[state=on]:text-background",
        // nút trên thanh công cụ: bật thì chỉ tô nền nhạt
        ghost: "data-[state=on]:bg-surface-raised",
      },
      size: {
        default: "h-8 min-w-8 px-1.5",
        sm: "h-7 min-w-7 px-1",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Toggle({ className, variant, size, ...props }: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size }), className)} {...props} />;
}

export { Toggle, toggleVariants };
