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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-[calc(100%-1rem)] max-w-md overflow-y-auto rounded-3xl bg-card/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/40 dark:border-white/15 p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-xl bg-secondary/70 backdrop-blur-md border border-white/20 dark:border-white/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
