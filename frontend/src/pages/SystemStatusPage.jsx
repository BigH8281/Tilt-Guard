import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { LiveTradingStatus } from "../components/LiveTradingStatus";
import { LoadingView } from "../components/LoadingView";
import { SystemActivityFeed } from "../components/SystemActivityFeed";
import { TradeEvidenceFeed } from "../components/TradeEvidenceFeed";
import { TradeEpisodeFeed } from "../components/TradeEpisodeFeed";
import { useAuth } from "../context/AuthContext";
import {
  deriveTradeEvidenceEpisodes,
  getLiveSymbol,
  hasLiveSessionSymbolMismatch,
  reduceSystemActivityNoise,
  reduceTradeEvidenceNoise,
  scopeTradeEvidenceEvents,
  useBrokerSystemFeed,
  useExtensionSessionStatus,
  useLatestBrokerTelemetry,
  useTradeEvidenceFeed,
} from "../lib/brokerTelemetry";
import { fetchSessionDetail, fetchTradeEvents } from "../lib/api";
import { formatDateTime } from "../lib/format";

function buildTradeAuditRows(tradeEvents = []) {
  return [...tradeEvents]
    .filter((event) => event.source !== "manual" || event.reconciliation_state !== "unmatched")
    .sort((left, right) => Date.parse(right.event_time) - Date.parse(left.event_time))
    .slice(0, 8);
}

function hasTradeSymbolMismatch(event, sessionSymbol) {
  return Boolean(event?.symbol && sessionSymbol && event.symbol !== sessionSymbol);
}

function describeTradeRecord(eventType) {
  switch (eventType) {
    case "ADD":
      return "Trade add record";
    case "REDUCE":
      return "Trade reduce record";
    case "CLOSE":
      return "Trade close record";
    default:
      return "Trade open record";
  }
}

export function SystemStatusPage() {
  const { token } = useAuth();
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [tradeEvents, setTradeEvents] = useState([]);
  const [pageError, setPageError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const liveTelemetry = useLatestBrokerTelemetry(token);
  const extensionSession = useExtensionSessionStatus(token);
  const brokerSystemFeed = useBrokerSystemFeed(token, 60);
  const tradeEvidenceFeed = useTradeEvidenceFeed(token, { limit: 60 });
  const liveSymbol = getLiveSymbol(extensionSession.session, liveTelemetry.telemetry, session?.symbol);
  const hasSymbolMismatch = hasLiveSessionSymbolMismatch(session?.symbol, liveSymbol);
  const scopedTradeEvidenceEvents = scopeTradeEvidenceEvents(tradeEvidenceFeed.events, {
    tradingSessionId: Number(sessionId),
    sessionSymbol: session?.symbol,
    liveSymbol,
  });
  const cleanedSystemEvents = reduceSystemActivityNoise(brokerSystemFeed.events);
  const cleanedTradeEvidenceEvents = reduceTradeEvidenceNoise(scopedTradeEvidenceEvents);
  const tradeEpisodes = deriveTradeEvidenceEpisodes(scopedTradeEvidenceEvents);
  const tradeAuditRows = buildTradeAuditRows(tradeEvents);

  useEffect(() => {
    let cancelled = false;

    async function loadSession(mode = "initial") {
      if (mode === "initial") {
        setIsLoading(true);
      }
      setPageError("");
      try {
        const [nextSession, nextTradeEvents] = await Promise.all([
          fetchSessionDetail(token, sessionId),
          fetchTradeEvents(token, sessionId),
        ]);
        if (!cancelled) {
          setSession(nextSession);
          setTradeEvents(nextTradeEvents);
        }
      } catch (loadError) {
        if (!cancelled) {
          setPageError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadSession("initial");
    const intervalId = window.setInterval(() => {
      loadSession("refresh");
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [sessionId, token]);

  if (isLoading) {
    return <LoadingView label="Loading system status..." />;
  }

  if (!session) {
    return (
      <EmptyState
        title="System status unavailable"
        description={pageError || "The session could not be loaded."}
        action={
          <Link to="/">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="workspace-page system-status-page">
      <LiveTradingStatus
        error={extensionSession.error || liveTelemetry.error}
        extensionSession={extensionSession.session}
        isLoading={liveTelemetry.isLoading || extensionSession.isLoading}
        isRefreshing={liveTelemetry.isRefreshing || extensionSession.isRefreshing}
        onRefresh={async () => {
          await Promise.all([liveTelemetry.refresh(), extensionSession.refresh()]);
        }}
        telemetry={liveTelemetry.telemetry}
        title="System Status"
        variant="strip"
      />

      <section className="journal-top-strip glass-panel">
        <div className="session-line">
          <strong>#{session.id}</strong>
          <span>{liveSymbol || session.symbol}</span>
          <span>{session.session_name}</span>
          <span>{session.status.toUpperCase()}</span>
          <span>Started {formatDateTime(session.started_at)}</span>
        </div>
        <div className="toolbar-row">
          <Link to={`/sessions/${session.id}`}>
            <Button type="button" variant="secondary">
              Back to journal
            </Button>
          </Link>
          <Link to="/">
            <Button type="button" variant="secondary">
              Dashboard
            </Button>
          </Link>
        </div>
      </section>

      {pageError ? <div className="alert error-alert">{pageError}</div> : null}
      {hasSymbolMismatch ? (
        <div className="alert warning-alert">
          Live chart evidence is currently coming from {liveSymbol}. This differs from journal session #{session.id} for{" "}
          {session.symbol}, so System Status is showing the current chart evidence until the symbols match again.
        </div>
      ) : null}

      <TradeEpisodeFeed episodes={tradeEpisodes} />

      <section className="glass-panel">
        <header className="feed-header">
          <div>
            <h2>Trade record audit</h2>
            <p>Observed/manual reconciliation stays here, not in the main journal.</p>
          </div>
        </header>
        {tradeAuditRows.length ? (
          <div className="evidence-feed">
            {tradeAuditRows.map((event) => (
              <article className="evidence-item" key={`trade-audit-${event.id}`}>
                <div className="evidence-meta">
                  <span>{event.event_type}</span>
                  <span>{event.symbol || session.symbol}</span>
                  <span>{event.source}</span>
                  <span>{event.reconciliation_state}</span>
                </div>
                <strong>{describeTradeRecord(event.event_type)}</strong>
                <p>
                  {hasTradeSymbolMismatch(event, session.symbol)
                    ? `Session opened on ${session.symbol}; confirmed trade symbol is ${event.symbol}.`
                    : event.source === "merged"
                      ? "Observed facts won the factual fields for this journal trade record."
                      : event.source === "observed"
                        ? "This journal trade record was created from confirmed observed evidence."
                        : "This journal trade record remains manual."}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="subdued-text">No reconciled trade records yet for this session.</p>
        )}
      </section>

      <section className="system-status-grid">
        <TradeEvidenceFeed events={cleanedTradeEvidenceEvents} />
        <SystemActivityFeed events={cleanedSystemEvents} title="TradingView activity" />
      </section>
    </div>
  );
}
