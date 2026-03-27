/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JournalConsole } from "./JournalConsole";

describe("JournalConsole", () => {
  it("shows the traded symbol and session-symbol mismatch for observed trades", () => {
    render(
      <JournalConsole
        activePrompt={null}
        feed={[
          {
            id: "observed-1",
            type: "observed_trade",
            timestamp: "2026-03-26T19:07:37.187Z",
            payload: {
              id: "observed-1",
              source: "observed",
              event_type: "OPEN",
              direction: "buy",
              size: 5,
              result_gbp: null,
              note: null,
              event_time: "2026-03-26T19:07:37.187Z",
              symbol: "NAS100",
              session_symbol: "XAUUSD",
              symbol_mismatch: true,
            },
          },
        ]}
        inputValue=""
        isSubmitting={false}
        logRef={{ current: null }}
        onInputChange={() => {}}
        onSubmit={(event) => event.preventDefault()}
        systemLines={[]}
        workflowTranscript={[]}
      />,
    );

    expect(screen.getByText(/symbol NAS100/i)).toBeTruthy();
    expect(screen.getByText(/session opened on XAUUSD/i)).toBeTruthy();
    expect(screen.queryByText(/observed via tradingview/i)).toBeNull();
  });

  it("renders add and reduce records with calm delta-focused labels", () => {
    render(
      <JournalConsole
        activePrompt={null}
        feed={[
          {
            id: "trade-add-1",
            type: "trade",
            timestamp: "2026-03-26T19:07:37.187Z",
            payload: {
              id: 11,
              source: "observed",
              event_type: "ADD",
              direction: "buy",
              size: 1,
              result_gbp: null,
              note: null,
              event_time: "2026-03-26T19:07:37.187Z",
              symbol: "NAS100",
            },
          },
          {
            id: "trade-reduce-1",
            type: "trade",
            timestamp: "2026-03-26T19:09:37.187Z",
            payload: {
              id: 12,
              source: "observed",
              event_type: "REDUCE",
              direction: "buy",
              size: 1,
              result_gbp: null,
              note: null,
              event_time: "2026-03-26T19:09:37.187Z",
              symbol: "NAS100",
            },
          },
        ]}
        inputValue=""
        isSubmitting={false}
        logRef={{ current: null }}
        onInputChange={() => {}}
        onSubmit={(event) => event.preventDefault()}
        systemLines={[]}
        workflowTranscript={[]}
      />,
    );

    expect(screen.getByText(/\[TRADE ADD\] \| symbol NAS100 \| buy \| 1 contract/i)).toBeTruthy();
    expect(screen.getByText(/\[TRADE REDUCE\] \| symbol NAS100 \| buy \| 1 contract/i)).toBeTruthy();
  });
});
