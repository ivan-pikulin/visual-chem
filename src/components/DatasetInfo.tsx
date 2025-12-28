import { useAppStore } from '../store/useAppStore';

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
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-start mb-3">
        <h2 className="text-lg font-semibold text-gray-800">Dataset Info</h2>
        <button
          onClick={reset}
          className="text-sm text-red-600 hover:text-red-800 transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">File:</span>
          <span className="font-medium text-gray-800 truncate ml-2" title={dataset.name}>
            {dataset.name}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Total molecules:</span>
          <span className="font-medium text-gray-800">{dataset.molecules.length}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Valid molecules:</span>
          <span className="font-medium text-green-600">{validCount}</span>
        </div>

        {invalidCount > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Invalid SMILES:</span>
            <span className="font-medium text-red-600">{invalidCount}</span>
          </div>
        )}

        {outlierSettings.enabled && outlierCount > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Outliers:</span>
            <span className="font-medium text-orange-600">{outlierCount}</span>
          </div>
        )}

        <div className="border-t pt-2 mt-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Value range:</span>
            <span className="font-medium text-gray-800">
              {dataset.valueRange.min.toFixed(3)} - {dataset.valueRange.max.toFixed(3)}
            </span>
          </div>
        </div>

        {clustering.enabled && clusterLabels && (
          <div className="border-t pt-2 mt-2">
            <p className="text-gray-600 mb-1">Cluster distribution:</p>
            <div className="grid grid-cols-2 gap-1">
              {Array.from({ length: clustering.nClusters }, (_, i) => {
                const count = clusterCounts.get(i) || 0;
                const percent = ((count / clusterLabels.length) * 100).toFixed(1);
                return (
                  <div key={i} className="text-xs">
                    <span className="text-gray-500">C{i + 1}:</span>{' '}
                    <span className="font-medium">{count}</span>{' '}
                    <span className="text-gray-400">({percent}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {datasets.length > 1 && (
          <div className="border-t pt-2 mt-2">
            <p className="text-gray-600 text-xs">
              {datasets.length} datasets loaded
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
