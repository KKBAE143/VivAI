import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Shared centered-dialog chrome — extracted from projects/$id.tsx so every
 * feature's modals (task edit, project edit, team linking, ...) share one
 * implementation instead of drifting copies. */
export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 font-manrope animate-fade-in"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] sm:max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#0A0E16]/95 backdrop-blur-2xl border-t sm:border border-white/10 p-5 sm:p-6 shadow-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#AFDDFF]" />
            <h3 className="text-base sm:text-lg font-bold font-graphik tracking-wide text-white">
              {title}
            </h3>
          </div>
          <button
            aria-label="Close dialog"
            onClick={onClose}
            className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 text-white">{children}</div>
      </div>
    </div>
  );
}
