import { describe, expect, it } from "bun:test";

import { parseSubjects, validateStep, type StepValues } from "../onboarding-schema";

const values = (over: Partial<StepValues> = {}): StepValues => ({
  institutionCode: "",
  institutionName: "",
  department: "",
  subjects: "",
  ...over,
});

describe("parseSubjects", () => {
  it("splits, trims, and drops blanks", () => {
    expect(parseSubjects(" DBMS , OS ,, Networks ")).toEqual(["DBMS", "OS", "Networks"]);
  });

  it("drops duplicates so a subject is not examined twice", () => {
    expect(parseSubjects("DBMS, DBMS, OS")).toEqual(["DBMS", "OS"]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseSubjects("   ")).toEqual([]);
  });
});

describe("validateStep — institution", () => {
  it("lets a student skip the code", () => {
    // B2C signup must never be blocked behind an institution.
    expect(validateStep("institution", "student", values())).toBeNull();
  });

  it("requires a code for faculty", () => {
    const err = validateStep("institution", "faculty", values());
    expect(err).toContain("required");
  });

  it("rejects a malformed code with a message that says what to fix", () => {
    const err = validateStep("institution", "student", values({ institutionCode: "ab" }));
    expect(err).toContain("too short");
  });

  it("rejects codes with illegal characters", () => {
    const err = validateStep("institution", "student", values({ institutionCode: "AB!@#$%^" }));
    expect(err).toContain("letters, numbers");
  });

  it("accepts a real generated code", () => {
    expect(validateStep("institution", "faculty", values({ institutionCode: "A1B2C3D4" }))).toBeNull();
  });

  it("ignores surrounding whitespace", () => {
    expect(validateStep("institution", "faculty", values({ institutionCode: "  A1B2C3D4  " }))).toBeNull();
  });
});

describe("validateStep — institution_create", () => {
  it("rejects a too-short name", () => {
    expect(validateStep("institution_create", "admin", values({ institutionName: "X" }))).toContain(
      "full name",
    );
  });

  it("accepts a real name", () => {
    expect(
      validateStep("institution_create", "admin", values({ institutionName: "NIT Trichy" })),
    ).toBeNull();
  });
});

describe("validateStep — teaching", () => {
  it("requires a department", () => {
    expect(validateStep("teaching", "faculty", values())).toContain("department");
  });

  it("allows empty subjects", () => {
    // Faculty may examine across subjects; do not block the wizard on it.
    expect(validateStep("teaching", "faculty", values({ department: "CSE" }))).toBeNull();
  });

  it("rejects an absurdly long subject list", () => {
    const err = validateStep(
      "teaching",
      "faculty",
      values({ department: "CSE", subjects: "x".repeat(501) }),
    );
    expect(err).toContain("under 500");
  });
});

describe("validateStep — steps with defaults", () => {
  it("never blocks steps whose fields are pre-selected", () => {
    for (const step of ["academics", "project", "goals", "invite_faculty"] as const) {
      expect(validateStep(step, "student", values())).toBeNull();
    }
  });
});
