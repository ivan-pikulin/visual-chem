/**
 * Web Worker for dimensionality reduction computations
 * Runs t-SNE and UMAP in a separate thread to keep UI responsive
 */

import TSNE from 'tsne-js';
import { UMAP } from 'umap-js';

export interface WorkerMessage {
  type: 'tsne' | 'umap';
  data: number[][];
  params: {
    // t-SNE params
    perplexity?: number;
    iterations?: number;
    learningRate?: number;
    // UMAP params
    nNeighbors?: number;
    minDist?: number;
    nEpochs?: number;
  };
}

export interface WorkerResponse {
  type: 'progress' | 'result' | 'error';
  progress?: {
    current: number;
    total: number;
  };
  result?: { x: number; y: number }[];
  error?: string;
}

// Listen for messages from main thread
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, data, params } = event.data;

  try {
    if (type === 'tsne') {
      runTSNE(data, params);
    } else if (type === 'umap') {
      runUMAP(data, params);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    } as WorkerResponse);
  }
};

function runTSNE(
  data: number[][],
  params: { perplexity?: number; iterations?: number; learningRate?: number }
) {
  const { perplexity = 30, iterations = 1000, learningRate = 200 } = params;
  const progressInterval = Math.max(1, Math.floor(iterations / 100));

  // Report initial progress
  self.postMessage({
    type: 'progress',
    progress: {
      current: 0,
      total: iterations,
    },
  } as WorkerResponse);

  const model = new TSNE({
    dim: 2,
    perplexity,
    earlyExaggeration: 4.0,
    learningRate,
    nIter: iterations,
    metric: 'euclidean',
  });

  model.init({
    data,
    type: 'dense',
  });

  const eventedModel = model as unknown as {
    on: (eventName: 'progressIter', handler: (iter: [number, number, number]) => void) => void;
  };

  eventedModel.on('progressIter', (iter: [number, number, number]) => {
    const current = Array.isArray(iter) ? iter[0] : Number(iter);

    if (current % progressInterval === 0 || current >= iterations - 1) {
      self.postMessage({
        type: 'progress',
        progress: {
          current,
          total: iterations,
        },
      } as WorkerResponse);
    }
  });

  // Run all iterations (this is blocking, but it's in a worker so UI stays responsive)
  model.run();

  // Report 100% progress
  self.postMessage({
    type: 'progress',
    progress: {
      current: iterations,
      total: iterations,
    },
  } as WorkerResponse);

  // Done - send result
  const output = model.getOutputScaled();
  const result = output.map((row: number[]) => ({
    x: row[0],
    y: row[1],
  }));

  self.postMessage({
    type: 'result',
    result,
  } as WorkerResponse);
}

function runUMAP(
  data: number[][],
  params: { nNeighbors?: number; minDist?: number; nEpochs?: number }
) {
  const { nNeighbors = 15, minDist = 0.1, nEpochs = 200 } = params;

  const umap = new UMAP({
    nComponents: 2,
    nNeighbors,
    minDist,
    nEpochs,
  });

  // Initialize fit
  const totalEpochs = umap.initializeFit(data);
  const actualEpochs = nEpochs || totalEpochs;
  const progressInterval = Math.max(1, Math.floor(actualEpochs / 100));

  const runStep = () => {
    const epochsDone = umap.step();

    // Report progress
    if (epochsDone % progressInterval === 0 || epochsDone >= actualEpochs) {
      self.postMessage({
        type: 'progress',
        progress: {
          current: epochsDone,
          total: actualEpochs,
        },
      } as WorkerResponse);
    }

    if (epochsDone < actualEpochs) {
      // Continue with next step
      setTimeout(runStep, 0);
    } else {
      // Done - send result
      const embedding = umap.getEmbedding();
      const result = embedding.map((row) => ({
        x: row[0],
        y: row[1],
      }));

      self.postMessage({
        type: 'result',
        result,
      } as WorkerResponse);
    }
  };

  // Start processing
  runStep();
}
