import { kmeans } from 'ml-kmeans';
import type { Point2D } from '../types';

export interface ClusterResult {
  labels: number[];
  centroids: number[][];
  percentages: Map<number, number>;
}

export function computeKMeans(
  coordinates: Point2D[],
  nClusters: number = 5
): ClusterResult {
  if (coordinates.length === 0) {
    return { labels: [], centroids: [], percentages: new Map() };
  }

  // Ensure nClusters doesn't exceed the number of points
  const actualClusters = Math.min(nClusters, coordinates.length);

  const data = coordinates.map(p => [p.x, p.y]);
  const result = kmeans(data, actualClusters, {
    initialization: 'kmeans++',
    maxIterations: 100,
  });

  // Calculate percentages
  const counts = new Map<number, number>();
  for (const label of result.clusters) {
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  const percentages = new Map<number, number>();
  const total = coordinates.length;
  for (const [label, count] of counts) {
    percentages.set(label, (count / total) * 100);
  }

  return {
    labels: result.clusters,
    centroids: result.centroids,
    percentages,
  };
}

// Color palette for clusters (Category10 style)
export const CLUSTER_COLORS = [
  '#1f77b4', // blue
  '#ff7f0e', // orange
  '#2ca02c', // green
  '#d62728', // red
  '#9467bd', // purple
  '#8c564b', // brown
  '#e377c2', // pink
  '#7f7f7f', // gray
  '#bcbd22', // olive
  '#17becf', // cyan
];

export function getClusterColor(clusterIndex: number): string {
  return CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length];
}
