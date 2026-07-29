import { describe, expect, it } from "bun:test";

import {
  isLastStep,
  nextStep,
  prevStep,
  ROLE_STEPS,
  stepsFor,
  totalSteps,
} from "../onboarding-flow";

describe("onboarding flow", () => {
  it("keeps the existing three-step student wizard", () => {
    // Four screens: institution link, then the existing academics / project
    // type / goals steps, which must stay intact.
    expect(ROLE_STEPS.student).toEqual(["institution", "academics", "project", "goals"]);
    expect(totalSteps("student")).toBe(4);
  });

  it("gives faculty and admin their own steps", () => {
    expect(stepsFor("faculty")).toEqual(["institution", "teaching"]);
    expect(stepsFor("admin")).toEqual(["institution_create", "invite_faculty"]);
  });

  it("falls back to the student flow for an unknown role", () => {
    // Never return an empty wizard — the user would be stuck on a dead screen.
    expect(stepsFor("nonsense")).toEqual(ROLE_STEPS.student);
    expect(stepsFor("")).toEqual(ROLE_STEPS.student);
  });

  it("clamps navigation at both ends", () => {
    expect(nextStep("faculty", 0)).toBe(1);
    // Faculty has 2 steps, so index 1 is the last: next must not overrun.
    expect(nextStep("faculty", 1)).toBe(1);
    expect(prevStep(0)).toBe(0);
    expect(prevStep(2)).toBe(1);
  });

  it("knows the final step per role", () => {
    expect(isLastStep("faculty", 1)).toBe(true);
    expect(isLastStep("faculty", 0)).toBe(false);
    expect(isLastStep("student", 3)).toBe(true);
    expect(isLastStep("student", 2)).toBe(false);
  });
});
