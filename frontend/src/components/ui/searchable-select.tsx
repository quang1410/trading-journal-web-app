import * as React from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type SearchableSelectProps = {
  id: string;
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  "aria-invalid"?: boolean;
  /**
   * Nhãn của mục "bỏ chọn", đặt ở đầu danh sách và trả về chuỗi rỗng.
   *
   * Chỉ ô LỌC cần nó: không chọn gì là một trạng thái hợp lệ ở đó, còn ở form
   * thì không — múi giờ rỗng không phải một múi giờ. Bỏ prop này thì danh
   * sách không có mục nào, đúng như trước.
   *
   * Mục này KHÔNG bị lọc theo từ khoá tìm kiếm: người gõ để thu hẹp danh
   * sách vẫn phải bỏ chọn được mà không cần xoá hết những gì vừa gõ.
   */
  clearLabel?: string;
};

export function SearchableSelect({
  id,
  value,
  options,
  onValueChange,
  onBlur,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  "aria-invalid": ariaInvalid,
  clearLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchId = `${id}-search`;
  const listId = `${id}-options`;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => option.toLocaleLowerCase().includes(normalizedQuery))
    : options;

  function close() {
    setOpen(false);
    setQuery("");
    onBlur?.();
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={ariaInvalid}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronDownIcon aria-hidden className="size-4 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-0 p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(searchId)?.focus();
        }}
      >
        <div className="relative mb-2">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pr-3 pl-9"
          />
        </div>
        <div id={listId} role="listbox" aria-label={placeholder} className="scroll-hairline max-h-60 overflow-y-auto">
          {clearLabel !== undefined && (
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className={cn(
                "flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground outline-none",
                "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
              )}
              onClick={() => {
                onValueChange("");
                close();
              }}
            >
              <span className="truncate">{clearLabel}</span>
              {value === "" && <CheckIcon aria-hidden className="size-4 shrink-0" />}
            </button>
          )}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === value}
                className={cn(
                  "flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
                  "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                )}
                onClick={() => {
                  onValueChange(option);
                  close();
                }}
              >
                <span className="truncate">{option}</span>
                {option === value && <CheckIcon aria-hidden className="size-4 shrink-0" />}
              </button>
            ))
          ) : (
            // Đã có mục "bỏ chọn" đứng trên thì danh sách không rỗng, nên
            // dòng "không tìm thấy" ở đây nói về KẾT QUẢ TÌM chứ không nói
            // về cả danh sách — vẫn đúng nghĩa, và vẫn cần hiện.
            <p className="px-2 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
