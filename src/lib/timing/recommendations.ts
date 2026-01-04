/**
 * Smart Parameter Recommendations
 *
 * Provides data-driven recommendations for DR parameters based on:
 * - Dataset size (n)
 * - Desired balance between speed and quality
 * - Research-backed heuristics
 *
 * Sources:
 * - openTSNE documentation
 * - UMAP documentation
 * - "How to Use t-SNE Effectively" (Distill, 2016)
 * - scRNA-seq best practices
 */

import type { TSNEParams, UMAPParams } from '../../types';

export interface ParameterRange {
  min: number;
  max: number;
  recommended: number;
  description: string;
}

export interface ParameterRecommendation {
  value: number;
  range: ParameterRange;
  confidence: 'low' | 'medium' | 'high';
  warning?: string;
}

export type QualityPreset = 'fast' | 'balanced' | 'quality';

// ============================================
// t-SNE Recommendations
// ============================================

/**
 * Get recommended perplexity range for t-SNE
 *
 * Rules:
 * - Must be < n/3 (hard constraint from algorithm)
 * - General range: 5-50 for most cases
 * - For large datasets (>1000): use n * 0.01 (1% of samples)
 * - For small datasets (<100): use lower values (5-15)
 */
export function getPerplexityRecommendation(nSamples: number): ParameterRecommendation {
  const maxAllowed = Math.floor(nSamples / 3) - 1;

  let recommended: number;
  let min: number;
  let max: number;
  let description: string;
  let warning: string | undefined;

  if (nSamples < 50) {
    // Very small dataset
    recommended = Math.min(5, maxAllowed);
    min = 2;
    max = Math.min(15, maxAllowed);
    description = 'Small dataset: use low perplexity';
    warning = 'Very small dataset may produce unstable results';
  } else if (nSamples < 200) {
    // Small dataset
    recommended = Math.min(15, maxAllowed);
    min = 5;
    max = Math.min(30, maxAllowed);
    description = 'Good for preserving local structure';
  } else if (nSamples < 1000) {
    // Medium dataset
    recommended = Math.min(30, maxAllowed);
    min = 10;
    max = Math.min(50, maxAllowed);
    description = 'Default range, balances local and global structure';
  } else if (nSamples < 5000) {
    // Large dataset
    recommended = Math.min(Math.floor(nSamples * 0.03), maxAllowed, 100);
    min = 20;
    max = Math.min(Math.floor(nSamples * 0.05), maxAllowed, 150);
    description = 'Use ~3% of samples for large datasets';
  } else {
    // Very large dataset
    recommended = Math.min(Math.floor(nSamples * 0.01), maxAllowed, 200);
    min = 30;
    max = Math.min(Math.floor(nSamples * 0.02), maxAllowed, 500);
    description = 'Use ~1% for very large datasets to preserve global structure';
    warning = 'Large dataset: consider using UMAP for faster results';
  }

  return {
    value: recommended,
    range: { min, max, recommended, description },
    confidence: nSamples < 50 ? 'low' : nSamples < 500 ? 'medium' : 'high',
    warning,
  };
}

/**
 * Get recommended iterations for t-SNE
 */
export function getIterationsRecommendation(
  nSamples: number,
  preset: QualityPreset = 'balanced'
): ParameterRecommendation {
  const baseIterations = {
    fast: 250,
    balanced: 500,
    quality: 1000,
  };

  // Scale with dataset size for quality preset
  let recommended = baseIterations[preset];
  if (preset === 'quality' && nSamples > 500) {
    recommended = Math.min(2000, 500 + nSamples);
  }

  return {
    value: recommended,
    range: {
      min: 250,
      max: 2000,
      recommended,
      description: preset === 'fast'
        ? 'Minimum for quick preview'
        : preset === 'quality'
        ? 'Maximum for publication-quality'
        : 'Good balance of speed and quality',
    },
    confidence: 'high',
  };
}

/**
 * Get recommended learning rate for t-SNE
 */
export function getLearningRateRecommendation(nSamples: number): ParameterRecommendation {
  // Default is usually good, but scale for very large datasets
  let recommended = 200;
  let description = 'Default value works well for most cases';

  if (nSamples > 5000) {
    recommended = Math.min(1000, Math.max(200, nSamples / 12));
    description = 'Increased for large dataset to speed up convergence';
  }

  return {
    value: recommended,
    range: {
      min: 10,
      max: 1000,
      recommended,
      description,
    },
    confidence: 'high',
  };
}

/**
 * Get all t-SNE recommendations
 */
export function getTSNERecommendations(
  nSamples: number,
  preset: QualityPreset = 'balanced'
): {
  perplexity: ParameterRecommendation;
  iterations: ParameterRecommendation;
  learningRate: ParameterRecommendation;
  params: TSNEParams;
} {
  const perplexity = getPerplexityRecommendation(nSamples);
  const iterations = getIterationsRecommendation(nSamples, preset);
  const learningRate = getLearningRateRecommendation(nSamples);

  return {
    perplexity,
    iterations,
    learningRate,
    params: {
      perplexity: perplexity.value,
      iterations: iterations.value,
      learningRate: learningRate.value,
    },
  };
}

// ============================================
// UMAP Recommendations
// ============================================

/**
 * Get recommended n_neighbors for UMAP
 *
 * Rules:
 * - Default: 15
 * - Low values (2-10): focus on local structure
 * - High values (50-200): focus on global structure
 * - Rule of thumb: sqrt(n) works well
 */
