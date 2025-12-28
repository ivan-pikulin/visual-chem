import { useAppStore } from '../store/useAppStore';
import { CLUSTER_COLORS } from '../lib/clustering';

export function DatasetInfo() {
  const {
    dataset,
    datasets,
    clustering,
    clusterLabels,
    outlierSettings,
    reset,
  } = useAppStore();

  if (!dataset) return null;

  const validCount = dataset.molecules.filter((m) => m.isValid).length;
  const invalidCount = dataset.molecules.length - validCount;
  const outlierCount = dataset.molecules.filter((m) => m.isOutlier).length;

  // Cluster distribution
  const clusterCounts = new Map<number, number>();
  if (clusterLabels) {
    for (const label of clusterLabels) {
      clusterCounts.set(label, (clusterCounts.get(label) || 0) + 1);
    }
  }

  return (
    <div className="dataset-info">
      <div className="dataset-info-header">
        <span className="dataset-info-title" title={dataset.name}>
          {dataset.name}
        </span>
        <button onClick={reset} className="clear-button">
          Clear
        </button>
      </div>

      <div className="dataset-stats">
        <div className="stat-row">
          <span className="stat-label">Total molecules</span>
          <span className="stat-value">{dataset.molecules.length}</span>
        </div>

        <div className="stat-row">
          <span className="stat-label">Valid molecules</span>
          <span className="stat-value success">{validCount}</span>
        </div>

        {invalidCount > 0 && (
          <div className="stat-row">
            <span className="stat-label">Invalid SMILES</span>
            <span className="stat-value error">{invalidCount}</span>
          </div>
        )}

        {outlierSettings.enabled && outlierCount > 0 && (
          <div className="stat-row">
            <span className="stat-label">Outliers</span>
            <span className="stat-value warning">{outlierCount}</span>
          </div>
        )}

        <div className="stat-divider" />

        <div className="stat-row">
          <span className="stat-label">Value range</span>
          <span className="stat-value">
            {dataset.valueRange.min.toFixed(3)} — {dataset.valueRange.max.toFixed(3)}
          </span>
        </div>

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
  );
}
