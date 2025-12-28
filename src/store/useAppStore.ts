import { create } from 'zustand';
import type {
  AppState,
  DimensionalityMethod,
  TSNEParams,
  UMAPParams,
  Dataset,
  Point2D,
  VisualizationSettings,
  ClusteringSettings,
  OutlierSettings,
} from '../types';

const defaultTSNEParams: TSNEParams = {
  perplexity: 30,
  iterations: 1000,
  learningRate: 200,
};

const defaultUMAPParams: UMAPParams = {
  nNeighbors: 15,
  minDist: 0.1,
  nEpochs: 500,
};

const defaultVisualization: VisualizationSettings = {
  pointSize: 8,
  pointOpacity: 0.8,
  colorMode: 'value',
  showOutliers: true,
};

const defaultClustering: ClusteringSettings = {
  enabled: false,
  nClusters: 5,
};

const defaultOutlierSettings: OutlierSettings = {
  enabled: false,
  threshold: 3.0,
};

// Color palette for multiple datasets
export const DATASET_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
];

// Helper to get active dataset
function getActiveDataset(datasets: Dataset[], activeDatasetId: string | null): Dataset | null {
  if (activeDatasetId) {
    return datasets.find(d => d.id === activeDatasetId) || null;
  }
  return datasets[0] || null;
}

export const useAppStore = create<AppState>((set) => ({
  // Data
  datasets: [],
  activeDatasetId: null,
  dataset: null, // Computed on every state change
  isLoading: false,
  progress: 0,
  progressMessage: '',
  error: null,
  needsAnalysis: false,

  // Settings
  drMethod: 'umap',
  tsneParams: defaultTSNEParams,
  umapParams: defaultUMAPParams,

  // Clustering
  clustering: defaultClustering,
  clusterLabels: null,

  // Outliers
  outlierSettings: defaultOutlierSettings,

  // Visualization
  visualization: defaultVisualization,
  hoveredIndex: null,
  selectedIndices: [],

  // Actions - Data
  addDataset: (dataset: Dataset) => set((state) => {
    const colorIndex = state.datasets.length % DATASET_COLORS.length;
    const newDataset = {
      ...dataset,
      color: dataset.color || DATASET_COLORS[colorIndex],
    };
    const newDatasets = [...state.datasets, newDataset];
    const newActiveId = state.activeDatasetId || newDataset.id;
    return {
      datasets: newDatasets,
      activeDatasetId: newActiveId,
      dataset: getActiveDataset(newDatasets, newActiveId),
      error: null,
    };
  }),

  removeDataset: (id: string) => set((state) => {
    const newDatasets = state.datasets.filter(d => d.id !== id);
    const newActiveId = state.activeDatasetId === id
      ? (newDatasets[0]?.id || null)
      : state.activeDatasetId;
    return {
      datasets: newDatasets,
      activeDatasetId: newActiveId,
      dataset: getActiveDataset(newDatasets, newActiveId),
    };
  }),

  clearAllDatasets: () => set({
    datasets: [],
    activeDatasetId: null,
    dataset: null,
    clusterLabels: null,
  }),

  setActiveDataset: (id: string | null) => set((state) => ({
    activeDatasetId: id,
    dataset: getActiveDataset(state.datasets, id),
  })),

  // Legacy support - setDataset replaces all datasets with single one
  setDataset: (dataset: Dataset | null) => set(() => {
    if (!dataset) {
      return { datasets: [], activeDatasetId: null, dataset: null };
    }
    const newDataset = { ...dataset, color: DATASET_COLORS[0] };
    return {
      datasets: [newDataset],
      activeDatasetId: dataset.id,
      dataset: newDataset,
      error: null,
    };
  }),

  // Actions - Loading
  setLoading: (isLoading: boolean) => set({ isLoading }),

  setProgress: (progress: number, message?: string) =>
    set({ progress, progressMessage: message ?? '' }),

  setError: (error: string | null) => set({ error, isLoading: false }),

  setNeedsAnalysis: (needsAnalysis: boolean) => set({ needsAnalysis }),

  // Actions - DR Settings
  setDRMethod: (drMethod: DimensionalityMethod) => set({ drMethod }),

  setTSNEParams: (params: Partial<TSNEParams>) =>
    set((state) => ({ tsneParams: { ...state.tsneParams, ...params } })),

  setUMAPParams: (params: Partial<UMAPParams>) =>
    set((state) => ({ umapParams: { ...state.umapParams, ...params } })),

  // Actions - Clustering
  setClusteringEnabled: (enabled: boolean) =>
    set((state) => ({
      clustering: { ...state.clustering, enabled },
      clusterLabels: enabled ? state.clusterLabels : null,
    })),

  setNClusters: (nClusters: number) =>
    set((state) => ({ clustering: { ...state.clustering, nClusters } })),

  setClusterLabels: (clusterLabels: number[] | null) => set({ clusterLabels }),

  // Actions - Outliers
  setOutlierSettings: (settings: Partial<OutlierSettings>) =>
    set((state) => ({ outlierSettings: { ...state.outlierSettings, ...settings } })),

  // Actions - Visualization
  setVisualization: (settings: Partial<VisualizationSettings>) =>
    set((state) => ({ visualization: { ...state.visualization, ...settings } })),

  setHoveredIndex: (hoveredIndex: number | null) => set({ hoveredIndex }),

  setSelectedIndices: (selectedIndices: number[]) => set({ selectedIndices }),

  // Actions - Coordinates
  updateCoordinates: (coordinates: Point2D[]) =>
    set((state) => {
      const activeId = state.activeDatasetId;
      if (!activeId) return state;

      const datasets = state.datasets.map(dataset => {
        if (dataset.id !== activeId) return dataset;

        let coordIndex = 0;
        const molecules = dataset.molecules.map((mol) => {
          if (mol.isValid) {
            return { ...mol, coordinates: coordinates[coordIndex++] };
          }
          return mol;
        });
        return { ...dataset, molecules };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, activeId),
      };
    }),

  updateMoleculeClusters: (clusters: number[]) =>
    set((state) => {
      const activeId = state.activeDatasetId;
      if (!activeId) return state;

      const datasets = state.datasets.map(dataset => {
        if (dataset.id !== activeId) return dataset;

        let clusterIndex = 0;
        const molecules = dataset.molecules.map((mol) => {
          if (mol.isValid && mol.coordinates) {
            return { ...mol, cluster: clusters[clusterIndex++] };
          }
          return mol;
        });
        return { ...dataset, molecules };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, activeId),
        clusterLabels: clusters,
      };
    }),

  updateMoleculeOutliers: (outlierIndices: number[]) =>
    set((state) => {
      const activeId = state.activeDatasetId;
      if (!activeId) return state;

      const outlierSet = new Set(outlierIndices);

      const datasets = state.datasets.map(dataset => {
        if (dataset.id !== activeId) return dataset;

        let validIndex = 0;
        const molecules = dataset.molecules.map((mol) => {
          if (mol.isValid && mol.coordinates) {
            const isOutlier = outlierSet.has(validIndex);
            validIndex++;
            return { ...mol, isOutlier };
          }
          return mol;
        });
        return { ...dataset, molecules };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, activeId),
      };
    }),

  // Actions - Reset
  reset: () =>
    set({
      datasets: [],
      activeDatasetId: null,
      dataset: null,
      isLoading: false,
      progress: 0,
      progressMessage: '',
      error: null,
      needsAnalysis: false,
      clusterLabels: null,
      hoveredIndex: null,
      selectedIndices: [],
      visualization: defaultVisualization,
      clustering: defaultClustering,
      outlierSettings: defaultOutlierSettings,
    }),
}));
