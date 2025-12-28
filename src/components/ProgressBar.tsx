import { useAppStore } from '../store/useAppStore';

export function ProgressBar() {
  const { isLoading, progress, progressMessage } = useAppStore();

  if (!isLoading) return null;

  return (
    <div className="progress-overlay">
      <div className="progress-content">
        <div className="progress-spinner" />
        <p className="progress-text">{progressMessage}</p>
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="progress-percent">{Math.round(progress)}%</p>
      </div>
    </div>
  );
}
