import { UMAP } from 'umap-js';
import type { Point2D, UMAPParams } from '../../types';

export interface UMAPProgress {
  epoch: number;
  totalEpochs: number;
}

export function getAdaptiveUMAPParams(nSamples: number): Partial<UMAPParams> {
  // Adaptive n_neighbors based on dataset size (similar to ChemPlot)
  const nNeighbors = Math.max(2, Math.min(100, Math.floor(Math.sqrt(nSamples))));

  return {
    nNeighbors,
    minDist: 0.1,
    nEpochs: Math.min(500, Math.max(200, nSamples)),
  };
}

export async function computeUMAP(
  data: number[][],
  params: UMAPParams,
  onProgress?: (progress: UMAPProgress) => void
): Promise<Point2D[]> {
  if (data.length === 0) return [];

  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: params.nNeighbors,
    minDist: params.minDist,
    nEpochs: params.nEpochs,
  });

  // Fit and transform with progress callback
  const embedding = await new Promise<number[][]>((resolve) => {
    const nEpochs = umap.initializeFit(data);
    const totalEpochs = params.nEpochs || nEpochs;

    const step = () => {
      const epochsDone = umap.step();

      if (onProgress) {
        onProgress({ epoch: epochsDone, totalEpochs });
      }

      if (epochsDone < totalEpochs) {
        requestAnimationFrame(step);
      } else {
        resolve(umap.getEmbedding());
      }
    };

    step();
  });

  return embedding.map((row) => ({
    x: row[0],
    y: row[1],
  }));
}

export function computeUMAPSync(data: number[][], params: UMAPParams): Point2D[] {
  if (data.length === 0) return [];

  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: params.nNeighbors,
    minDist: params.minDist,
    nEpochs: params.nEpochs,
  });

  const embedding = umap.fit(data);

  return embedding.map((row) => ({
    x: row[0],
    y: row[1],
  }));
}
