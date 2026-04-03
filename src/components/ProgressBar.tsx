import { useEffect, useRef, useState, useCallback } from 'react';
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
  const { isLoading, progress, progressMessage, cancelOperation } = useAppStore();
  const startTimeRef = useRef<number | null>(null);
  const lastProgressRef = useRef<number>(0);
  const lastProgressTimeRef = useRef<number | null>(null);
  const smoothedRateRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [estimated, setEstimated] = useState<number | null>(null);

  // Track start time and update elapsed/estimated
  useEffect(() => {
    if (!isLoading) {
      // Reset when loading stops
      startTimeRef.current = null;
      lastProgressRef.current = 0;
      lastProgressTimeRef.current = null;
      smoothedRateRef.current = null;
      setElapsed(0);
      setEstimated(null);
      return;
    }

    const now = Date.now();
    if (startTimeRef.current === null) {
      startTimeRef.current = now;
    }
    if (lastProgressTimeRef.current === null) {
      lastProgressTimeRef.current = now;
      lastProgressRef.current = progress;
    }

    if (progress > lastProgressRef.current && lastProgressTimeRef.current !== null) {
      const deltaProgress = progress - lastProgressRef.current;
      const deltaSeconds = Math.max(0.001, (now - lastProgressTimeRef.current) / 1000);
      const instantaneousRate = deltaProgress / deltaSeconds;
      smoothedRateRef.current =
        smoothedRateRef.current === null
          ? instantaneousRate
          : smoothedRateRef.current * 0.7 + instantaneousRate * 0.3;
      lastProgressRef.current = progress;
      lastProgressTimeRef.current = now;
    }

    const interval = setInterval(() => {
      if (!startTimeRef.current) return;
      const elapsedMs = Date.now() - startTimeRef.current;
      const elapsedSec = elapsedMs / 1000;
      setElapsed(elapsedSec);

      // Only show ETA when we have a meaningful rate estimate.
      const rate = smoothedRateRef.current;
      if (rate && progress > 0 && progress < 100) {
        const remaining = (100 - progress) / rate;
        setEstimated(Math.max(0, remaining));
      } else {
        setEstimated(null);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isLoading, progress]);

  const handleCancel = useCallback(() => {
    cancelOperation();
  }, [cancelOperation]);

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
        <button
          className="progress-cancel-btn"
          onClick={handleCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
