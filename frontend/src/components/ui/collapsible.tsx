import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"

// Thay cho `<details>/<summary>`: tam giác của summary là marker của trình duyệt (mỗi engine ẩn
// nó một kiểu), và trạng thái mở nằm trong DOM chứ không trong React. Radix đặt aria-expanded và
// data-state="open|closed" lên nút, nên icon xoay theo data-state được.
function Collapsible({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
}

function CollapsibleContent({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return <CollapsiblePrimitive.Content data-slot="collapsible-content" {...props} />
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
