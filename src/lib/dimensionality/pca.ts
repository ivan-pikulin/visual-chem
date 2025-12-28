import { PCA } from 'ml-pca';
import type { Point2D } from '../../types';

export function computePCA(data: number[][]): Point2D[] {
  if (data.length === 0) return [];

  const pca = new PCA(data);
  const projected = pca.predict(data, { nComponents: 2 });
  const result = projected.to2DArray();

  return result.map((row) => ({
    x: row[0],
    y: row[1],
  }));
}

export function getExplainedVariance(data: number[][]): number[] {
  if (data.length === 0) return [];

  const pca = new PCA(data);
  return pca.getExplainedVariance().slice(0, 2);
}
