import { describe, expect, it } from "bun:test";

import { plainText } from "../live-stage";

/**
 * The model writes its observations and feedback as if for a chat window, so
 * `*emphasis*` and leading `* ` bullets came through and rendered as literal
 * asterisks inside the live evaluation cards. Stripping beats rendering
 * untrusted model output as markdown.
 */
describe("plainText", () => {
  it("removes leading bullet markers", () => {
    expect(plainText("* Used precise terms like atomic value")).toBe(
      "Used precise terms like atomic value",
    );
    expect(plainText("- Clearly explained the key")).toBe("Clearly explained the key");
  });

  it("removes bullet markers on every line", () => {
    expect(plainText("* first\n* second")).toBe("first\nsecond");
  });

  it("unwraps bold and italic emphasis", () => {
    expect(plainText("**primary key** and *composite key*")).toBe("primary key and composite key");
  });

  it("unwraps inline code", () => {
    expect(plainText("use `SELECT` here")).toBe("use SELECT here");
  });

  it("leaves ordinary prose untouched", () => {
    const text = "Explained 3NF, but never defined a transitive dependency.";
    expect(plainText(text)).toBe(text);
  });

  it("does not eat a multiplication sign or a footnote star mid-sentence", () => {
    expect(plainText("O(n*m) complexity")).toBe("O(n*m) complexity");
  });

  it("trims surrounding whitespace", () => {
    expect(plainText("  spaced  ")).toBe("spaced");
  });

  it("handles an empty string", () => {
    expect(plainText("")).toBe("");
  });
});
