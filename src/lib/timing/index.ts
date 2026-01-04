/**
 * Adaptive Time Estimation System
 *
 * Estimates computation time for DR methods based on:
 * - Number of samples (n)
 * - Fingerprint dimension (d) - fixed at 2048 for Morgan FP
 * - Method-specific parameters (perplexity, iterations, n_neighbors, epochs)
 *
 * Uses exponential moving average to adapt coefficients based on actual performance.
 */

import type { DimensionalityMethod, TSNEParams, UMAPParams } from '../../types';

// Storage key for persisted coefficients
const STORAGE_KEY = 'chemplot-timing-coefficients';
// Version for auto-reset when formula changes
const COEFFICIENTS_VERSION = 2;

// Default coefficients derived from benchmarks
// These will be updated as the app runs and collects real timing data
export interface TimingCoefficients {
  // PCA: time_ms = a * n + b
  pca: {
    a: number; // per-sample coefficient
    b: number; // base overhead
  };
  // t-SNE: time_ms = a * n^2 * iterations / 1e6 + b * n + c
  tsne: {
    a: number; // quadratic coefficient (neighbor search)
    b: number; // linear coefficient (gradient updates)
    c: number; // base overhead
  };
  // UMAP: time_ms = a * n * log(n) * epochs / 1e4 + b * n * n_neighbors / 1e3 + c
  umap: {
    a: number; // epoch iteration coefficient
    b: number; // neighbor graph coefficient
    c: number; // base overhead
  };
  // Fingerprint computation: time_ms = a * n + b * avg_atoms + c
  fingerprint: {
    a: number; // per-molecule base
    b: number; // per-atom coefficient (from SMILES length proxy)
    c: number; // overhead
  };
  // Metadata
  sampleCount: number; // How many measurements contributed to these coefficients
  lastUpdated: number; // Timestamp
  version?: number;    // For auto-reset when formula changes
}

// Default coefficients based on empirical estimates for browser JS implementations
// These are calibrated for:
// - tsne-js library (Barnes-Hut approximation)
// - umap-js library
// - ml-pca library
// - Morgan fingerprints 2048 bits via RDKit.js
//
// Complexity:
// - PCA: O(n * d²) but d=2048 is fixed, so effectively O(n)
// - t-SNE: O(n²) for neighbor search, expensive in JS
// - UMAP: O(n * log(n) * epochs) for neighbor graph + optimization
//
// Empirical estimates (M1 Mac, Chrome, Web Worker):
// | Method | n=100  | n=500  | n=1000 | n=2000 | n=6000 |
// |--------|--------|--------|--------|--------|--------|
// | PCA    | ~50ms  | ~100ms | ~200ms | ~400ms | ~1.2s  |
// | t-SNE  | ~3s    | ~30s   | ~120s  | ~8min  | ~1hr   |
// | UMAP   | ~2s    | ~8s    | ~20s   | ~60s   | ~5min  |
//
// Note: Coefficients auto-adapt during usage via recordTiming()
export const DEFAULT_COEFFICIENTS: TimingCoefficients = {
  pca: {
    a: 0.15,   // ~150ms for 1000 samples
    b: 50,     // 50ms base overhead (worker startup)
  },
  tsne: {
    // time = a * n² * iterations / 1e6 + b * n + c
    // For n=1000, iter=1000: should be ~120s (2 minutes)
    // 120000 = a * 1e9 / 1e6 + b * 1000 + c = 1000a + 1000b + c
    // With a=100, b=15, c=5000: 100000 + 15000 + 5000 = 120000
    a: 100,    // Quadratic scaling (n² * iter / 1e6)
    b: 15,     // Linear term (per-sample overhead)
    c: 5000,   // Base overhead (worker startup, tree construction)
  },
  umap: {
    // time = a * n * log(n) * epochs / 1e4 + b * n * neighbors / 1e3 + c
    // For n=1000, epochs=500, neighbors=15:
    // a * 1000 * 10 * 500 / 1e4 + b * 1000 * 15 / 1e3 + c = 500a + 15b + c
    // Target ~20s = 20000ms: 500a + 15b + c = 20000
    // For n=6000, epochs=500, neighbors=15:
    // a * 6000 * 12.55 * 500 / 1e4 + b * 6000 * 15 / 1e3 + c = 3765a + 90b + c
    // Target ~5min = 300000ms
    // Let a=35, b=200, c=2000:
    // n=1000: 17500 + 3000 + 2000 = 22500ms ≈ 22s ✓
    // n=6000: 131775 + 18000 + 2000 = 151775ms ≈ 2.5min (conservative)
    a: 35,     // Epoch iteration coefficient
    b: 200,    // Neighbor graph coefficient (expensive!)
    c: 2000,   // Base overhead
  },
  fingerprint: {
    // RDKit.js Morgan fingerprint: ~3-8ms per molecule
    a: 5,      // 5ms per molecule base
    b: 0.05,   // Factor for SMILES complexity
    c: 500,    // RDKit WASM initialization overhead
  },
  sampleCount: 0,
  lastUpdated: 0,
  version: COEFFICIENTS_VERSION,
};

