import type { Point2D, TSNEParams } from '../../types';
import type { WorkerMessage, WorkerResponse } from './dr.worker';

export interface TSNEProgress {
  iteration: number;
  totalIterations: number;
  error: number;
}

export function getAdaptiveTSNEParams(nSamples: number): Partial<TSNEParams> {
  // Adaptive perplexity based on dataset size (similar to ChemPlot)
  // Perplexity should be between 5 and 50, and less than n_samples
  const perplexity = Math.max(5, Math.min(50, Math.floor(nSamples * 0.05)));

  return {
    perplexity: Math.min(perplexity, Math.floor(nSamples / 3)),
    iterations: 1000,
    learningRate: 200,
  };
}

export async function computeTSNE(
  data: number[][],
  params: TSNEParams,
  onProgress?: (progress: TSNEProgress) => void
): Promise<Point2D[]> {
  if (data.length === 0) return [];

  return new Promise((resolve, reject) => {
    // Create worker using Vite's worker import syntax
    const worker = new Worker(
      new URL('./dr.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { type, progress, result, error } = event.data;

      if (type === 'progress' && progress && onProgress) {
        onProgress({
          iteration: progress.current,
          totalIterations: progress.total,
          error: 0,
        });
      } else if (type === 'result' && result) {
        worker.terminate();
        resolve(result);
      } else if (type === 'error') {
        worker.terminate();
        reject(new Error(error || 'Worker error'));
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(new Error(`Worker error: ${error.message}`));
    };

    // Send data to worker
    const message: WorkerMessage = {
      type: 'tsne',
      data,
      params: {
        perplexity: params.perplexity,
        iterations: params.iterations,
        learningRate: params.learningRate,
      },
    };

    worker.postMessage(message);
  });
}

// Sync version kept for backward compatibility (still blocks main thread)
export function computeTSNESync(data: number[][], params: TSNEParams): Point2D[] {
  if (data.length === 0) return [];

  // Dynamic import to avoid bundling in worker
  const TSNE = require('tsne-js');

  const model = new TSNE({
    dim: 2,
    perplexity: params.perplexity,
    earlyExaggeration: 4.0,
    learningRate: params.learningRate,
    nIter: params.iterations,
    metric: 'euclidean',
  });

  model.init({
    data,
    type: 'dense',
  });

  model.run();

  const output = model.getOutputScaled();
  return output.map((row: number[]) => ({
    x: row[0],
    y: row[1],
  }));
}
