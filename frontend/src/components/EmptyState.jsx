export function EmptyState({ title, description, action }) {
  return (
    <div className="empty-state glass-panel">
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