// EMA smoothing factor (0.1 = slow adaptation, 0.3 = faster)
const EMA_ALPHA = 0.2;

/**
 * Load coefficients from localStorage or return defaults
 * Auto-resets if version is outdated
 */
export function loadCoefficients(): TimingCoefficients {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as TimingCoefficients;
      // Validate structure and version
      if (parsed.pca && parsed.tsne && parsed.umap && parsed.fingerprint) {
        // Check version - reset if outdated
        if (parsed.version !== COEFFICIENTS_VERSION) {
          console.log('⏱️ Timing coefficients version changed, resetting to new defaults');
          const defaults = { ...DEFAULT_COEFFICIENTS };
          saveCoefficients(defaults);
          return defaults;
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load timing coefficients:', e);
  }
  return { ...DEFAULT_COEFFICIENTS };
}

/**
 * Save coefficients to localStorage
 */
export function saveCoefficients(coefficients: TimingCoefficients): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(coefficients));
  } catch (e) {
    console.warn('Failed to save timing coefficients:', e);
  }
}

/**
 * Reset coefficients to defaults
 */
export function resetCoefficients(): TimingCoefficients {
  const defaults = { ...DEFAULT_COEFFICIENTS, lastUpdated: Date.now() };
  saveCoefficients(defaults);
  return defaults;
}

/**
 * Estimate time for fingerprint computation
 */
export function estimateFingerprintTime(
  nMolecules: number,
  avgSmilesLength: number = 50,
  coefficients?: TimingCoefficients
): number {
  const c = coefficients || loadCoefficients();
  const time = c.fingerprint.a * nMolecules +
               c.fingerprint.b * nMolecules * avgSmilesLength +
               c.fingerprint.c;
  return Math.max(0, time);
}

/**
 * Estimate time for PCA
 */
export function estimatePCATime(
  nSamples: number,
  coefficients?: TimingCoefficients
): number {
  const c = coefficients || loadCoefficients();
  const time = c.pca.a * nSamples + c.pca.b;
  return Math.max(0, time);
}

/**
 * Estimate time for t-SNE
 */
export function estimateTSNETime(
  nSamples: number,
  params: TSNEParams,
  coefficients?: TimingCoefficients
): number {
  const c = coefficients || loadCoefficients();
  const { iterations } = params;

  // t-SNE has O(n²) complexity for exact algorithm
  // tsne-js uses Barnes-Hut approximation which is O(n log n) but still expensive
  const time = c.tsne.a * (nSamples * nSamples * iterations) / 1e6 +
               c.tsne.b * nSamples +
               c.tsne.c;

  return Math.max(0, time);
}

/**
 * Estimate time for UMAP
 */
export function estimateUMAPTime(
  nSamples: number,
  params: UMAPParams,
  coefficients?: TimingCoefficients
): number {
  const c = coefficients || loadCoefficients();
  const { nNeighbors, nEpochs } = params;

  // UMAP: neighbor graph construction + epoch iterations
  const logN = Math.log2(Math.max(2, nSamples));
  const time = c.umap.a * (nSamples * logN * nEpochs) / 1e4 +
               c.umap.b * (nSamples * nNeighbors) / 1e3 +
               c.umap.c;

  return Math.max(0, time);
}

/**
 * Estimate total DR time for any method
 */
export function estimateDRTime(
  nSamples: number,
  method: DimensionalityMethod,
  params: { tsne: TSNEParams; umap: UMAPParams },
  coefficients?: TimingCoefficients
): number {
  switch (method) {
    case 'pca':
      return estimatePCATime(nSamples, coefficients);
    case 'tsne':
      return estimateTSNETime(nSamples, params.tsne, coefficients);
    case 'umap':
      return estimateUMAPTime(nSamples, params.umap, coefficients);
    default:
      return 0;
  }
}

/**
 * Format time estimate for display
 */