export function getNNeighborsRecommendation(nSamples: number): ParameterRecommendation {
  const sqrtN = Math.sqrt(nSamples);

  let recommended: number;
  let min: number;
  let max: number;
  let description: string;

  if (nSamples < 50) {
    recommended = Math.min(5, nSamples - 1);
    min = 2;
    max = Math.min(15, nSamples - 1);
    description = 'Small dataset: use fewer neighbors';
  } else if (nSamples < 500) {
    recommended = Math.min(15, Math.floor(sqrtN * 1.5));
    min = 5;
    max = Math.min(50, Math.floor(sqrtN * 3));
    description = 'Default range for medium datasets';
  } else if (nSamples < 5000) {
    recommended = Math.min(30, Math.floor(sqrtN));
    min = 10;
    max = Math.min(100, Math.floor(sqrtN * 2));
    description = 'sqrt(n) works well for large datasets';
  } else {
    recommended = Math.min(50, Math.floor(sqrtN * 0.7));
    min = 15;
    max = Math.min(200, Math.floor(sqrtN * 1.5));
    description = 'Larger neighborhood for very large datasets';
  }

  return {
    value: recommended,
    range: { min, max, recommended, description },
    confidence: nSamples < 50 ? 'medium' : 'high',
  };
}

/**
 * Get recommended min_dist for UMAP
 */
export function getMinDistRecommendation(
  preset: QualityPreset = 'balanced'
): ParameterRecommendation {
  const values = {
    fast: 0.3,    // More spread, faster
    balanced: 0.1, // Default, good for clustering
    quality: 0.05, // Tighter clusters
  };

  return {
    value: values[preset],
    range: {
      min: 0.0,
      max: 0.99,
      recommended: values[preset],
      description: preset === 'fast'
        ? 'More spread out points, faster processing'
        : preset === 'quality'
        ? 'Tighter clusters, better for detailed analysis'
        : 'Default: good balance of cluster separation',
    },
    confidence: 'high',
  };
}

/**
 * Get recommended epochs for UMAP
 */
export function getNEpochsRecommendation(
  nSamples: number,
  preset: QualityPreset = 'balanced'
): ParameterRecommendation {
  // UMAP default: 500 for small, 200 for large
  const baseEpochs = nSamples < 200 ? 500 : 200;

  const multipliers = {
    fast: 0.5,
    balanced: 1.0,
    quality: 1.5,
  };

  const recommended = Math.round(baseEpochs * multipliers[preset]);

  return {
    value: Math.min(1000, Math.max(100, recommended)),
    range: {
      min: 100,
      max: 1000,
      recommended,
      description: nSamples < 200
        ? 'More epochs for small datasets'
        : 'Standard epochs for larger datasets',
    },
    confidence: 'high',
  };
}

/**
 * Get all UMAP recommendations
 */
export function getUMAPRecommendations(
  nSamples: number,
  preset: QualityPreset = 'balanced'
): {
  nNeighbors: ParameterRecommendation;
  minDist: ParameterRecommendation;
  nEpochs: ParameterRecommendation;
  params: UMAPParams;
} {
  const nNeighbors = getNNeighborsRecommendation(nSamples);
  const minDist = getMinDistRecommendation(preset);
  const nEpochs = getNEpochsRecommendation(nSamples, preset);

  return {
    nNeighbors,
    minDist,
    nEpochs,
    params: {
      nNeighbors: nNeighbors.value,
      minDist: minDist.value,
      nEpochs: nEpochs.value,
    },
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if a parameter value is within recommended range
 */
export function isInRecommendedRange(value: number, range: ParameterRange): boolean {
  return value >= range.min && value <= range.max;
}

/**
 * Get deviation from recommended value as percentage
 */
export function getDeviationFromRecommended(
  value: number,
  range: ParameterRange
): { percent: number; direction: 'low' | 'high' | 'optimal' } {
  const diff = value - range.recommended;
  const rangeSpan = range.max - range.min;
  const percent = Math.abs(diff / rangeSpan) * 100;

  if (Math.abs(diff) < rangeSpan * 0.1) {
    return { percent: 0, direction: 'optimal' };
  }

  return {
    percent: Math.round(percent),
    direction: diff < 0 ? 'low' : 'high',
  };
}

/**
 * Format recommendation as user-friendly string
 */
export function formatRecommendation(rec: ParameterRecommendation): string {
  const { range, warning } = rec;
  let text = `Recommended: ${range.recommended} (range: ${range.min}-${range.max})`;
  if (warning) {
    text += ` ⚠️ ${warning}`;
  }
  return text;
}

/**
 * Get method recommendation based on dataset size
 */
export function getMethodRecommendation(nSamples: number): {
  recommended: 'pca' | 'umap' | 'tsne';
  alternatives: Array<{ method: 'pca' | 'umap' | 'tsne'; reason: string }>;
} {
  if (nSamples < 50) {
    return {
      recommended: 'pca',
      alternatives: [
        { method: 'umap', reason: 'May work but results could be unstable' },
        { method: 'tsne', reason: 'Not recommended for very small datasets' },
      ],
    };
  }

  if (nSamples > 5000) {
    return {
      recommended: 'umap',
      alternatives: [
        { method: 'pca', reason: 'Fast but linear, may miss nonlinear structure' },
        { method: 'tsne', reason: 'Very slow for large datasets' },
      ],
    };
  }

  // Default: both UMAP and t-SNE are good
  return {
    recommended: 'umap',
    alternatives: [
      { method: 'tsne', reason: 'Good for detailed local structure' },
      { method: 'pca', reason: 'Fast preview, deterministic' },
    ],
  };
}
