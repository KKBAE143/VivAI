import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Weight applied per task status when deriving a suggested project progress. */
const TASK_PROGRESS_WEIGHT: Record<string, number> = {
  Done: 1,
  Review: 0.75,
  "In Progress": 0.4,
  "To Do": 0,
};

/**
 * Suggests an overall project completion percentage from task statuses.
 * Pure and side-effect free — the caller decides whether/when to apply it;
 * the manual progress value always wins over this suggestion.
 */
export function taskDerivedProgress(tasks: Array<{ status?: unknown }>): number | null {
  if (tasks.length === 0) return null;
  const total = tasks.reduce(
    (sum, task) => sum + (TASK_PROGRESS_WEIGHT[String(task.status ?? "To Do")] ?? 0),
    0,
  );
  return Math.round((total / tasks.length) * 100);
}