export function formatTimeEstimate(ms: number): string {
  if (ms < 1000) {
    return '< 1s';
  } else if (ms < 60000) {
    const seconds = Math.round(ms / 1000);
    return `~${seconds}s`;
  } else if (ms < 3600000) {
    const minutes = Math.round(ms / 60000);
    return `~${minutes}m`;
  } else {
    const hours = (ms / 3600000).toFixed(1);
    return `~${hours}h`;
  }
}

/**
 * Get human-readable time range
 */
export function formatTimeRange(ms: number): string {
  // Add ±30% uncertainty
  const low = ms * 0.7;
  const high = ms * 1.3;

  if (high < 1000) {
    return '< 1 sec';
  } else if (high < 10000) {
    return `${Math.round(low / 1000)}-${Math.round(high / 1000)} sec`;
  } else if (high < 60000) {
    return `${Math.round(low / 1000)}-${Math.round(high / 1000)} sec`;
  } else if (high < 600000) {
    return `${(low / 60000).toFixed(1)}-${(high / 60000).toFixed(1)} min`;
  } else {
    return `${Math.round(low / 60000)}-${Math.round(high / 60000)} min`;
  }
}

/**
 * Measurement result for updating coefficients
 */
export interface TimingMeasurement {
  method: 'pca' | 'tsne' | 'umap' | 'fingerprint';
  nSamples: number;
  actualTimeMs: number;
  // Method-specific params
  params?: {
    iterations?: number;
    nNeighbors?: number;
    nEpochs?: number;
    avgSmilesLength?: number;
  };
}

/**
 * Update coefficients based on actual measurement using EMA
 */
export function updateCoefficients(
  measurement: TimingMeasurement,
  coefficients?: TimingCoefficients
): TimingCoefficients {
  const c = coefficients ? { ...coefficients } : loadCoefficients();
  const { method, nSamples, actualTimeMs, params } = measurement;

  // Skip if sample is too small or time is negative
  if (nSamples < 50 || actualTimeMs < 10) {
    return c;
  }

  const alpha = EMA_ALPHA;

  switch (method) {
    case 'pca': {
      // Estimate what 'a' should be: (actualTime - b) / n
      const estimatedA = (actualTimeMs - c.pca.b) / nSamples;
      c.pca.a = c.pca.a * (1 - alpha) + estimatedA * alpha;
      break;
    }

    case 'tsne': {
      const iterations = params?.iterations || 1000;
      // Estimate 'a' from quadratic term
      const n2iter = (nSamples * nSamples * iterations) / 1e6;
      const residual = actualTimeMs - c.tsne.b * nSamples - c.tsne.c;
      const estimatedA = residual / Math.max(1, n2iter);
      c.tsne.a = Math.max(0.1, c.tsne.a * (1 - alpha) + estimatedA * alpha);
      break;
    }

    case 'umap': {
      const nNeighbors = params?.nNeighbors || 15;
      const nEpochs = params?.nEpochs || 200;
      const logN = Math.log2(Math.max(2, nSamples));

      // Estimate 'a' from epoch term
      const epochTerm = (nSamples * logN * nEpochs) / 1e4;
      const neighborTerm = (nSamples * nNeighbors) / 1e3;
      const residual = actualTimeMs - c.umap.b * neighborTerm - c.umap.c;
      const estimatedA = residual / Math.max(1, epochTerm);
      c.umap.a = Math.max(0.1, c.umap.a * (1 - alpha) + estimatedA * alpha);
      break;
    }

    case 'fingerprint': {
      const avgLen = params?.avgSmilesLength || 50;
      // Estimate 'a' from per-molecule term
      const residual = actualTimeMs - c.fingerprint.b * nSamples * avgLen - c.fingerprint.c;
      const estimatedA = residual / nSamples;
      c.fingerprint.a = Math.max(0.5, c.fingerprint.a * (1 - alpha) + estimatedA * alpha);
      break;
    }
  }

  c.sampleCount++;
  c.lastUpdated = Date.now();

  saveCoefficients(c);
  return c;
}

/**
 * Get confidence level based on sample count
 */
export function getConfidenceLevel(coefficients?: TimingCoefficients): 'low' | 'medium' | 'high' {
  const c = coefficients || loadCoefficients();
  if (c.sampleCount < 3) return 'low';
  if (c.sampleCount < 10) return 'medium';
  return 'high';
}

/**
 * Export for testing/debugging
 */
export function getStoredCoefficients(): TimingCoefficients {
  return loadCoefficients();
}
