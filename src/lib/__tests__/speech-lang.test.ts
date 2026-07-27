import { describe, expect, it } from "bun:test";

import { LIVE_LANGUAGES } from "../languages";
import { speechLangCode } from "../speech";

describe("speechLangCode", () => {
  it("has a real code for every language the UI actually offers", () => {
    // Regression: the map listed only English/Hindi/Hinglish, so the other ten
    // offered languages silently fell back to en-IN — a Telugu student's
    // dictation and read-aloud both ran as English, with nothing to notice.
    const regional: Record<string, string> = {
      Telugu: "te-IN",
      Tamil: "ta-IN",
      Kannada: "kn-IN",
      Malayalam: "ml-IN",
      Marathi: "mr-IN",
      Bengali: "bn-IN",
      Gujarati: "gu-IN",
      Punjabi: "pa-IN",
      Hindi: "hi-IN",
    };
    for (const [language, expected] of Object.entries(regional)) {
      expect(LIVE_LANGUAGES).toContain(language as (typeof LIVE_LANGUAGES)[number]);
      expect(speechLangCode(language)).toBe(expected);
    }
  });

  it("maps the code-mixed blends to Indian English", () => {
    // No engine has a code for a blend; en-IN handles the borrowed regional
    // words better than the pure regional locale does.
    for (const blend of ["Hinglish", "Tenglish", "Tanglish"]) {
      expect(speechLangCode(blend)).toBe("en-IN");
    }
  });

  it("never returns an empty code, even for an unknown label", () => {
    expect(speechLangCode("Klingon")).toBe("en-IN");
    expect(speechLangCode("")).toBe("en-IN");
  });

  it("covers every entry in LIVE_LANGUAGES with a well-formed BCP-47 code", () => {
    for (const language of LIVE_LANGUAGES) {
      expect(speechLangCode(language)).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });
});
