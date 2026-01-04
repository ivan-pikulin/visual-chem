/**
 * Benchmark utilities for timing calibration
 *
 * Note: Manual benchmarks are not needed since the app auto-calibrates
 * coefficients during normal usage via recordTiming() in dimensionality/index.ts
 *
 * The DEFAULT_COEFFICIENTS in index.ts are pre-calibrated based on:
 * - Empirical testing on M1 Mac, Chrome
 * - Algorithm complexity analysis
 * - Literature benchmarks for tsne-js and umap-js
 */

import type { TimingCoefficients } from './index';
import { DEFAULT_COEFFICIENTS, saveCoefficients, loadCoefficients } from './index';

export interface BenchmarkResult {
  method: 'pca' | 'tsne' | 'umap';
  nSamples: number;
  nDimensions: number;
  params: Record<string, number>;
  timeMs: number;
  timestamp: number;
}

/**
 * Reset coefficients to calibrated defaults
 */
export function resetToDefaults(): TimingCoefficients {
  const defaults = {
    ...DEFAULT_COEFFICIENTS,
    sampleCount: 0,
    lastUpdated: Date.now(),
  };
  saveCoefficients(defaults);
  return defaults;
}

/**
 * Get current calibration status
 */
export function getCalibrationStatus(): {
  coefficients: TimingCoefficients;
  isCalibrated: boolean;
  sampleCount: number;
  lastUpdated: Date | null;
} {
  const coefficients = loadCoefficients();
  return {
    coefficients,
    isCalibrated: coefficients.sampleCount > 0,
    sampleCount: coefficients.sampleCount,
    lastUpdated: coefficients.lastUpdated ? new Date(coefficients.lastUpdated) : null,
  };
}

/**
 * Print calibration report to console
 */
export function printCalibrationReport(): void {
  const status = getCalibrationStatus();
  const c = status.coefficients;

  console.group('📊 Timing Calibration Report');
  console.log('Calibrated:', status.isCalibrated ? 'Yes' : 'No (using defaults)');
  console.log('Sample count:', status.sampleCount);
  console.log('Last updated:', status.lastUpdated?.toLocaleString() || 'Never');

  console.group('PCA coefficients');
  console.log(`time = ${c.pca.a.toFixed(4)} × n + ${c.pca.b.toFixed(1)}`);
  console.log(`Example: n=1000 → ${(c.pca.a * 1000 + c.pca.b).toFixed(0)}ms`);
  console.groupEnd();

  console.group('t-SNE coefficients');
  console.log(`time = ${c.tsne.a.toFixed(4)} × n² × iter/1e6 + ${c.tsne.b.toFixed(4)} × n + ${c.tsne.c.toFixed(1)}`);
  const tsneExample = c.tsne.a * (1000 * 1000 * 1000) / 1e6 + c.tsne.b * 1000 + c.tsne.c;
  console.log(`Example: n=1000, iter=1000 → ${(tsneExample / 1000).toFixed(1)}s`);
  console.groupEnd();

  console.group('UMAP coefficients');
  console.log(`time = ${c.umap.a.toFixed(4)} × n×log(n)×epochs/1e4 + ${c.umap.b.toFixed(4)} × n×neighbors/1e3 + ${c.umap.c.toFixed(1)}`);
  const umapExample = c.umap.a * (1000 * 10 * 200) / 1e4 + c.umap.b * (1000 * 15) / 1e3 + c.umap.c;
  console.log(`Example: n=1000, epochs=200, neighbors=15 → ${(umapExample / 1000).toFixed(1)}s`);
  console.groupEnd();

  console.groupEnd();
}
