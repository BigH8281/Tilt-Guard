import { formatTime } from "../lib/format";

function formatEpisodeDetails(episode) {
  const sizeDetail =
    Number.isFinite(episode.delta_quantity) &&
    (episode.episode_type === "position_add_confirmed" || episode.episode_type === "position_reduce_confirmed")
      ? `delta ${episode.delta_quantity}`
      : episode.quantity;
  const parts = [episode.symbol, episode.side, episode.order_type, sizeDetail].filter(Boolean);
  if (episode.primary_source_surface === "chart_inline") {
    parts.push("chart action");
  } else if (episode.primary_source_surface === "chart_planning_tool") {
    parts.push("planning tool");
  } else if (episode.primary_source_surface === "order_ticket") {
    parts.push("order ticket");
  }
  return parts.join(" · ");
}

export function TradeEpisodeFeed({ episodes = [] }) {
  return (
    <section className="system-activity-feed glass-panel">
      <header className="console-header">
        <span>Observed trade episodes</span>
        <span>{episodes.length ? `${episodes.length} recent` : "No observed trade episodes yet"}</span>
      </header>
      <div className="console-body">
        {episodes.length ? (
          episodes.map((episode) => (
            <div className="log-line workflow-system" key={episode.episode_id}>
              <span className="log-time">{formatTime(episode.last_event_at)}</span>
              <span className="log-badge system">EP</span>
              <span className="log-text">
                <strong>{episode.summary}</strong>
                {formatEpisodeDetails(episode) ? ` - ${formatEpisodeDetails(episode)}` : ""}
                {" · "}
                {episode.evidence_stage.replace(/_/g, " ")}
                {" · "}
                {Math.round((episode.confidence || 0) * 100)}%
              </span>
            </div>
          ))
        ) : (
          <div className="log-line workflow-system">
            <span className="log-time">--:--</span>
            <span className="log-badge system">EP</span>
            <span className="log-text">Observed TradingView episodes will appear here as evidence becomes correlated.</span>
          </div>
        )}
      </div>
    </section>
  );
}
