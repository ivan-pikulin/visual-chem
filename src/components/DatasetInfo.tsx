import { useAppStore, DATASET_COLORS } from '../store/useAppStore';
import { CLUSTER_COLORS } from '../lib/clustering';

interface DatasetInfoProps {
  onAddDataset?: () => void;
}

export function DatasetInfo({ onAddDataset }: DatasetInfoProps) {
  const {
    dataset,
    datasets,
    activeDatasetId,
    clustering,
    clusterLabels,
    outlierSettings,
    setActiveDataset,
    removeDataset,
    clearAllDatasets,
  } = useAppStore();

  if (!dataset) return null;

  // Calculate totals across all datasets
  const totalMolecules = datasets.reduce((sum, d) => sum + d.molecules.length, 0);
  const totalValid = datasets.reduce(
    (sum, d) => sum + d.molecules.filter((m) => m.isValid).length,
    0
  );
  const totalInvalid = totalMolecules - totalValid;
  const totalOutliers = datasets.reduce(
    (sum, d) => sum + d.molecules.filter((m) => m.isOutlier).length,
    0
  );

  // Calculate combined value range
  let combinedValueRange: { min: number; max: number } | null = null;
  for (const d of datasets) {
    if (d.valueRange) {
      if (!combinedValueRange) {
        combinedValueRange = { ...d.valueRange };
      } else {
        combinedValueRange.min = Math.min(combinedValueRange.min, d.valueRange.min);
        combinedValueRange.max = Math.max(combinedValueRange.max, d.valueRange.max);
      }
    }
  }

  // Cluster distribution
  const clusterCounts = new Map<number, number>();
  if (clusterLabels) {
    for (const label of clusterLabels) {
      clusterCounts.set(label, (clusterCounts.get(label) || 0) + 1);
    }
  }

  return (
    <div className="dataset-info">
      {/* Dataset cards */}
      <div className="dataset-cards">
        {datasets.map((d, index) => {
          const isActive = d.id === activeDatasetId;
          const validCount = d.molecules.filter((m) => m.isValid).length;
          const color = d.color || DATASET_COLORS[index % DATASET_COLORS.length];

          return (
            <div
              key={d.id}
              className={`dataset-card ${isActive ? 'active' : ''}`}
              style={{ '--dataset-color': color } as React.CSSProperties}
              onClick={() => setActiveDataset(d.id)}
            >
              <div className="dataset-card-header">
                <span
                  className="dataset-card-color"
                  style={{ backgroundColor: color }}
                />
                <span className="dataset-card-name" title={d.name}>
                  {d.name}
                </span>
                <button
                  className="dataset-card-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeDataset(d.id);
                  }}
                  title="Remove dataset"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="dataset-card-stats">
                <span className="dataset-card-count">{validCount}</span>
                <span className="dataset-card-label">molecules</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add dataset button */}
      {onAddDataset && (
        <button className="add-dataset-btn" onClick={onAddDataset}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Dataset
        </button>
      )}

      {/* Summary statistics */}
      <div className="dataset-summary">
        <div className="dataset-summary-header">
          <span className="dataset-summary-title">Summary</span>
          <button onClick={clearAllDatasets} className="clear-button">
            Clear All
          </button>
        </div>

        <div className="dataset-stats">
          <div className="stat-row">
            <span className="stat-label">Total molecules</span>
            <span className="stat-value">{totalMolecules}</span>
          </div>

          <div className="stat-row">
            <span className="stat-label">Valid molecules</span>
            <span className="stat-value success">{totalValid}</span>
          </div>

          {totalInvalid > 0 && (
            <div className="stat-row">
              <span className="stat-label">Invalid SMILES</span>
              <span className="stat-value error">{totalInvalid}</span>
            </div>
          )}

          {outlierSettings.enabled && totalOutliers > 0 && (
            <div className="stat-row">
              <span className="stat-label">Outliers</span>
              <span className="stat-value warning">{totalOutliers}</span>
            </div>
          )}

          {combinedValueRange && (
            <>
              <div className="stat-divider" />
              <div className="stat-row">
                <span className="stat-label">Value range</span>
                <span className="stat-value">
                  {combinedValueRange.min.toFixed(3)} — {combinedValueRange.max.toFixed(3)}
                </span>
              </div>
            </>
          )}

          {clustering.enabled && clusterLabels && (
            <>
              <div className="stat-divider" />
              <div className="stat-row">
                <span className="stat-label">Clusters</span>
                <span className="stat-value">{clustering.nClusters}</span>
              </div>
              <div className="cluster-grid">
                {Array.from({ length: clustering.nClusters }, (_, i) => {
                  const count = clusterCounts.get(i) || 0;
                  const percent = ((count / clusterLabels.length) * 100).toFixed(0);
                  return (
                    <div key={i} className="cluster-item">
                      <span
                        className="cluster-dot"
                        style={{ backgroundColor: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}
                      />
                      <span className="cluster-item-label">C{i + 1}</span>
                      <span className="cluster-item-value">{count}</span>
                      <span className="cluster-item-label">({percent}%)</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {datasets.length > 1 && (
            <>
              <div className="stat-divider" />
              <div className="stat-row">
                <span className="stat-label">Datasets loaded</span>
                <span className="stat-value">{datasets.length}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
