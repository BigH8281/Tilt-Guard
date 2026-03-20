import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { LoadingView } from "../components/LoadingView";
import { NewSessionModal } from "../components/NewSessionModal";
import { useAuth } from "../context/AuthContext";
import {
  createSession,
  fetchOpenSession,
  fetchPosition,
  fetchSessions,
  fetchTradeEvents,
  uploadScreenshot,
} from "../lib/api";
import { formatCurrency, formatDateTime } from "../lib/format";

function buildRow(session, trades) {
  return {
    ...session,
    tradeCount: trades.length,
    totalPnlGbp: trades.reduce((sum, trade) => sum + (trade.result_gbp ?? 0), 0),
    ruleBroken: [
      session.end_traded_my_time,
      session.end_traded_my_conditions,
      session.end_respected_my_exit,
    ].some((value) => value === false),
  };
}

function displaySessionField(value) {
  return value === "pending" ? "Setup pending" : value;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [openSession, setOpenSession] = useState(null);
  const [openSessionPosition, setOpenSessionPosition] = useState(0);
  const [openSessionTradeCount, setOpenSessionTradeCount] = useState(0);
  const [historicalSessions, setHistoricalSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");

  async function loadDashboard() {
    setIsLoading(true);
    setError("");

    try {
      const [currentOpenSession, sessions] = await Promise.all([
        fetchOpenSession(token),
        fetchSessions(token),
      ]);

      setOpenSession(currentOpenSession);

      const closedSessions = sessions.filter((session) => session.status === "closed");
      const rows = await Promise.all(
        closedSessions.map(async (session) => {
          const trades = await fetchTradeEvents(token, session.id);
          return buildRow(session, trades);
        }),
      );

      setHistoricalSessions(rows);

      if (currentOpenSession) {
        const [position, trades] = await Promise.all([
          fetchPosition(token, currentOpenSession.id),
          fetchTradeEvents(token, currentOpenSession.id),
        ]);
        setOpenSessionPosition(position.current_open_size);
        setOpenSessionTradeCount(trades.length);
      } else {
        setOpenSessionPosition(0);
        setOpenSessionTradeCount(0);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [token]);

  async function handleCreateSession(form, screenshot) {
    setIsSubmitting(true);
    setModalError("");

    try {
      const session = await createSession(token, form);
      if (screenshot) {
        await uploadScreenshot(token, session.id, "pre", screenshot);
      }

      setIsModalOpen(false);
      await loadDashboard();
      navigate(`/sessions/${session.id}`);
    } catch (submissionError) {
      setModalError(submissionError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <LoadingView label="Loading trading desk..." />;
  }

  return (
    <div className="workspace-page">
      <section className="workspace-header glass-panel compact-header">
        <div>
          <p className="eyebrow">Trading Journal</p>
          <h2>Operational board</h2>
        </div>
        <Button
          disabled={Boolean(openSession)}
          onClick={() => setIsModalOpen(true)}
          type="button"
        >
          {openSession ? "Session active" : "New session"}
        </Button>
      </section>

      {openSession ? (
        <section className="status-strip glass-panel">
          <div className="status-block">
            <span className="status-pill open">Open</span>
            <strong>{openSession.session_name}</strong>
            <span>{openSession.symbol}</span>
            <span>Session #{openSession.id}</span>
            <span>{formatDateTime(openSession.started_at)}</span>
          </div>
          <div className="status-block">
            <span>{displaySessionField(openSession.market_bias)}</span>
            <span>{displaySessionField(openSession.htf_condition)}</span>
            <span>{displaySessionField(openSession.expected_open_type)}</span>
            <span>{openSession.confidence > 0 ? `${openSession.confidence}/10` : "Confidence pending"}</span>
          </div>
          <div className="status-block status-metrics">
            <span>{openSessionTradeCount} trade events</span>
            <span>{openSessionPosition} open contracts</span>
            <Link to={`/sessions/${openSession.id}`}>
              <Button variant="secondary">Resume</Button>
            </Link>
          </div>
        </section>
      ) : null}

      {error ? <div className="alert error-alert">{error}</div> : null}

      <section className="table-shell glass-panel">
        <div className="table-shell-header">
          <div>
            <p className="eyebrow">History</p>
            <h3>Closed sessions</h3>
          </div>
          <span className="table-count">{historicalSessions.length} rows</span>
        </div>

        {historicalSessions.length ? (
          <div className="table-scroll">
            <table className="session-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Name</th>
                  <th>Symbol</th>
                  <th>Bias</th>
                  <th>HTF</th>
                  <th>Open type</th>
                  <th>Confidence</th>
                  <th>Trades</th>
                  <th>PnL</th>
                  <th>Rule break</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {historicalSessions.map((session) => (
                  <tr key={session.id}>
                    <td>{formatDateTime(session.started_at)}</td>
                    <td>{session.session_name}</td>
                    <td>{session.symbol}</td>
                    <td>{displaySessionField(session.market_bias)}</td>
                    <td>{displaySessionField(session.htf_condition)}</td>
                    <td>{displaySessionField(session.expected_open_type)}</td>
                    <td>{session.confidence > 0 ? `${session.confidence}/10` : "Pending"}</td>
                    <td>{session.tradeCount}</td>
                    <td className={session.totalPnlGbp >= 0 ? "profit-cell" : "loss-cell"}>
                      {formatCurrency(session.totalPnlGbp)}
                    </td>
                    <td>
                      <span className={`rule-indicator ${session.ruleBroken ? "broken" : "clean"}`}>
                        {session.ruleBroken ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${session.status}`}>{session.status}</span>
                    </td>
                    <td>
                      <Link to={`/sessions/${session.id}`}>
                        <Button variant="secondary">Review</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No closed sessions yet"
            description="Closed sessions will appear here in a compact log-style table."
          />
        )}
      </section>

      {isModalOpen ? (
        <NewSessionModal
          error={modalError}
          isSubmitting={isSubmitting}
          onClose={() => {
            if (!isSubmitting) {
              setIsModalOpen(false);
              setModalError("");
            }
          }}
          onSubmit={handleCreateSession}
        />
      ) : null}
    </div>
  );
}
