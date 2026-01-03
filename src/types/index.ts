export interface MoleculeData {
  smiles: string;
  value?: number; // Optional - for color scale
  label?: string; // Optional - molecule name/identifier
  group?: string; // Optional - categorical grouping
  isValid: boolean;
  svg?: string;
}

// Column mapping for flexible CSV import (supports multiple value/label columns)
export interface ColumnMapping {
  smiles: string; // Required - column name containing SMILES
  values: string[]; // Multiple value columns (numeric)
  labels: string[]; // Multiple label columns (text)
  group?: string; // Optional - single group column for categorical grouping
}

// Active columns for visualization (which ones are currently displayed)
export interface ActiveColumns {
  value?: string; // Which value column to use for color scale
  label?: string; // Which label column to show in tooltips
}

// Column type detection result
export interface ColumnInfo {
  name: string;
  type: 'number' | 'string';
  sampleValues: string[];
}

// Row selection mode for import limiting
export type RowSelectionMode = 'first' | 'last' | 'random';

// Import options for row limiting
export interface ImportOptions {
  limitEnabled: boolean;
  limitCount: number;
  selectionMode: RowSelectionMode;
}

// Parsed CSV data before processing
export interface ParsedCSVData {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
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
  originalRow?: Record<string, unknown>; // Original CSV row data
  originalIndex?: number; // Original row index in CSV
}

export interface Dataset {
  id: string;
  molecules: ProcessedMolecule[];
  valueRange: { min: number; max: number } | null; // null if no value column
  name: string;
  color?: string;
  csvHeaders?: string[]; // Original CSV column headers
  columnMapping?: ColumnMapping; // How columns were mapped
  groups?: string[]; // Unique group values if group column was mapped
  columnInfo?: ColumnInfo[]; // Detected column types and samples
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

export type ColorMode = 'value' | 'cluster' | 'dataset' | 'group';

export interface VisualizationSettings {
  pointSize: number;
  pointOpacity: number;
  colorMode: ColorMode;
  showOutliers: boolean;
  activeColumns: ActiveColumns; // Which columns are active for visualization
}

export interface ClusteringSettings {
  enabled: boolean;
  nClusters: number;
}

export interface OutlierSettings {
  enabled: boolean;
  threshold: number;
}

export type PlotTool =
  // 2D Cartesian
  | 'zoom2d'
  | 'pan2d'
  | 'select2d'
  | 'lasso2d'
  | 'zoomIn2d'
  | 'zoomOut2d'
  | 'autoScale2d'
  | 'resetScale2d'
  // Hover modes
  | 'hoverClosestCartesian'
  | 'hoverCompareCartesian'
  // Drawing tools
  | 'drawline'
  | 'drawopenpath'
  | 'drawclosedpath'
  | 'drawcircle'
  | 'drawrect'
  | 'eraseshape'
  // Spikes & toggle
  | 'toggleSpikelines'
  | 'toggleHover'
  // Export
  | 'toImage'
  | 'sendDataToCloud';

export interface ToolbarSettings {
  enabledTools: PlotTool[];
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
  abortController: AbortController | null; // For cancelling operations

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
  toolbar: ToolbarSettings;
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
  startOperation: () => AbortController; // Start a cancellable operation
  cancelOperation: () => void; // Cancel current operation

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
  setToolbar: (settings: Partial<ToolbarSettings>) => void;
  toggleTool: (tool: PlotTool) => void;
  setHoveredIndex: (index: number | null) => void;
  setSelectedIndices: (indices: number[]) => void;
  setActiveColumns: (columns: Partial<ActiveColumns>) => void;

  // Actions - Column Mapping
  updateColumnMapping: (mapping: Partial<ColumnMapping>) => void;
  addValueColumn: (column: string) => void;
  removeValueColumn: (column: string) => void;
  addLabelColumn: (column: string) => void;
  removeLabelColumn: (column: string) => void;
  setGroupColumn: (column: string | undefined) => void;

  // Actions - Coordinates
  updateCoordinates: (coordinates: Point2D[]) => void;
  updateMoleculeClusters: (clusters: number[]) => void;
  updateMoleculeOutliers: (outlierIndices: number[]) => void;

  // Actions - Reset
  reset: () => void;
}
