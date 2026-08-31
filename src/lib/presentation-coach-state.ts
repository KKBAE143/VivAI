export interface PresentationCoachState extends Record<string, unknown> {
  current_unit?: number;
  current_ordinal?: number;
  total_units?: number;
  concept?: string;
  current_concept?: string | Record<string, unknown> | null;
  evaluation?: Record<string, unknown> | string | null;
  recent_evaluation?: Record<string, unknown> | string | null;
  counters?: Record<string, unknown>;
  can_continue?: boolean;
  finished?: boolean;
  unit?: Record<string, unknown> | null;
  tips?: string[];
}

export type PresentationCoachMessage = {
  type: "state_snapshot" | "coach_state" | "unit_changed";
  state?: PresentationCoachState | null;
  evaluation?: PresentationCoachState["evaluation"];
  unit?: Record<string, unknown> | null;
};

export function reducePresentationCoachState(
  previous: PresentationCoachState | null,
  message: PresentationCoachMessage,
): PresentationCoachState | null {
  if (message.type === "state_snapshot") return message.state ?? null;
  return {
    ...(previous ?? {}),
    ...(message.state ?? {}),
    ...(message.evaluation === undefined ? {} : { evaluation: message.evaluation }),
    ...(message.type === "unit_changed" && message.unit ? { unit: message.unit } : {}),
  };
}
