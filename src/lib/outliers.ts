import type { Point2D } from '../types';

export interface OutlierResult {
  filtered: Point2D[];
  filteredIndices: number[];
  removedIndices: number[];
}

export function removeOutliers(
  coordinates: Point2D[],
  threshold: number = 3.0
): OutlierResult {
  const n = coordinates.length;

  if (n === 0) {
    return { filtered: [], filteredIndices: [], removedIndices: [] };
  }

  // Calculate means
  let meanX = 0, meanY = 0;
  for (const p of coordinates) {
    meanX += p.x;
    meanY += p.y;
  }
  meanX /= n;
  meanY /= n;

  // Calculate standard deviations
  let stdX = 0, stdY = 0;
  for (const p of coordinates) {
    stdX += Math.pow(p.x - meanX, 2);
    stdY += Math.pow(p.y - meanY, 2);
  }
  stdX = Math.sqrt(stdX / n);
  stdY = Math.sqrt(stdY / n);

  // Avoid division by zero
  if (stdX === 0) stdX = 1;
  if (stdY === 0) stdY = 1;

  // Filter by Z-score
  const filtered: Point2D[] = [];
  const filteredIndices: number[] = [];
  const removedIndices: number[] = [];

  for (let i = 0; i < n; i++) {
    const zX = Math.abs((coordinates[i].x - meanX) / stdX);
    const zY = Math.abs((coordinates[i].y - meanY) / stdY);

    if (zX < threshold && zY < threshold) {
      filtered.push(coordinates[i]);
      filteredIndices.push(i);
    } else {
      removedIndices.push(i);
    }
  }

  return { filtered, filteredIndices, removedIndices };
}

export function computeZScores(coordinates: Point2D[]): number[] {
  const n = coordinates.length;

  if (n === 0) return [];

  // Calculate means
  let meanX = 0, meanY = 0;
  for (const p of coordinates) {
    meanX += p.x;
    meanY += p.y;
  }
  meanX /= n;
  meanY /= n;

  // Calculate standard deviations
  let stdX = 0, stdY = 0;
  for (const p of coordinates) {
    stdX += Math.pow(p.x - meanX, 2);
    stdY += Math.pow(p.y - meanY, 2);
  }
  stdX = Math.sqrt(stdX / n);
  stdY = Math.sqrt(stdY / n);

  if (stdX === 0) stdX = 1;
  if (stdY === 0) stdY = 1;

  // Calculate Z-scores (use max of x and y z-scores)
  return coordinates.map(p => {
    const zX = Math.abs((p.x - meanX) / stdX);
    const zY = Math.abs((p.y - meanY) / stdY);
    return Math.max(zX, zY);
  });
}
