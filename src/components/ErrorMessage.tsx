import { useAppStore } from '../store/useAppStore';

export function ErrorMessage() {
  const { error, setError } = useAppStore();

  if (!error) return null;

  return (
    <div className="error-toast">
      <svg
        className="error-toast-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
      <div className="error-toast-content">
        <p className="error-toast-title">Error</p>
        <p className="error-toast-message">{error}</p>
      </div>
      <button
        onClick={() => setError(null)}
        className="error-toast-close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
