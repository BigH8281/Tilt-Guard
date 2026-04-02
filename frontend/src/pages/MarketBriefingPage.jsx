import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "../components/Button";
import { LoadingView } from "../components/LoadingView";
import { useAuth } from "../context/AuthContext";
import {
  fetchCurrentPreSessionBriefing,
  fetchPreSessionBriefing,
  fetchPreSessionBriefingCapabilities,
} from "../lib/api";
import { formatDateTime } from "../lib/format";

function safeExternalUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(String(value), window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return null;
  }

  return null;
}

function formatSourceLabel(value) {
  if (!value) {
    return "Configured live source";
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}

function getSourceDescriptor(key, sourceLabels) {
  const explicit = sourceLabels?.[key];
  if (explicit) {
    return formatSourceLabel(explicit);
  }

  const fallbackMap = {
    google_news: sourceLabels?.news,
    reddit_social: sourceLabels?.social,
    economic_calendar: sourceLabels?.calendar,
    earnings_calendar: sourceLabels?.calendar,
  };

  return formatSourceLabel(fallbackMap[key] || "Configured live source");
}

function renderList(items, emptyLabel) {
  if (!items?.length) {
    return <p className="briefing-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="briefing-list">
      {items.map((item, index) => (
        <li key={`${String(item)}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function getFreshnessLabel(generatedAt) {
  if (!generatedAt) {
    return "Saved";
  }

  const parsed = Date.parse(generatedAt);
  if (Number.isNaN(parsed)) {
    return "Saved";
  }

  const ageMinutes = (Date.now() - parsed) / 60000;
  if (ageMinutes <= 90) {
    return "Fresh";
  }

  return "Stale";
}

function getPartialState(response) {
  const warnings = response?.warnings || response?.snapshot?._meta?.warnings || [];
  const sourceHealth = response?.source_health || {};
  return warnings.length > 0 || Object.values(sourceHealth).some((value) => value.status === "degraded");
}

function getBiasTone(value) {
  if (typeof value !== "number") {
    return "neutral";
  }
  if (value >= 2) {
    return "positive";
  }
  if (value <= -2) {
    return "warning";
  }
  return "neutral";
}

function buildRequestPayload(options) {
  return {
    market: "us-index-futures",
    local_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    include_snapshot: true,
    include_social: options.includeSocial,
    include_charts: options.includeCharts,
  };
}

function StatusBadge({ label, tone = "neutral" }) {
  return <span className={`briefing-status-badge ${tone}`}>{label}</span>;
}

function StatCard({ label, value, tone = "neutral" }) {
  return (
    <article className={`briefing-hero-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value ?? "n/a"}</strong>
    </article>
  );
}

function SectionCard({ eyebrow, title, aside, children, className = "" }) {
  return (
    <section className={`briefing-section-card ${className}`.trim()}>
      <header className="briefing-section-head">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h3>{title}</h3>
        </div>
        {aside}
      </header>
      <div className="briefing-section-body">{children}</div>
    </section>
  );
}

function NewsItemCard({ item }) {
  const storyUrl = safeExternalUrl(item.link);

  return (
    <article className="briefing-story-card">
      <div className="briefing-story-meta">
        <span>{item.category?.replaceAll("_", " ") || "market"}</span>
        <span>{item.source || "Live feed"}</span>
        <span>{item.published_at ? formatDateTime(item.published_at) : "Live"}</span>
      </div>
      <h4>
        {storyUrl ? (
          <a href={storyUrl} rel="noopener noreferrer" target="_blank">
            {item.headline || item.title}
          </a>
        ) : (
          item.headline || item.title
        )}
      </h4>
      <div className="briefing-chip-row">
        <span className="briefing-chip">{item.sentiment || "neutral"}</span>
        <span className="briefing-chip">{item.impact || "low"} impact</span>
      </div>
      {item.summary ? <p>{item.summary}</p> : null}
      {item.reasoning ? <p className="briefing-story-reasoning">{item.reasoning}</p> : null}
      {item.channel_impacts?.length ? (
        <div className="briefing-chip-row">
          {item.channel_impacts.map((impact, index) => {
            const direction =
              impact.direction === "up" ? "up" : impact.direction === "down" ? "down" : "flat";

            return (
              <span key={`${impact.channel}-${index}`} className={`briefing-chip ${direction}`}>
                {impact.channel} {direction}
              </span>
            );
          })}
        </div>
      ) : null}
      {item.bias_scores ? (
        <dl className="briefing-score-list">
          <div>
            <dt>Gold</dt>
            <dd>{item.bias_scores.gold}</dd>
          </div>
          <div>
            <dt>NQ</dt>
            <dd>{item.bias_scores.nq}</dd>
          </div>
          <div>
            <dt>MES</dt>
            <dd>{item.bias_scores.mes}</dd>
          </div>
          <div>
            <dt>Bitcoin</dt>
            <dd>{item.bias_scores.bitcoin}</dd>
          </div>
        </dl>
      ) : null}
    </article>
  );
}

function BiasTable({ biasTable }) {
  if (!biasTable?.rows?.length) {
    return <p className="briefing-muted">No cross-asset bias table returned.</p>;
  }

  return (
    <div className="briefing-table-scroll">
      <table className="briefing-bias-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Gold</th>
            <th>NQ</th>
            <th>MES</th>
            <th>Bitcoin</th>
          </tr>
        </thead>
        <tbody>
          {biasTable.rows.map((row) => (
            <tr key={row.category}>
              <td>{row.category}</td>
              <td>{row.gold}</td>
              <td>{row.nq}</td>
              <td>{row.mes}</td>
              <td>{row.bitcoin}</td>
            </tr>
          ))}
          <tr className="briefing-bias-average">
            <td>Average bias</td>
            <td>{biasTable.averages.gold}/10</td>
            <td>{biasTable.averages.nq}/10</td>
            <td>{biasTable.averages.mes}/10</td>
            <td>{biasTable.averages.bitcoin}/10</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CrossAssetSection({ briefing }) {
  const dashboardItems = briefing?.dashboard || [];

  return (
    <SectionCard
      eyebrow="Cross-asset"
      title="Cross-asset pulse"
      aside={
        dashboardItems.length ? <StatusBadge label={`${dashboardItems.length} tracked symbols`} tone="neutral" /> : null
      }
    >
      {dashboardItems.length ? (
        <div className="briefing-cross-asset-strip" role="list" aria-label="Cross-asset tracked symbols">
          {dashboardItems.map((item) => (
            <article key={item.index} className="briefing-cross-asset-card" role="listitem">
              <div className="briefing-cross-asset-topline">
                <span>{item.index}</span>
                <StatusBadge label={`${item.avg_bias}/10`} tone={getBiasTone(item.avg_bias)} />
              </div>
              <p>{item.notes}</p>
              <div className="briefing-chip-row">
                {(item.key_drivers || []).slice(0, 3).map((driver, index) => (
                  <span key={`${item.index}-${index}`} className="briefing-chip">
                    {driver}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="briefing-muted">No cross-asset dashboard returned.</p>
      )}

      <BiasTable biasTable={briefing?.bias_table} />
    </SectionCard>
  );
}

function ChartSection({ charts, isPersistedView }) {
  const symbols = Object.keys(charts || {});
  const [activeSymbol, setActiveSymbol] = useState(symbols[0] || "");

  useEffect(() => {
    if (!symbols.length) {
      setActiveSymbol("");
      return;
    }

    if (!symbols.includes(activeSymbol)) {
      setActiveSymbol(symbols[0]);
    }
  }, [activeSymbol, symbols]);

  return (
    <SectionCard
      eyebrow="Visual context"
      title="Chart pack"
      aside={
        symbols.length ? (
          <div className="briefing-badge-row">
            <StatusBadge label={`${symbols.length} symbols`} tone="neutral" />
            <StatusBadge label="live only" tone="neutral" />
          </div>
        ) : null
      }
    >
      {symbols.length ? (
        <>
          <div className="briefing-tab-row">
            {symbols.map((symbol) => (
              <button
                key={symbol}
                className={`briefing-tab ${symbol === activeSymbol ? "active" : ""}`}
                onClick={() => setActiveSymbol(symbol)}
                type="button"
              >
                {symbol}
              </button>
            ))}
          </div>
          <div className="briefing-chart-grid">
            {(charts[activeSymbol] || []).map((chart) => (
              <article key={`${activeSymbol}-${chart.timeframe}`} className="briefing-chart-card">
                <header>
                  <span>{activeSymbol}</span>
                  <strong>{chart.title}</strong>
                </header>
                <img
                  alt={`${activeSymbol} ${chart.title} chart`}
                  src={`data:image/png;base64,${chart.image_base64}`}
                />
                <div className="briefing-chip-row">
                  {(chart.levels || []).map((level) => (
                    <span key={`${level.label}-${level.price}`} className="briefing-chip">
                      {level.label}: {level.price}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="briefing-muted">
          {isPersistedView
            ? "Charts are generated on refresh and are not stored with the saved current briefing."
            : "No chart images returned."}
        </p>
      )}
    </SectionCard>
  );
}

function SourceHealthSection({ response }) {
  const sourceHealth = response?.source_health || {};
  const sourceLabels = response?.snapshot?._meta?.sources || {};
  const warnings = response?.warnings || response?.snapshot?._meta?.warnings || [];
  const sourceEntries = Object.entries(sourceHealth);
  const okCount = sourceEntries.filter(([, value]) => value.status === "ok").length;
  const degradedCount = sourceEntries.filter(([, value]) => value.status === "degraded").length;
  const disabledCount = sourceEntries.filter(([, value]) => value.status === "disabled").length;

  return (
    <SectionCard
      eyebrow="Transparency"
      title="Source health and coverage"
      aside={<StatusBadge label={`${sourceEntries.length || 0} tracked sources`} tone="neutral" />}
    >
      <div className="briefing-source-summary">
        <StatCard label="Healthy" tone="positive" value={okCount} />
        <StatCard label="Partial" tone="warning" value={degradedCount} />
        <StatCard label="Disabled" tone="neutral" value={disabledCount} />
        <StatCard label="Warnings" tone={warnings.length ? "warning" : "neutral"} value={warnings.length} />
      </div>

      <div className="briefing-health-grid">
        {sourceEntries.length ? (
          sourceEntries.map(([key, value]) => (
            <article key={key} className="briefing-health-card">
              <div className="briefing-health-head">
                <strong>{key.replaceAll("_", " ")}</strong>
                <StatusBadge
                  label={value.status}
                  tone={
                    value.status === "ok" ? "positive" : value.status === "degraded" ? "warning" : "neutral"
                  }
                />
              </div>
              <p>{getSourceDescriptor(key, sourceLabels)}</p>
              {value.warnings?.length ? renderList(value.warnings, "No warnings.") : null}
            </article>
          ))
        ) : (
          <p className="briefing-muted">No source-health details returned.</p>
        )}
      </div>

      <div className="briefing-source-map-grid">
        {Object.entries(sourceLabels).map(([key, value]) => (
          <article key={key} className="briefing-source-map-card">
            <span>{key.replaceAll("_", " ")}</span>
            <strong>{formatSourceLabel(value)}</strong>
          </article>
        ))}
      </div>

      <div className="briefing-warning-strip">
        <strong>Coverage notes</strong>
        {renderList(warnings, "No source warnings returned.")}
      </div>
    </SectionCard>
  );
}

function EmptyState({ error }) {
  return (
    <section className="briefing-empty-state glass-panel">
      <p className="eyebrow">Current briefing</p>
      <h3>No saved briefing yet</h3>
      <p>
        Generate a market briefing once and it will stay here as your current saved view until you replace it with a
        newer one.
      </p>
      {error ? <div className="alert error-alert">{error}</div> : null}
    </section>
  );
}

export function MarketBriefingPage() {
  const { token } = useAuth();
  const [briefingResponse, setBriefingResponse] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [pageNotice, setPageNotice] = useState("");
  const [viewState, setViewState] = useState("empty");
  const [options, setOptions] = useState({
    includeSocial: true,
    includeCharts: false,
  });

  const chartingAvailable = capabilities?.options?.include_charts !== false;

  useEffect(() => {
    let isActive = true;

    async function loadWorkspace() {
      setIsBootstrapping(true);
      setError("");
      setPageNotice("");

      const [capabilitiesResult, currentResult] = await Promise.allSettled([
        fetchPreSessionBriefingCapabilities(token),
        fetchCurrentPreSessionBriefing(token),
      ]);

      if (!isActive) {
        return;
      }

      if (capabilitiesResult.status === "fulfilled") {
        setCapabilities(capabilitiesResult.value);
        setOptions((current) => ({
          ...current,
          includeCharts: capabilitiesResult.value?.options?.include_charts !== false,
        }));
      } else {
        setPageNotice(capabilitiesResult.reason.message);
      }

      if (currentResult.status === "fulfilled") {
        if (currentResult.value) {
          setBriefingResponse(currentResult.value);
          setViewState("saved");
        } else {
          setBriefingResponse(null);
          setViewState("empty");
        }
      } else {
        setError(currentResult.reason.message);
      }

      setIsBootstrapping(false);
    }

    void loadWorkspace();

    return () => {
      isActive = false;
    };
  }, [token]);

  async function handleGenerateBriefing() {
    setIsRefreshing(true);
    setError("");
    setPageNotice("");

    try {
      const response = await fetchPreSessionBriefing(token, buildRequestPayload(options));
      setBriefingResponse(response);
      setViewState("fresh");
    } catch (requestError) {
      if (briefingResponse) {
        setViewState("refresh-failed");
        setPageNotice(`Refresh failed. Showing the last saved briefing. ${requestError.message}`);
      } else {
        setError(requestError.message);
      }
    } finally {
      setIsRefreshing(false);
    }
  }

  if (isBootstrapping) {
    return <LoadingView label="Loading market briefing workspace..." />;
  }

  const briefing = briefingResponse?.briefing;
  const snapshot = briefingResponse?.snapshot;
  const charts = briefingResponse?.charts || {};
  const warnings = briefingResponse?.warnings || snapshot?._meta?.warnings || [];
  const hasPartialData = getPartialState(briefingResponse);
  const hasCharts = Object.keys(charts).length > 0;
  const freshnessLabel = briefing ? getFreshnessLabel(briefingResponse.generated_at) : null;
  const statusBadges = [];

  if (briefing) {
    statusBadges.push({
      label:
        viewState === "fresh"
          ? "Fresh result"
          : viewState === "saved" || viewState === "refresh-failed"
            ? "Saved current"
            : freshnessLabel,
      tone:
        viewState === "fresh"
          ? "positive"
          : freshnessLabel === "Stale" && viewState !== "refresh-failed"
            ? "warning"
            : "neutral",
    });
    if (viewState === "refresh-failed") {
      statusBadges.push({ label: "Refresh failed", tone: "warning" });
    }
    if (hasPartialData) {
      statusBadges.push({ label: "Partial sources", tone: "warning" });
    }
  }

  return (
    <div className="workspace-page briefing-page">
      <section className="briefing-hero glass-panel">
        <div className="briefing-hero-copy">
          <div className="briefing-hero-topline">
            <p className="eyebrow">Market Briefing</p>
            <div className="briefing-badge-row">
              {statusBadges.map((badge) => (
                <StatusBadge key={badge.label} label={badge.label} tone={badge.tone} />
              ))}
            </div>
          </div>
          <h2>Pre-session briefing desk</h2>
          <p className="briefing-hero-summary">
            Keep one current market briefing saved for this user, refresh it when conditions change, and keep the last
            good read visible if live sources wobble.
          </p>
          <dl className="briefing-meta-strip">
            <div>
              <dt>Generated</dt>
              <dd>{briefingResponse?.generated_at ? formatDateTime(briefingResponse.generated_at) : "Not generated yet"}</dd>
            </div>
            <div>
              <dt>Saved</dt>
              <dd>
                {briefingResponse?.storage?.saved_at
                  ? formatDateTime(briefingResponse.storage.saved_at)
                  : "Not saved yet"}
              </dd>
            </div>
            <div>
              <dt>Market</dt>
              <dd>{capabilities?.markets?.[0]?.label || "US index futures"}</dd>
            </div>
            <div>
              <dt>API</dt>
              <dd>{capabilities?.service?.api_version || "v1"}</dd>
            </div>
          </dl>
        </div>

        <aside className="briefing-hero-actions">
          <div className="briefing-toolbar">
            <Link to="/">
              <Button type="button" variant="secondary">
                Back to dashboard
              </Button>
            </Link>
            <Button disabled={isRefreshing} onClick={handleGenerateBriefing} type="button">
              {isRefreshing ? "Refreshing..." : briefing ? "Refresh briefing" : "Generate briefing"}
            </Button>
          </div>

          <div className="briefing-option-panel">
            <label className="briefing-toggle">
              <input
                checked={options.includeSocial}
                onChange={(event) =>
                  setOptions((current) => ({ ...current, includeSocial: event.target.checked }))
                }
                type="checkbox"
              />
              <span>Include Reddit social pulse</span>
            </label>
            <label className="briefing-toggle">
              <input
                disabled={!chartingAvailable}
                checked={options.includeCharts}
                onChange={(event) =>
                  setOptions((current) => ({ ...current, includeCharts: event.target.checked }))
                }
                type="checkbox"
              />
              <span>{chartingAvailable ? "Include chart images" : "Chart images unavailable in this environment"}</span>
            </label>
            <div className="briefing-capabilities">
              <strong>{capabilities?.service?.name || "pre-session-briefing"}</strong>
              <span>{capabilities?.service?.version ? `Version ${capabilities.service.version}` : null}</span>
            </div>
          </div>
        </aside>
      </section>

      {pageNotice ? <div className="alert warning-alert">{pageNotice}</div> : null}

      {briefing ? (
        <>
          <section className="briefing-summary-panel glass-panel">
            <div className="briefing-primary-grid">
              <StatCard label="Bias" tone="positive" value={briefing.directional_bias || briefing.session_bias} />
              <StatCard label="Confidence" value={briefing.confidence} />
              <StatCard label="Phase" value={briefing.session_phase} />
              <StatCard label="Regime" value={briefing.market_regime} />
              <StatCard
                label="Risk load"
                tone={(briefing.component_scores?.risk_load || 0) > 1 ? "warning" : "neutral"}
                value={briefing.component_scores?.risk_load ?? "n/a"}
              />
              <StatCard label="Composite" value={briefing.component_scores?.composite ?? "n/a"} />
            </div>

            <div className="briefing-signal-summary-grid">
              {Object.entries(briefing.component_summaries || {}).map(([key, value]) => (
                <article key={key} className="briefing-signal-card">
                  <span>{key}</span>
                  <p>{value}</p>
                </article>
              ))}
            </div>
          </section>

          <CrossAssetSection briefing={briefing} />

          <div className="briefing-decision-grid">
            <SectionCard eyebrow="Decision" title="Actionable read" className="briefing-emphasis-card">
              <p className="briefing-lead-copy">{briefing.trade_posture}</p>
              <p>{briefing.narrative}</p>
            </SectionCard>

            <SectionCard eyebrow="Tilt Guard" title="Advice and execution frame">
              <h4>Advice</h4>
              {renderList(briefing.tilt_guard_advice, "No advice returned.")}
              <h4>Best conditions</h4>
              {renderList(briefing.best_conditions, "No setup guidance returned.")}
              <h4>Avoid conditions</h4>
              {renderList(briefing.avoid_conditions, "No avoid conditions returned.")}
            </SectionCard>

            <SectionCard eyebrow="Counterpoints" title="Risk and caution">
              <h4>Red flags</h4>
              {renderList(briefing.red_flags, "No red flags returned.")}
              <h4>Watchlist themes</h4>
              {renderList(briefing.watchlist_themes, "No watchlist themes returned.")}
            </SectionCard>
          </div>

          <div className="briefing-drivers-grid">
            <SectionCard eyebrow="Drivers" title="Top drivers">
              {renderList(briefing.top_drivers, "No major drivers returned.")}
            </SectionCard>
            <SectionCard eyebrow="Events" title="Event windows and macro risk">
              {renderList(briefing.event_windows, "No immediate scheduled event windows.")}
            </SectionCard>
            <SectionCard eyebrow="Risk flags" title="Live risk flags">
              {snapshot?.risk_flags?.length ? (
                <div className="briefing-mini-card-grid">
                  {snapshot.risk_flags.map((flag, index) => (
                    <article key={`${flag.name}-${index}`} className="briefing-mini-card">
                      <div className="briefing-chip-row">
                        <StatusBadge label={flag.kind || "risk"} tone="neutral" />
                        <StatusBadge
                          label={flag.severity || "n/a"}
                          tone={flag.severity === "high" ? "warning" : "neutral"}
                        />
                      </div>
                      <strong>{flag.name}</strong>
                      {flag.starts_at ? <p>{formatDateTime(flag.starts_at)}</p> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="briefing-muted">No risk flags returned.</p>
              )}
            </SectionCard>
          </div>

          <div className="briefing-intelligence-grid">
            <SectionCard
              eyebrow="Context"
              title="Story breakdown and narrative drivers"
              aside={
                briefing.story_breakdown?.length ? (
                  <StatusBadge label={`${briefing.story_breakdown.length} stories`} tone="neutral" />
                ) : null
              }
            >
              {briefing.story_breakdown?.length ? (
                <div className="briefing-story-grid">
                  {briefing.story_breakdown.map((story, index) => (
                    <NewsItemCard key={`${story.title}-${index}`} item={story} />
                  ))}
                </div>
              ) : (
                <p className="briefing-muted">No story breakdown returned.</p>
              )}
            </SectionCard>

            <SectionCard
              eyebrow="Headlines"
              title="Headline news and fast alerts"
              aside={snapshot?.news?.length ? <StatusBadge label={`${snapshot.news.length} items`} tone="neutral" /> : null}
            >
              {snapshot?.news?.length ? (
                <div className="briefing-story-grid">
                  {snapshot.news.map((item, index) => (
                    <NewsItemCard key={`${item.headline}-${index}`} item={item} />
                  ))}
                </div>
              ) : (
                <p className="briefing-muted">No live news items returned.</p>
              )}
            </SectionCard>
          </div>

          <SourceHealthSection response={briefingResponse} />

          <div className="briefing-secondary-grid">
            <SectionCard eyebrow="Social" title="Live pulse and caution flags">
              {snapshot?.social ? (
                <>
                  <div className="briefing-chip-row">
                    <StatusBadge label={snapshot.social.enabled ? "enabled" : "disabled"} tone="neutral" />
                    <StatusBadge label={`sentiment ${snapshot.social.sentiment_score}`} tone="neutral" />
                  </div>
                  <h4>Summary points</h4>
                  {renderList(snapshot.social.summary_points, "No social summary points returned.")}
                  <h4>Caution flags</h4>
                  {renderList(snapshot.social.caution_flags, "No social caution flags returned.")}
                </>
              ) : (
                <p className="briefing-muted">No social snapshot returned.</p>
              )}
            </SectionCard>

            <SectionCard eyebrow="Persistence" title="Saved current briefing scope">
              <h4>Coverage notes</h4>
              {renderList(warnings, "No warning notes returned.")}
              <h4>What is saved</h4>
              <p className="briefing-muted">
                The current saved briefing keeps the summary, cross-asset context, source health, and narrative data.
                Chart images are generated live and are not stored with the saved briefing.
              </p>
            </SectionCard>
          </div>

          {hasCharts || chartingAvailable ? (
            <ChartSection charts={charts} isPersistedView={!hasCharts && viewState !== "fresh"} />
          ) : null}
        </>
      ) : (
        <EmptyState error={error} />
      )}
    </div>
  );
}
