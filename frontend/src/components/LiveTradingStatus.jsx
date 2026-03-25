import { Button } from "./Button";
import {
  formatTelemetryFreshness,
  getLiveSymbol,
  getUnifiedMonitoringStatusCopy,
} from "../lib/brokerTelemetry";

function renderValue(value, fallback = "Unavailable") {
  return value || fallback;
}

export function LiveTradingStatus({
  extensionSession = null,
  telemetry,
  error = "",
  isLoading = false,
  isRefreshing = false,
  onRefresh,
  title = "Live Trading Status",
  variant = "card",
}) {
  const status = getUnifiedMonitoringStatusCopy(extensionSession, telemetry);
  const brokerLabel = telemetry?.snapshot?.broker?.broker_label;
  const connectionBroker = extensionSession?.broker_profile || brokerLabel;
  const liveSymbol = getLiveSymbol(extensionSession, telemetry);
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
          <dt>Symbol</dt>
          <dd>{renderValue(liveSymbol)}</dd>
        </div>
        <div>
          <dt>Broker</dt>
          <dd>{renderValue(connectionBroker || telemetry?.broker_adapter?.toUpperCase())}</dd>
        </div>
        <div>
          <dt>Adapter</dt>
          <dd>{renderValue(extensionSession?.broker_adapter || telemetry?.broker_adapter)}</dd>
        </div>
        <div>
          <dt>Monitoring</dt>
          <dd>{renderValue(extensionSession?.monitoring_state || telemetry?.status)}</dd>
        </div>
        <div>
          <dt>Last update</dt>
          <dd>
            {extensionSession?.status_payload?.telemetry_updated_at
              ? new Date(extensionSession.status_payload.telemetry_updated_at).toLocaleString()
              : extensionSession?.last_heartbeat_at
                ? new Date(extensionSession.last_heartbeat_at).toLocaleString()
              : formatTelemetryFreshness(telemetry)}
          </dd>
        </div>
      </dl>

      {extensionSession ? (
        <dl className="live-status-grid">
          <div>
            <dt>TradingView</dt>
            <dd>{extensionSession.tradingview_detected ? "Detected" : "Not detected"}</dd>
          </div>
          <div>
            <dt>Extension State</dt>
            <dd>{renderValue(extensionSession.extension_state)}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{Math.round((extensionSession.adapter_confidence || 0) * 100)}%</dd>
          </div>
          <div>
            <dt>Warning</dt>
            <dd>{renderValue(extensionSession.warning_message, "None")}</dd>
          </div>
        </dl>
      ) : null}

      {error ? <div className="alert error-alert">{error}</div> : null}
    </section>
  );
}
