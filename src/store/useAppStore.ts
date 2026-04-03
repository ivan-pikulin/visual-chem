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
  ToolbarSettings,
  PlotTool,
  ActiveColumns,
  ColumnMapping,
  PointShape,
  DatasetDisplaySettings,
  DatasetLoadingState,
  ColumnFilter,
  ProcessedMolecule,
} from '../types';
import { applyFilters } from '../utils/filterUtils';

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
  activeColumns: {},
};

const defaultClustering: ClusteringSettings = {
  enabled: false,
  nClusters: 5,
};

const defaultOutlierSettings: OutlierSettings = {
  enabled: false,
  threshold: 3.0,
};

const defaultToolbar: ToolbarSettings = {
  enabledTools: ['pan2d', 'select2d', 'lasso2d', 'toImage'],
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
  abortController: null,

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
  toolbar: defaultToolbar,
  hoveredIndex: null,
  selectedIndices: [],

  // Actions - Data
  addDataset: (dataset: Dataset) => set((state) => {
    const colorIndex = state.datasets.length % DATASET_COLORS.length;
    const newDataset = {
      ...dataset,
      color: dataset.color || DATASET_COLORS[colorIndex],
      visible: dataset.visible ?? true,
      pointShape: dataset.pointShape ?? 'circle',
    };
    const newDatasets = [...state.datasets, newDataset];
    const newActiveId = state.activeDatasetId || newDataset.id;
    return {
      datasets: newDatasets,
      activeDatasetId: newActiveId,
      dataset: getActiveDataset(newDatasets, newActiveId),
      error: null,
      needsAnalysis: true, // Trigger reanalysis when data is added
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

  // Actions - Dataset display settings
  setDatasetVisible: (id: string, visible: boolean) => set((state) => {
    const datasets = state.datasets.map(d =>
      d.id === id ? { ...d, visible } : d
    );
    return {
      datasets,
      dataset: getActiveDataset(datasets, state.activeDatasetId),
    };
  }),

  setDatasetPointShape: (id: string, shape: PointShape) => set((state) => {
    const datasets = state.datasets.map(d =>
      d.id === id ? { ...d, pointShape: shape } : d
    );
    return {
      datasets,
      dataset: getActiveDataset(datasets, state.activeDatasetId),
    };
  }),

  setDatasetPointSize: (id: string, size: number | undefined) => set((state) => {
    const datasets = state.datasets.map(d =>
      d.id === id ? { ...d, pointSize: size } : d
    );
    return {
      datasets,
      dataset: getActiveDataset(datasets, state.activeDatasetId),
    };
  }),

  setDatasetColor: (id: string, color: string) => set((state) => {
    const datasets = state.datasets.map(d =>
      d.id === id ? { ...d, color } : d
    );
    return {
      datasets,
      dataset: getActiveDataset(datasets, state.activeDatasetId),
    };
  }),

  setAllDatasetsVisible: (visible: boolean) => set((state) => {
    const datasets = state.datasets.map(d => ({ ...d, visible }));
    return {
      datasets,
      dataset: getActiveDataset(datasets, state.activeDatasetId),
    };
  }),

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

  startOperation: () => {
    const controller = new AbortController();
    set({ abortController: controller, isLoading: true, error: null });
    return controller;
  },

  cancelOperation: () => set((state) => {
    if (state.abortController) {
      state.abortController.abort();
    }
    return {
      abortController: null,
      isLoading: false,
      progress: 0,
      progressMessage: '',
    };
  }),

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

  setToolbar: (settings: Partial<ToolbarSettings>) =>
    set((state) => ({ toolbar: { ...state.toolbar, ...settings } })),

  toggleTool: (tool: PlotTool) =>
    set((state) => {
      const current = state.toolbar.enabledTools;
      const newTools = current.includes(tool)
        ? current.filter((t) => t !== tool)
        : [...current, tool];
      return { toolbar: { ...state.toolbar, enabledTools: newTools } };
    }),

  setHoveredIndex: (hoveredIndex: number | null) => set({ hoveredIndex }),

  setSelectedIndices: (selectedIndices: number[]) => set({ selectedIndices }),

  setActiveColumns: (columns: Partial<ActiveColumns>) =>
    set((state) => ({
      visualization: {
        ...state.visualization,
        activeColumns: { ...state.visualization.activeColumns, ...columns },
      },
    })),

  // Actions - Column Mapping
  updateColumnMapping: (mapping: Partial<ColumnMapping>) =>
    set((state) => {
      const activeId = state.activeDatasetId;
      if (!activeId) return state;

      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== activeId) return dataset;
        return {
          ...dataset,
          columnMapping: { ...dataset.columnMapping!, ...mapping },
        };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, activeId),
      };
    }),

  addValueColumn: (column: string) =>
    set((state) => {
      const activeId = state.activeDatasetId;
      if (!activeId) return state;

      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== activeId || !dataset.columnMapping) return dataset;
        const values = dataset.columnMapping.values.includes(column)
          ? dataset.columnMapping.values
          : [...dataset.columnMapping.values, column];
        return {
          ...dataset,
          columnMapping: { ...dataset.columnMapping, values },
        };
      });

      // If this is the first value column, make it active
      const activeDataset = datasets.find((d) => d.id === activeId);
      const shouldSetActive =
        activeDataset?.columnMapping?.values.length === 1 &&
        !state.visualization.activeColumns.value;

      return {
        datasets,
        dataset: getActiveDataset(datasets, activeId),
        ...(shouldSetActive && {
          visualization: {
            ...state.visualization,
            activeColumns: { ...state.visualization.activeColumns, value: column },
          },
        }),
      };
    }),

  removeValueColumn: (column: string) =>
    set((state) => {
      const activeId = state.activeDatasetId;
      if (!activeId) return state;

      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== activeId || !dataset.columnMapping) return dataset;
        return {
          ...dataset,
          columnMapping: {
            ...dataset.columnMapping,
            values: dataset.columnMapping.values.filter((v) => v !== column),
          },
        };
      });

      // If removed column was active, switch to first remaining or undefined
      const activeDataset = datasets.find((d) => d.id === activeId);
      const newActiveValue =
        state.visualization.activeColumns.value === column
          ? activeDataset?.columnMapping?.values[0]
          : state.visualization.activeColumns.value;

      return {
        datasets,
        dataset: getActiveDataset(datasets, activeId),
        visualization: {
          ...state.visualization,
          activeColumns: { ...state.visualization.activeColumns, value: newActiveValue },
        },
      };
    }),

  addLabelColumn: (column: string) =>
    set((state) => {
      const activeId = state.activeDatasetId;
      if (!activeId) return state;

      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== activeId || !dataset.columnMapping) return dataset;
        const labels = dataset.columnMapping.labels.includes(column)
          ? dataset.columnMapping.labels
          : [...dataset.columnMapping.labels, column];
        return {
          ...dataset,
          columnMapping: { ...dataset.columnMapping, labels },
        };
      });

      // If this is the first label column, make it active
      const activeDataset = datasets.find((d) => d.id === activeId);
      const shouldSetActive =
        activeDataset?.columnMapping?.labels.length === 1 &&
        !state.visualization.activeColumns.label;

      return {
        datasets,
        dataset: getActiveDataset(datasets, activeId),
        ...(shouldSetActive && {
          visualization: {
            ...state.visualization,
            activeColumns: { ...state.visualization.activeColumns, label: column },
          },
        }),
      };
    }),

  removeLabelColumn: (column: string) =>
    set((state) => {
      const activeId = state.activeDatasetId;
      if (!activeId) return state;

      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== activeId || !dataset.columnMapping) return dataset;
        return {
          ...dataset,
          columnMapping: {
            ...dataset.columnMapping,
            labels: dataset.columnMapping.labels.filter((l) => l !== column),
          },
        };
      });

      // If removed column was active, switch to first remaining or undefined
      const activeDataset = datasets.find((d) => d.id === activeId);
      const newActiveLabel =
        state.visualization.activeColumns.label === column
          ? activeDataset?.columnMapping?.labels[0]
          : state.visualization.activeColumns.label;

      return {
        datasets,
        dataset: getActiveDataset(datasets, activeId),
        visualization: {
          ...state.visualization,
          activeColumns: { ...state.visualization.activeColumns, label: newActiveLabel },
        },
      };
    }),

  setGroupColumn: (column: string | undefined) =>
    set((state) => {
      const activeId = state.activeDatasetId;
      if (!activeId) return state;

      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== activeId || !dataset.columnMapping) return dataset;
        return {
          ...dataset,
          columnMapping: { ...dataset.columnMapping, group: column },
        };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, activeId),
      };
    }),

  setSmilesColumn: (column: string) =>
    set((state) => {
      const activeId = state.activeDatasetId;
      if (!activeId) return state;

      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== activeId || !dataset.columnMapping) return dataset;
        return {
          ...dataset,
          columnMapping: { ...dataset.columnMapping, smiles: column },
        };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, activeId),
        needsAnalysis: true, // Changing SMILES requires reprocessing
      };
    }),

  // Actions - Dataset Display Settings
  setDatasetDisplaySettings: (id: string, settings: Partial<DatasetDisplaySettings>) =>
    set((state) => {
      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== id) return dataset;
        return {
          ...dataset,
          displaySettings: { ...dataset.displaySettings, ...settings },
        };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, state.activeDatasetId),
      };
    }),

  // Actions - Column Filters
  setDatasetFilters: (id: string, filters: ColumnFilter[]) =>
    set((state) => {
      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== id) return dataset;
        return { ...dataset, filters };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, state.activeDatasetId),
        needsAnalysis: true,
      };
    }),

  addDatasetFilter: (id: string, filter: ColumnFilter) =>
    set((state) => {
      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== id) return dataset;
        // Replace existing filter for same column or add new
        const existingFilters = dataset.filters || [];
        const filteredFilters = existingFilters.filter(f => f.column !== filter.column);
        return { ...dataset, filters: [...filteredFilters, filter] };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, state.activeDatasetId),
        needsAnalysis: true,
      };
    }),

  removeDatasetFilter: (id: string, columnName: string) =>
    set((state) => {
      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== id) return dataset;
        const filters = (dataset.filters || []).filter(f => f.column !== columnName);
        return { ...dataset, filters: filters.length > 0 ? filters : undefined };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, state.activeDatasetId),
        needsAnalysis: true,
      };
    }),

  clearDatasetFilters: (id: string) =>
    set((state) => {
      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== id) return dataset;
        return { ...dataset, filters: undefined };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, state.activeDatasetId),
        needsAnalysis: true,
      };
    }),

  getFilteredMolecules: (id: string): ProcessedMolecule[] => {
    const state = useAppStore.getState();
    const dataset = state.datasets.find(d => d.id === id);
    if (!dataset) return [];
    if (!dataset.filters || dataset.filters.length === 0) {
      return dataset.molecules;
    }
    return applyFilters(dataset.molecules, dataset.filters);
  },

  // Actions - Dataset Loading State
  setDatasetLoadingState: (id: string, loadingState: Partial<DatasetLoadingState>) =>
    set((state) => {
      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== id) return dataset;
        return {
          ...dataset,
          loadingState: { ...dataset.loadingState, ...loadingState } as DatasetLoadingState,
        };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, state.activeDatasetId),
      };
    }),

  // Add a placeholder dataset in loading state
  addLoadingDataset: (id: string, name: string) =>
    set((state) => {
      const colorIndex = state.datasets.length % DATASET_COLORS.length;
      const newDataset: Dataset = {
        id,
        name,
        molecules: [],
        valueRange: null,
        color: DATASET_COLORS[colorIndex],
        visible: true,
        pointShape: 'circle',
        loadingState: {
          isLoading: true,
          progress: 0,
          message: 'Starting...',
        },
      };
      const newDatasets = [...state.datasets, newDataset];
      const newActiveId = state.activeDatasetId || newDataset.id;
      return {
        datasets: newDatasets,
        activeDatasetId: newActiveId,
        dataset: getActiveDataset(newDatasets, newActiveId),
      };
    }),

  // Update existing dataset (replace placeholder with full data)
  updateDataset: (id: string, updates: Partial<Dataset>) =>
    set((state) => {
      const datasets = state.datasets.map((dataset) => {
        if (dataset.id !== id) return dataset;
        return { ...dataset, ...updates, loadingState: undefined };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, state.activeDatasetId),
        needsAnalysis: true,
      };
    }),

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

  // Update coordinates for all datasets at once (for combined analysis)
  updateAllCoordinates: (coordinatesMap: Map<string, Map<number, Point2D>>) =>
    set((state) => {
      const datasets = state.datasets.map(dataset => {
        const coords = coordinatesMap.get(dataset.id);
        const molecules = dataset.molecules.map((mol) => {
          const originalIndex = mol.originalIndex;
          const coordinate = originalIndex !== undefined ? coords?.get(originalIndex) : undefined;

          return {
            ...mol,
            coordinates: coordinate,
            cluster: undefined,
            isOutlier: undefined,
          };
        });
        return { ...dataset, molecules };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, state.activeDatasetId),
      };
    }),

  // Update clusters for all datasets (combined analysis)
  updateAllClusters: (clusters: number[]) =>
    set((state) => {
      let globalIndex = 0;
      const datasets = state.datasets.map(dataset => {
        const molecules = dataset.molecules.map((mol) => {
          if (mol.isValid && mol.coordinates) {
            return { ...mol, cluster: clusters[globalIndex++] };
          }
          return mol;
        });
        return { ...dataset, molecules };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, state.activeDatasetId),
        clusterLabels: clusters,
      };
    }),

  // Update outliers for all datasets (combined analysis)
  updateAllOutliers: (outlierIndices: number[]) =>
    set((state) => {
      const outlierSet = new Set(outlierIndices);
      let globalIndex = 0;

      const datasets = state.datasets.map(dataset => {
        const molecules = dataset.molecules.map((mol) => {
          if (mol.isValid && mol.coordinates) {
            const isOutlier = outlierSet.has(globalIndex);
            globalIndex++;
            return { ...mol, isOutlier };
          }
          return mol;
        });
        return { ...dataset, molecules };
      });

      return {
        datasets,
        dataset: getActiveDataset(datasets, state.activeDatasetId),
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
    set((state) => {
      if (state.abortController) {
        state.abortController.abort();
      }
      return {
        datasets: [],
        activeDatasetId: null,
        dataset: null,
        isLoading: false,
        progress: 0,
        progressMessage: '',
        error: null,
        needsAnalysis: false,
        abortController: null,
        clusterLabels: null,
        hoveredIndex: null,
        selectedIndices: [],
        visualization: defaultVisualization,
        toolbar: defaultToolbar,
        clustering: defaultClustering,
        outlierSettings: defaultOutlierSettings,
      };
    }),

  // Actions - Project
  loadProjectState: (projectData) =>
    set((state) => {
      // Cancel any ongoing operations
      if (state.abortController) {
        state.abortController.abort();
      }

      return {
        // Project data
        datasets: projectData.datasets,
        activeDatasetId: projectData.activeDatasetId,
        dataset: getActiveDataset(projectData.datasets, projectData.activeDatasetId),
        drMethod: projectData.drMethod,
        tsneParams: projectData.tsneParams,
        umapParams: projectData.umapParams,
        clustering: projectData.clustering,
        clusterLabels: projectData.clusterLabels,
        outlierSettings: projectData.outlierSettings,
        visualization: projectData.visualization,
        toolbar: projectData.toolbar,
        selectedIndices: projectData.selectedIndices,
        // Reset transient state
        isLoading: false,
        progress: 0,
        progressMessage: '',
        error: null,
        needsAnalysis: false,
        abortController: null,
        hoveredIndex: null,
      };
    }),
}));
