/**
 * Which onboarding steps each role walks, and how to move between them.
 *
 * Pure and separate from the route component so the step machine is testable
 * without rendering a wizard. Mirrors ROLE_STEPS in
 * backend/services/onboarding_service.py — change both together.
 */
export type OnboardingRole = "student" | "faculty" | "admin";

export const ROLE_STEPS: Record<OnboardingRole, string[]> = {
  student: ["institution", "academics", "project", "goals"],
  faculty: ["institution", "teaching"],
  admin: ["institution_create", "invite_faculty"],
};

/** Steps for a role, falling back to the student flow for anything unknown. */
export function stepsFor(role: string): string[] {
  return ROLE_STEPS[role as OnboardingRole] ?? ROLE_STEPS.student;
}

export function totalSteps(role: string): number {
  return stepsFor(role).length;
}

/** Advance, clamped to the last step so Next can never overrun the wizard. */
export function nextStep(role: string, index: number): number {
  return Math.min(index + 1, totalSteps(role) - 1);
}

/** Go back, clamped at the first step. */
export function prevStep(index: number): number {
  return Math.max(index - 1, 0);
}

export function isLastStep(role: string, index: number): boolean {
  return index >= totalSteps(role) - 1;
}
