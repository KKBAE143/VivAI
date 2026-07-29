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
});
