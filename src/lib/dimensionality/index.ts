import { computePCA } from './pca';
import { computeUMAP, getAdaptiveUMAPParams } from './umap';
import { computeTSNE, getAdaptiveTSNEParams } from './tsne';
import { OperationCancelledError } from '../fingerprints';
import { updateCoefficients, type TimingMeasurement } from '../timing';
import type { Point2D, DimensionalityMethod, TSNEParams, UMAPParams } from '../../types';

export interface DRProgress {
  stage: 'tsne' | 'umap' | 'pca';
  current: number;
  total: number;
}

export interface DRResult {
  coordinates: Point2D[];
  timing: {
    method: DimensionalityMethod;
    nSamples: number;
    durationMs: number;
  };
}

export async function reduceDimensionality(
  data: number[][],
  method: DimensionalityMethod,
  params: { tsne: TSNEParams; umap: UMAPParams },
  onProgress?: (progress: DRProgress) => void,
  signal?: AbortSignal
): Promise<Point2D[]> {
  if (data.length === 0) return [];

  // Check for cancellation before starting
  if (signal?.aborted) {
    throw new OperationCancelledError();
  }

  const startTime = performance.now();
  let result: Point2D[];

  switch (method) {
    case 'pca':
      if (onProgress) {
        onProgress({ stage: 'pca', current: 0, total: 1 });
      }
      result = computePCA(data);
      if (onProgress) {
        onProgress({ stage: 'pca', current: 1, total: 1 });
      }
      break;

    case 'umap':
      result = await computeUMAP(data, params.umap, (p) => {
        if (onProgress) {
          onProgress({ stage: 'umap', current: p.epoch, total: p.totalEpochs });
        }
      }, signal);
      break;

    case 'tsne':
      result = await computeTSNE(data, params.tsne, (p) => {
        if (onProgress) {
          onProgress({ stage: 'tsne', current: p.iteration, total: p.totalIterations });
        }
      }, signal);
      break;

    default:
      throw new Error(`Unknown method: ${method}`);
  }

  // Record timing for adaptive estimation
  const durationMs = performance.now() - startTime;
  recordTiming(method, data.length, durationMs, params);

  return result;
}

/**
 * Record timing measurement and update coefficients
 */
function recordTiming(
  method: DimensionalityMethod,
  nSamples: number,
  actualTimeMs: number,
  params: { tsne: TSNEParams; umap: UMAPParams }
): void {
  // Skip recording for cancelled or failed operations
  if (actualTimeMs < 0 || nSamples < 10) return;

  const measurement: TimingMeasurement = {
    method,
    nSamples,
    actualTimeMs,
    params: method === 'tsne'
      ? { iterations: params.tsne.iterations }
      : method === 'umap'
      ? { nNeighbors: params.umap.nNeighbors, nEpochs: params.umap.nEpochs }
      : undefined,
  };

  try {
    updateCoefficients(measurement);
    console.debug(`[Timing] ${method.toUpperCase()}: n=${nSamples}, time=${actualTimeMs.toFixed(0)}ms`);
  } catch (e) {
    // Don't fail the main operation if timing update fails
    console.warn('Failed to update timing coefficients:', e);
  }
}

export function getAdaptiveParams(nSamples: number) {
  return {
    tsne: getAdaptiveTSNEParams(nSamples),
    umap: getAdaptiveUMAPParams(nSamples),
  };
}

export { computePCA, getExplainedVariance } from './pca';
export { computeUMAP, computeUMAPSync, getAdaptiveUMAPParams } from './umap';
export { computeTSNE, computeTSNESync, getAdaptiveTSNEParams } from './tsne';
