import { describe, expect, it } from "bun:test";

import { requestSocketEnd, type EndSocket } from "../useLiveSession";

function socket(readyState: number) {
  const sent: string[] = [];
  let onOpen: (() => void) | undefined;
  const value: EndSocket = {
    readyState,
    send: (message) => sent.push(String(message)),
    addEventListener: (_type, listener) => {
      onOpen = listener;
    },
  };
  return { value, sent, open: () => onOpen?.() };
}

/**
 * `stop()` used to send the end request only when the socket was already OPEN, so
 * pressing "End & report" during the connecting window discarded it silently: the
 * server never learned the student was done and the session kept running. That
 * window is not an edge case — it is exactly when somebody ends a session that is
 * struggling to come up.
 */
describe("requestSocketEnd", () => {
  it("sends End immediately through an open socket", () => {
    const ws = socket(1);
    requestSocketEnd(ws.value);
    expect(ws.sent).toEqual([JSON.stringify({ type: "end" })]);
  });

  it("queues End for a socket whose handshake is still connecting", () => {
    const ws = socket(0);
    requestSocketEnd(ws.value);
    expect(ws.sent).toEqual([]);

    ws.value.readyState = 1;
    ws.open();
    expect(ws.sent).toEqual([JSON.stringify({ type: "end" })]);
  });

  it("does not attempt to send through a closing socket", () => {
    for (const readyState of [2 /* CLOSING */, 3 /* CLOSED */]) {
      const ws = socket(readyState);
      requestSocketEnd(ws.value);
      expect(ws.sent).toEqual([]);
    }
  });

  it("survives a socket that dies between opening and the send", () => {
    const ws = socket(0);
    ws.value.send = () => {
      throw new Error("socket closed");
    };
    requestSocketEnd(ws.value);
    ws.value.readyState = 1;
    expect(() => ws.open()).not.toThrow();
  });
});
