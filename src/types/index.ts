export interface MoleculeData {
  smiles: string;
  value: number;
  isValid: boolean;
  svg?: string;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface ProcessedMolecule extends MoleculeData {
  fingerprint: number[];
  coordinates?: Point2D;
  cluster?: number;
  isOutlier?: boolean;
}

export interface Dataset {
  id: string;
  molecules: ProcessedMolecule[];
  valueRange: { min: number; max: number };
  name: string;
  color?: string;
}

export type DimensionalityMethod = 'tsne' | 'umap' | 'pca';

export interface TSNEParams {
  perplexity: number;
  iterations: number;
  learningRate: number;
}

export interface UMAPParams {
  nNeighbors: number;
  minDist: number;
  nEpochs: number;
}

export interface PCAParams {
  nComponents: 2;
}

export type DRParams = TSNEParams | UMAPParams | PCAParams;

export type ColorMode = 'value' | 'cluster' | 'dataset';

export interface VisualizationSettings {
  pointSize: number;
  pointOpacity: number;
  colorMode: ColorMode;
  showOutliers: boolean;
}

export interface ClusteringSettings {
  enabled: boolean;
  nClusters: number;
}

export interface OutlierSettings {
  enabled: boolean;
  threshold: number;
}

export interface AppState {
  // Data
  datasets: Dataset[];
  activeDatasetId: string | null;
  isLoading: boolean;
  progress: number;
  progressMessage: string;
  error: string | null;
  needsAnalysis: boolean; // true when data loaded but DR not yet run

  // Settings
  drMethod: DimensionalityMethod;
  tsneParams: TSNEParams;
  umapParams: UMAPParams;

  // Clustering
  clustering: ClusteringSettings;
  clusterLabels: number[] | null;

  // Outliers
  outlierSettings: OutlierSettings;

  // Visualization
  visualization: VisualizationSettings;
  hoveredIndex: number | null;
  selectedIndices: number[];

  // Actions - Data
  addDataset: (dataset: Dataset) => void;
  removeDataset: (id: string) => void;
  clearAllDatasets: () => void;
  setActiveDataset: (id: string | null) => void;

  // Legacy support
  dataset: Dataset | null;
  setDataset: (dataset: Dataset | null) => void;

  // Actions - Loading
  setLoading: (loading: boolean) => void;
  setProgress: (progress: number, message?: string) => void;
  setError: (error: string | null) => void;
  setNeedsAnalysis: (needsAnalysis: boolean) => void;

  // Actions - DR Settings
  setDRMethod: (method: DimensionalityMethod) => void;
  setTSNEParams: (params: Partial<TSNEParams>) => void;
  setUMAPParams: (params: Partial<UMAPParams>) => void;

  // Actions - Clustering
  setClusteringEnabled: (enabled: boolean) => void;
  setNClusters: (n: number) => void;
  setClusterLabels: (labels: number[] | null) => void;

  // Actions - Outliers
  setOutlierSettings: (settings: Partial<OutlierSettings>) => void;

  // Actions - Visualization
  setVisualization: (settings: Partial<VisualizationSettings>) => void;
  setHoveredIndex: (index: number | null) => void;
  setSelectedIndices: (indices: number[]) => void;

  // Actions - Coordinates
  updateCoordinates: (coordinates: Point2D[]) => void;
  updateMoleculeClusters: (clusters: number[]) => void;
  updateMoleculeOutliers: (outlierIndices: number[]) => void;

  // Actions - Reset
  reset: () => void;
}
