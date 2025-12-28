import TSNE from 'tsne-js';
import type { Point2D, TSNEParams } from '../../types';

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

  return new Promise((resolve) => {
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

    let currentIteration = 0;
    const stepSize = 10;

    const runStep = () => {
      const error = model.run();
      currentIteration += stepSize;

      if (onProgress) {
        onProgress({
          iteration: currentIteration,
          totalIterations: params.iterations,
          error,
        });
      }

      if (currentIteration < params.iterations) {
        requestAnimationFrame(runStep);
      } else {
        const output = model.getOutputScaled();
        const result: Point2D[] = output.map((row: number[]) => ({
          x: row[0],
          y: row[1],
        }));
        resolve(result);
      }
    };

    runStep();
  });
}

export function computeTSNESync(data: number[][], params: TSNEParams): Point2D[] {
  if (data.length === 0) return [];

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
