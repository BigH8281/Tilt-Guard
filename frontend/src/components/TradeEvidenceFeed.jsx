import { formatTime } from "../lib/format";

function formatEvidenceLine(event) {
  const parts = [event.symbol, event.side, event.order_type, event.quantity].filter(Boolean);
  return parts.length ? parts.join(" · ") : event.raw_signal_summary;
}

export function TradeEvidenceFeed({ events = [] }) {
  return (
    <section className="system-activity-feed glass-panel">
      <header className="console-header">
        <span>Raw trade evidence</span>
        <span>{events.length ? `${events.length} recent` : "No observed trade evidence yet"}</span>
      </header>
      <div className="console-body">
        {events.length ? (
          events.map((event) => (
            <div className="log-line workflow-system" key={event.event_id}>
              <span className="log-time">{formatTime(event.occurred_at)}</span>
              <span className="log-badge system">EVD</span>
              <span className="log-text">
                <strong>{event.event_type.replace(/_/g, " ")}</strong>
                {" - "}
                {formatEvidenceLine(event)}
                {" · "}
                {event.evidence_stage.replace(/_/g, " ")}
                {" · "}
                {Math.round((event.confidence || 0) * 100)}%
              </span>
            </div>
          ))
        ) : (
          <div className="log-line workflow-system">
            <span className="log-time">--:--</span>
            <span className="log-badge system">EVD</span>
            <span className="log-text">Trade interactions will appear here when TradingView evidence is detected.</span>
          </div>
        )}
      </div>
    </section>
  );
}
