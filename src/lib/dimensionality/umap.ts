import type { Point2D, UMAPParams } from '../../types';
import type { WorkerMessage, WorkerResponse } from './dr.worker';
import { OperationCancelledError } from '../fingerprints';

export interface UMAPProgress {
  epoch: number;
  totalEpochs: number;
}

export function getAdaptiveUMAPParams(nSamples: number): Partial<UMAPParams> {
  // Adaptive n_neighbors based on dataset size (similar to ChemPlot)
  const nNeighbors = Math.max(2, Math.min(100, Math.floor(Math.sqrt(nSamples))));

  // Adaptive epochs based on dataset size
  const nEpochs = Math.min(500, Math.max(200, nSamples));

  return {
    nNeighbors,
    minDist: 0.1,
    nEpochs,
  };
}

export async function computeUMAP(
  data: number[][],
  params: UMAPParams,
  onProgress?: (progress: UMAPProgress) => void,
  signal?: AbortSignal
): Promise<Point2D[]> {
  if (data.length === 0) return [];

  return new Promise((resolve, reject) => {
    // Create worker using Vite's worker import syntax
    const worker = new Worker(
      new URL('./dr.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Handle abort signal
    const abortHandler = () => {
      worker.terminate();
      reject(new OperationCancelledError());
    };

    if (signal?.aborted) {
      reject(new OperationCancelledError());
      return;
    }

    signal?.addEventListener('abort', abortHandler);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { type, progress, result, error } = event.data;

      if (type === 'progress' && progress && onProgress) {
        onProgress({
          epoch: progress.current,
          totalEpochs: progress.total,
        });
      } else if (type === 'result' && result) {
        signal?.removeEventListener('abort', abortHandler);
        worker.terminate();
        resolve(result);
      } else if (type === 'error') {
        signal?.removeEventListener('abort', abortHandler);
        worker.terminate();
        reject(new Error(error || 'Worker error'));
      }
    };

    worker.onerror = (error) => {
      signal?.removeEventListener('abort', abortHandler);
      worker.terminate();
      reject(new Error(`Worker error: ${error.message}`));
    };

    // Send data to worker
    const message: WorkerMessage = {
      type: 'umap',
      data,
      params: {
        nNeighbors: params.nNeighbors,
        minDist: params.minDist,
        nEpochs: params.nEpochs,
      },
    };

    worker.postMessage(message);
  });
}

// Sync version kept for backward compatibility (still blocks main thread)
export function computeUMAPSync(data: number[][], params: UMAPParams): Point2D[] {
  if (data.length === 0) return [];

  // Dynamic import to avoid bundling in worker
  const { UMAP } = require('umap-js');

  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: params.nNeighbors,
    minDist: params.minDist,
    nEpochs: params.nEpochs,
  });

  const embedding = umap.fit(data);

  return embedding.map((row: number[]) => ({
    x: row[0],
    y: row[1],
  }));
}
