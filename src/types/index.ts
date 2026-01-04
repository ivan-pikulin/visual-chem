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
  label?: string; // Which label column to show in tooltips (deprecated, use labelTemplate)
  labelTemplate?: string; // Template string with @column placeholders, e.g., "Name: @name, Value: @logK"
}

// Per-dataset display settings
export interface DatasetDisplaySettings {
  labelTemplate?: string; // Template string with @column placeholders
  valueExpression?: string; // Expression for value calculation, e.g., "@pKi" or "abs(@a - @b)"
}

// Per-dataset loading state for non-blocking background processing
export interface DatasetLoadingState {
  isLoading: boolean;
  progress: number; // 0-100
  message: string;
  error?: string;
}

// Column type detection result
export interface ColumnInfo {
  name: string;
  type: 'number' | 'string';
  sampleValues: string[];
  uniqueCount?: number; // For determining if column is categorical
  uniqueValues?: string[]; // Unique values if categorical (<=15 unique)
}

// ========================================
// Column Filters
// ========================================

export type NumericOperator = 'between' | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
export type TextOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'regex';

export interface NumericFilter {
  type: 'numeric';
  column: string;
  operator: NumericOperator;
  value?: number;
  min?: number;
  max?: number;
}

export interface TextFilter {
  type: 'text';
  column: string;
  operator: TextOperator;
  value: string;
  caseSensitive: boolean;
}

export interface CategoryFilter {
  type: 'category';
  column: string;
  selectedValues: string[];
  excludeMode?: boolean; // If true, exclude selectedValues instead of include
}

export type ColumnFilter = NumericFilter | TextFilter | CategoryFilter;

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

// Point shape options for scatter plot
export type PointShape = 'circle' | 'square' | 'diamond' | 'triangle-up' | 'cross' | 'star';

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
  // Plot settings per dataset
  visible?: boolean; // Whether to show in plot (default true)
  pointShape?: PointShape; // Point marker shape (default 'circle')
  pointSize?: number; // Individual point size override (optional)
  // Data processing settings
  processLimit?: number; // Max rows to process (null = all)
  totalRows?: number; // Total rows in original CSV
  // Per-dataset display settings
  displaySettings?: DatasetDisplaySettings;
  // Loading state for background processing
  loadingState?: DatasetLoadingState;
  // Column filters
  filters?: ColumnFilter[];
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

// .vchem project file format types
export interface VChemManifest {
  version: string;
  format: 'vchem';
  createdAt: string;
  updatedAt: string;
  application: {
    name: string;
    version: string;
  };
  compression: {
    method: 'deflate';
    fingerprintsFormat: 'base64';
    svgCompression: boolean;
  };
}

export interface VChemProject {
  activeDatasetId: string | null;
  drMethod: DimensionalityMethod;
  tsneParams: TSNEParams;
  umapParams: UMAPParams;
  clustering: ClusteringSettings;
  clusterLabels: number[] | null;
  outlierSettings: OutlierSettings;
  visualization: VisualizationSettings;
  toolbar: ToolbarSettings;
  datasetIds: string[];
}

export interface VChemDatasetMetadata {
  id: string;
  name: string;
  color?: string;
  visible?: boolean;
  pointShape?: PointShape;
  pointSize?: number;
  valueRange: { min: number; max: number } | null;
  csvHeaders?: string[];
  columnMapping?: ColumnMapping;
  columnInfo?: ColumnInfo[];
  groups?: string[];
  displaySettings?: DatasetDisplaySettings;
  totalRows?: number;
  moleculeCount: number;
  filters?: ColumnFilter[];
}

export interface VChemMoleculeData {
  smiles: string;
  value?: number;
  label?: string;
  group?: string;
  isValid: boolean;
  coordinates?: Point2D;
  cluster?: number;
  isOutlier?: boolean;
  originalIndex?: number;
  originalRow?: Record<string, unknown>;
}

export interface VChemFingerprints {
  encoding: 'base64';
  bitLength: number;
  data: string[];
}

export interface VChemImages {
  compression: 'none';
  images: Record<string, string>;
}

export interface VChemState {
  selectedIndices: number[];
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

  // Actions - Dataset display settings
  setDatasetVisible: (id: string, visible: boolean) => void;
  setDatasetPointShape: (id: string, shape: PointShape) => void;
  setDatasetPointSize: (id: string, size: number | undefined) => void;
  setDatasetColor: (id: string, color: string) => void;
  setAllDatasetsVisible: (visible: boolean) => void;

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
  setSmilesColumn: (column: string) => void;

  // Actions - Dataset Display Settings
  setDatasetDisplaySettings: (id: string, settings: Partial<DatasetDisplaySettings>) => void;

  // Actions - Column Filters
  setDatasetFilters: (id: string, filters: ColumnFilter[]) => void;
  addDatasetFilter: (id: string, filter: ColumnFilter) => void;
  removeDatasetFilter: (id: string, columnName: string) => void;
  clearDatasetFilters: (id: string) => void;
  getFilteredMolecules: (id: string) => ProcessedMolecule[];

  // Actions - Dataset Loading State
  setDatasetLoadingState: (id: string, state: Partial<DatasetLoadingState>) => void;
  addLoadingDataset: (id: string, name: string) => void; // Add placeholder dataset with loading state
  updateDataset: (id: string, updates: Partial<Dataset>) => void; // Update existing dataset (complete loading)

  // Actions - Coordinates
  updateCoordinates: (coordinates: Point2D[]) => void;
  updateAllCoordinates: (coordinatesMap: Map<string, Point2D[]>) => void;
  updateAllClusters: (clusters: number[]) => void;
  updateAllOutliers: (outlierIndices: number[]) => void;
  updateMoleculeClusters: (clusters: number[]) => void;
  updateMoleculeOutliers: (outlierIndices: number[]) => void;

  // Actions - Reset
  reset: () => void;

  // Actions - Project
  loadProjectState: (projectData: {
    datasets: Dataset[];
    activeDatasetId: string | null;
    drMethod: DimensionalityMethod;
    tsneParams: TSNEParams;
    umapParams: UMAPParams;
    clustering: ClusteringSettings;
    clusterLabels: number[] | null;
    outlierSettings: OutlierSettings;
    visualization: VisualizationSettings;
    toolbar: ToolbarSettings;
    selectedIndices: number[];
  }) => void;
}
