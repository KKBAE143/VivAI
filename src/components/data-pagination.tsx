import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataPaginationProps {
  page: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemName?: string;
}

export function DataPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className,
  itemName = "items",
}: DataPaginationProps) {
  if (totalPages <= 1) return null;

  // Calculate sliding page numbers window (e.g. 1 2 3 4 5)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      } else if (page >= totalPages - 2) {
        pages.push(1);
        pages.push("...");
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push("...");
        pages.push(page - 1);
        pages.push(page);
        pages.push(page + 1);
        pages.push("...");
        pages.push(totalPages);
      }
    }
    return pages;
  };

  const startIdx = pageSize ? (page - 1) * pageSize + 1 : null;
  const endIdx = pageSize && totalItems ? Math.min(page * pageSize, totalItems) : null;

  return (
    <div
      className={cn(
        "mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10 font-manrope",
        className,
      )}
    >
      {/* Item Range info */}
      <div className="text-xs text-white/50">
        {startIdx !== null && endIdx !== null && totalItems !== undefined ? (
          <span>
            Showing <span className="font-semibold text-white">{startIdx}</span>–
            <span className="font-semibold text-white">{endIdx}</span> of{" "}
            <span className="font-semibold text-white">{totalItems}</span> {itemName}
          </span>
        ) : (
          <span>
            Page <span className="font-semibold text-white">{page}</span> of{" "}
            <span className="font-semibold text-white">{totalPages}</span>
          </span>
        )}
      </div>

      {/* Page Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous Page"
          className="flex h-10 sm:h-8 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white transition-all hover:bg-white/10 active:scale-95 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        <div className="flex items-center gap-1">
          {getPageNumbers().map((p, idx) => {
            if (p === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="flex h-10 sm:h-8 w-6 items-center justify-center text-xs text-white/40"
                >
                  …
                </span>
              );
            }

            const pageNum = Number(p);
            const isActive = pageNum === page;

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95",
                  isActive
                    ? "bg-[#AFDDFF] text-black shadow-[0_0_12px_rgba(175,221,255,0.3)] scale-105"
                    : "border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10",
                )}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next Page"
          className="flex h-10 sm:h-8 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white transition-all hover:bg-white/10 active:scale-95 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
        </button>
      </div>
    </div>
  );
}
