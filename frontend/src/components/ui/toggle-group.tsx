import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { toggleVariants } from "./toggle";

// Dãy ô chọn liền nhau (Thickness, Line style của bảng màu). Với type="single", Radix cho khung role="radiogroup", mỗi ô
// role="radio" + aria-checked — trình đọc màn hình đọc "1 trong 4".
//
// Chú ý: type="single" cho phép bấm lại ô đang chọn để BỎ chọn (onValueChange("")). Nơi dùng phải
// bỏ qua giá trị rỗng nếu không muốn trạng thái "không chọn gì".
function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("flex w-full items-stretch overflow-hidden rounded-md border border-border", className)}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      // khung ngoài overflow-hidden cắt mất vòng focus vẽ ra ngoài ô: vẽ vào trong và nổi lên trên ô bên cạnh
      className={cn(toggleVariants({ variant, size }), "flex-1 rounded-none focus-visible:z-10 focus-visible:ring-inset", className)}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
