export function Button({ children, className = "", variant = "primary", ...props }) {
  return (
    <button {...props} className={`button button-${variant} ${className}`.trim()}>
      {children}
    </button>
  );
}
