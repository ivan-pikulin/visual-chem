import { computePCA } from './pca';
import { computeUMAP, getAdaptiveUMAPParams } from './umap';
import { computeTSNE, getAdaptiveTSNEParams } from './tsne';
import type { Point2D, DimensionalityMethod, TSNEParams, UMAPParams } from '../../types';

export interface DRProgress {
  stage: 'tsne' | 'umap' | 'pca';
  current: number;
  total: number;
}

export async function reduceDimensionality(
  data: number[][],
  method: DimensionalityMethod,
  params: { tsne: TSNEParams; umap: UMAPParams },
  onProgress?: (progress: DRProgress) => void
): Promise<Point2D[]> {
  if (data.length === 0) return [];

  switch (method) {
    case 'pca':
      if (onProgress) {
        onProgress({ stage: 'pca', current: 0, total: 1 });
      }
      const pcaResult = computePCA(data);
      if (onProgress) {
        onProgress({ stage: 'pca', current: 1, total: 1 });
      }
      return pcaResult;

    case 'umap':
      return computeUMAP(data, params.umap, (p) => {
        if (onProgress) {
          onProgress({ stage: 'umap', current: p.epoch, total: p.totalEpochs });
        }
      });

    case 'tsne':
      return computeTSNE(data, params.tsne, (p) => {
        if (onProgress) {
          onProgress({ stage: 'tsne', current: p.iteration, total: p.totalIterations });
        }
      });

    default:
      throw new Error(`Unknown method: ${method}`);
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
