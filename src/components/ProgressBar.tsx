import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function ProgressBar() {
  const { isLoading, progress, progressMessage } = useAppStore();
  const startTimeRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [estimated, setEstimated] = useState<number | null>(null);

  // Track start time and update elapsed/estimated
  useEffect(() => {
    if (isLoading && progress > 0) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }

      const interval = setInterval(() => {
        if (startTimeRef.current) {
          const elapsedMs = Date.now() - startTimeRef.current;
          const elapsedSec = elapsedMs / 1000;
          setElapsed(elapsedSec);

          // Estimate remaining time based on progress
          if (progress > 5) {
            const rate = progress / elapsedSec; // percent per second
            const remaining = (100 - progress) / rate;
            setEstimated(remaining);
          }
        }
      }, 500);

      return () => clearInterval(interval);
    } else if (!isLoading) {
      // Reset when loading stops
      startTimeRef.current = null;
      setElapsed(0);
      setEstimated(null);
    }
  }, [isLoading, progress]);

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
        {elapsed > 0 && (
          <div className="progress-time">
            <span className="progress-elapsed">
              Elapsed: {formatTime(elapsed)}
            </span>
            {estimated !== null && estimated > 0 && (
              <span className="progress-remaining">
                Remaining: ~{formatTime(estimated)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
