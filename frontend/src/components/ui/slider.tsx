import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// Thanh kéo của shadcn new-york, thay cho <input type="range">. `trackClassName` để tô riêng
// rãnh (thanh màu sắc của ColorPicker); `rangeClassName` để tô riêng phần đã chọn.
function Slider({
  className,
  trackClassName,
  rangeClassName,
  thumbLabel,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  trackClassName?: string;
  rangeClassName?: string;
  /** Nhãn trợ năng của núm kéo — role="slider" nằm trên núm, không phải trên khung. */
  thumbLabel?: string;
}) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn("relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5", trackClassName)}
      >
        <SliderPrimitive.Range data-slot="slider-range" className={cn("absolute h-full bg-foreground data-[orientation=vertical]:h-auto data-[orientation=vertical]:w-full", rangeClassName)} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label={thumbLabel}
        className={cn(
          "block size-4 shrink-0 cursor-pointer rounded-full border-2 border-foreground bg-background transition-[color,box-shadow] outline-none",
          "hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/50",
          // Radix đánh dấu núm bị khoá bằng data-disabled, không phải thuộc tính disabled
          "data-[disabled]:pointer-events-none",
        )}
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
