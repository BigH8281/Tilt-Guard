import { Button } from "./Button";
import { formatTelemetryFreshness, getTelemetryStatusCopy } from "../lib/brokerTelemetry";

function renderValue(value, fallback = "Unavailable") {
  return value || fallback;
}

export function LiveTradingStatus({
  telemetry,
  error = "",
  isLoading = false,
  isRefreshing = false,
  onRefresh,
  title = "Live Trading Status",
  variant = "card",
}) {
  const status = getTelemetryStatusCopy(telemetry);
  const brokerLabel = telemetry?.snapshot?.broker?.broker_label;
  const cardClassName =
    variant === "strip"
      ? "live-status-card live-status-strip glass-panel"
      : "live-status-card glass-panel";

  return (
    <section className={cardClassName}>
      <div className="live-status-header">
        <div>
          {variant === "card" ? <p className="eyebrow">Broker telemetry</p> : null}
          <h3>{title}</h3>
        </div>
        <Button disabled={isRefreshing} onClick={onRefresh} type="button" variant="secondary">
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="live-status-summary">
        <span className={`live-status-dot ${status.tone} ${telemetry?.status === "live" ? "pulsing" : ""}`} />
        <div className="live-status-copy">
          <strong>{status.label}</strong>
          <span>{isLoading ? "Checking latest telemetry..." : status.description}</span>
        </div>
      </div>

      <dl className="live-status-grid">
        <div>
          <dt>Broker</dt>
          <dd>{renderValue(brokerLabel || telemetry?.broker_adapter?.toUpperCase())}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd>{renderValue(telemetry?.account_name)}</dd>
        </div>
        <div>
          <dt>Symbol</dt>
          <dd>{renderValue(telemetry?.symbol)}</dd>
        </div>
        <div>
          <dt>Last update</dt>
          <dd>{formatTelemetryFreshness(telemetry)}</dd>
        </div>
      </dl>

      {error ? <div className="alert error-alert">{error}</div> : null}
    </section>
  );
}
