import { formatTime } from "../lib/format";

export function SystemActivityFeed({ events = [], title = "Activity" }) {
  return (
    <section className="system-activity-feed glass-panel">
      <header className="console-header">
        <span>{title}</span>
        <span>{events.length ? `${events.length} recent` : "No recent activity"}</span>
      </header>
      <div className="console-body">
        {events.length ? (
          events.map((line) => (
            <div className={`log-line workflow-${line.level === "warning" ? "warning" : "system"}`} key={line.id}>
              <span className="log-time">{formatTime(line.occurred_at)}</span>
              <span className="log-badge system">ACT</span>
              <span className="log-text">{line.message}</span>
            </div>
          ))
        ) : (
          <div className="log-line workflow-system">
            <span className="log-time">--:--</span>
            <span className="log-badge system">ACT</span>
            <span className="log-text">No extension or TradingView activity yet.</span>
          </div>
        )}
      </div>
    </section>
  );
}
