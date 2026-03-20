export function LoadingView({ label }) {
  return (
    <div className="center-stage">
      <div className="glass-panel loading-card">
        <div className="loading-spinner" />
        <p>{label}</p>
      </div>
    </div>
  );
}
