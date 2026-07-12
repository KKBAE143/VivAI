import { describe, expect, it } from "bun:test";

import { groupQuestionsAndScores } from "../live-stage";
import type { LiveEvent } from "@/lib/useLiveSession";

function ev(partial: Partial<LiveEvent> & Pick<LiveEvent, "id" | "kind" | "ts">): LiveEvent {
  return { text: "", ...partial };
}

describe("groupQuestionsAndScores", () => {
  it("merges a question and its later score into one evolving item", () => {
    const events: LiveEvent[] = [
      ev({ id: "e1", refId: "q_1", kind: "question", text: "What is a primary key?", topic: "DBMS", ts: 1 }),
      ev({ id: "e2", refId: "q_1", kind: "score", text: "Clear and correct.", score: 90, ts: 2 }),
    ];
    const grouped = groupQuestionsAndScores(events);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      question: "What is a primary key?",
      topic: "DBMS",
      score: 90,
      feedback: "Clear and correct.",
    });
  });

  it("keeps a second question separate even if asked before the first is scored", () => {
    const events: LiveEvent[] = [
      ev({ id: "e1", refId: "q_1", kind: "question", text: "Q1", ts: 1 }),
      ev({ id: "e2", refId: "q_2", kind: "question", text: "Q2", ts: 2 }),
      ev({ id: "e3", refId: "q_1", kind: "score", text: "fb1", score: 70, ts: 3 }),
    ];
    const grouped = groupQuestionsAndScores(events);
    expect(grouped).toHaveLength(2);
    expect(grouped.find((g) => g.question === "Q1")?.score).toBe(70);
    expect(grouped.find((g) => g.question === "Q2")?.score).toBeNull();
  });

  it("shows an unscored question as pending, not missing", () => {
    const events: LiveEvent[] = [ev({ id: "e1", refId: "q_1", kind: "question", text: "Q1", ts: 1 })];
    const grouped = groupQuestionsAndScores(events);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].score).toBeNull();
  });

  it("falls back to a standalone entry for a score with no matching question", () => {
    const events: LiveEvent[] = [
      ev({ id: "e1", refId: null, kind: "score", text: "General feedback.", score: 60, topic: "Delivery", ts: 1 }),
    ];
    const grouped = groupQuestionsAndScores(events);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].score).toBe(60);
    expect(grouped[0].question).toContain("Delivery");
  });
});
