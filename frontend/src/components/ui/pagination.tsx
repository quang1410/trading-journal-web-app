import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { useI18n } from "@/i18n"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  const { t } = useI18n()
  return (
    <nav
      role="navigation"
      aria-label={t("common.pagination")}
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

// `asChild` là phần đi lệch khỏi bản gốc của shadcn, có chủ ý: bản gốc render
// cứng thẻ <a href>, còn ở đây số trang do react-router <Link> cấp. Bọc qua
// Slot giữ được URL thật — bấm chuột giữa mở tab mới, và người dùng copy được
// đường dẫn kèm bộ lọc — thứ mà <button onClick> không cho.
type PaginationLinkProps = {
  isActive?: boolean
  asChild?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  size = "icon",
  asChild = false,
  ...props
}: PaginationLinkProps) {
  const Comp = asChild ? Slot.Root : "a"
  return (
    <Comp
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({ variant: isActive ? "outline" : "ghost", size }),
        className
      )}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  const { t } = useI18n()
  return (
    <PaginationLink
      aria-label={t("trades.previousPage")}
      size={size}
      className={cn("gap-1 px-2.5 sm:pl-2.5", className)}
      {...props}
    >
      <ChevronLeftIcon />
       <span className="hidden sm:block">{t("trades.previousPage")}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  const { t } = useI18n()
  return (
    <PaginationLink
      aria-label={t("trades.nextPage")}
      size={size}
      className={cn("gap-1 px-2.5 sm:pr-2.5", className)}
      {...props}
    >
       <span className="hidden sm:block">{t("trades.nextPage")}</span>
      <ChevronRightIcon />
    </PaginationLink>
  )
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  const { t } = useI18n()
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
       <span className="sr-only">{t("common.more")}</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
