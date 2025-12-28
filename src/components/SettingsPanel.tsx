import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { reduceDimensionality } from '../lib/dimensionality';
import { computeKMeans, CLUSTER_COLORS } from '../lib/clustering';
import { removeOutliers } from '../lib/outliers';
import { exportInteractiveHTML, exportDataAsCSV } from '../lib/export';
import type { DimensionalityMethod, ColorMode } from '../types';

export function SettingsPanel() {
  const {
    dataset,
    drMethod,
    tsneParams,
    umapParams,
    isLoading,
    clustering,
    outlierSettings,
    visualization,
    clusterLabels,
    setDRMethod,
    setTSNEParams,
    setUMAPParams,
    setProgress,
    setLoading,
    updateCoordinates,
    setError,
    setClusteringEnabled,
    setNClusters,
    updateMoleculeClusters,
    setOutlierSettings,
    updateMoleculeOutliers,
    setVisualization,
  } = useAppStore();

  const handleRerun = useCallback(async () => {
    if (!dataset) return;

    const validMolecules = dataset.molecules.filter((m) => m.isValid);
    if (validMolecules.length === 0) return;

    setLoading(true);
    setProgress(0, `Running ${drMethod.toUpperCase()}...`);

    try {
      const fingerprintMatrix = validMolecules.map((m) => m.fingerprint);

      const coordinates = await reduceDimensionality(
        fingerprintMatrix,
        drMethod,
        { tsne: tsneParams, umap: umapParams },
        (p) => {
          const percent = (p.current / p.total) * 100;
          setProgress(percent, `${p.stage.toUpperCase()}: ${p.current}/${p.total}`);
        }
      );

      updateCoordinates(coordinates);

      // Apply clustering if enabled
      if (clustering.enabled && coordinates.length > 0) {
        setProgress(95, 'Computing clusters...');
        const clusterResult = computeKMeans(coordinates, clustering.nClusters);
        updateMoleculeClusters(clusterResult.labels);
      }

      // Apply outlier detection if enabled
      if (outlierSettings.enabled && coordinates.length > 0) {
        setProgress(98, 'Detecting outliers...');
        const outlierResult = removeOutliers(coordinates, outlierSettings.threshold);
        updateMoleculeOutliers(outlierResult.removedIndices);
      }

      setProgress(100, 'Done!');
    } catch (error) {
      console.error('Error in dimensionality reduction:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [
    dataset, drMethod, tsneParams, umapParams, clustering, outlierSettings,
    setLoading, setProgress, updateCoordinates, updateMoleculeClusters,
    updateMoleculeOutliers, setError
  ]);

  const handleMethodChange = (method: DimensionalityMethod) => {
    setDRMethod(method);
  };

  const handleRunClustering = useCallback(() => {
    if (!dataset) return;

    const validMolecules = dataset.molecules.filter((m) => m.isValid && m.coordinates);
    if (validMolecules.length === 0) return;

    const coordinates = validMolecules.map(m => m.coordinates!);
    const clusterResult = computeKMeans(coordinates, clustering.nClusters);
    updateMoleculeClusters(clusterResult.labels);
  }, [dataset, clustering.nClusters, updateMoleculeClusters]);

  const handleExportHTML = useCallback(() => {
    if (!dataset) return;

    const validMolecules = dataset.molecules.filter((m) => m.isValid && m.coordinates);
    if (validMolecules.length === 0) return;

    const x = validMolecules.map((m) => m.coordinates!.x);
    const y = validMolecules.map((m) => m.coordinates!.y);
    const values = validMolecules.map((m) => m.value);

    const plotData: Plotly.Data[] = [{
      type: 'scattergl',
      mode: 'markers',
      x,
      y,
      marker: {
        size: visualization.pointSize,
        color: visualization.colorMode === 'cluster' && clusterLabels
          ? clusterLabels.map(c => CLUSTER_COLORS[c % CLUSTER_COLORS.length])
          : values,
        colorscale: visualization.colorMode === 'value' ? 'Inferno' : undefined,
        colorbar: visualization.colorMode === 'value' ? { title: { text: 'Value' } } : undefined,
        opacity: visualization.pointOpacity,
      },
      text: validMolecules.map((m) => m.smiles),
      hoverinfo: 'text',
    }];

    const layout: Partial<Plotly.Layout> = {
      title: { text: `Visual Chem - ${dataset.name}` },
      xaxis: { title: { text: 'Dimension 1' } },
      yaxis: { title: { text: 'Dimension 2' } },
    };

    exportInteractiveHTML(plotData, layout, `${dataset.name.replace(/\.[^/.]+$/, '')}.html`);
  }, [dataset, visualization, clusterLabels]);

  const handleExportCSV = useCallback(() => {
    if (!dataset) return;

    const validMolecules = dataset.molecules.filter((m) => m.isValid && m.coordinates);
    if (validMolecules.length === 0) return;

    const data = validMolecules.map((m, i) => ({
      smiles: m.smiles,
      value: m.value,
      x: m.coordinates!.x,
      y: m.coordinates!.y,
      cluster: clusterLabels ? clusterLabels[i] : undefined,
    }));

    exportDataAsCSV(data, `${dataset.name.replace(/\.[^/.]+$/, '')}-coordinates.csv`);
  }, [dataset, clusterLabels]);

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
      <h2 className="text-lg font-semibold text-gray-800">Settings</h2>

      {/* Method Selection */}
      <section>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Dimensionality Reduction Method
        </label>
        <div className="flex space-x-2">
          {(['pca', 'umap', 'tsne'] as const).map((method) => (
            <button
              key={method}
              onClick={() => handleMethodChange(method)}
              disabled={isLoading}
              className={`
                px-4 py-2 rounded-md text-sm font-medium transition-colors
                ${drMethod === method
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
                ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {method.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* Method-specific parameters */}
      {drMethod === 'tsne' && (
        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium text-gray-700">t-SNE Parameters</h3>
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Perplexity: {tsneParams.perplexity}
            </label>
            <input
              type="range"
              min={5}
              max={50}
              value={tsneParams.perplexity}
              onChange={(e) => setTSNEParams({ perplexity: parseInt(e.target.value) })}
              disabled={isLoading}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Iterations: {tsneParams.iterations}
            </label>
            <input
              type="range"
              min={250}
              max={2000}
              step={250}
              value={tsneParams.iterations}
              onChange={(e) => setTSNEParams({ iterations: parseInt(e.target.value) })}
              disabled={isLoading}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Learning Rate: {tsneParams.learningRate}
            </label>
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={tsneParams.learningRate}
              onChange={(e) => setTSNEParams({ learningRate: parseInt(e.target.value) })}
              disabled={isLoading}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </section>
      )}

      {drMethod === 'umap' && (
        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium text-gray-700">UMAP Parameters</h3>
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Neighbors: {umapParams.nNeighbors}
            </label>
            <input
              type="range"
              min={2}
              max={100}
              value={umapParams.nNeighbors}
              onChange={(e) => setUMAPParams({ nNeighbors: parseInt(e.target.value) })}
              disabled={isLoading}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Min Distance: {umapParams.minDist.toFixed(2)}
            </label>
            <input
              type="range"
              min={0}
              max={0.99}
              step={0.01}
              value={umapParams.minDist}
              onChange={(e) => setUMAPParams({ minDist: parseFloat(e.target.value) })}
              disabled={isLoading}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Epochs: {umapParams.nEpochs}
            </label>
            <input
              type="range"
              min={100}
              max={1000}
              step={50}
              value={umapParams.nEpochs}
              onChange={(e) => setUMAPParams({ nEpochs: parseInt(e.target.value) })}
              disabled={isLoading}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </section>
      )}

      {drMethod === 'pca' && (
        <section className="border-t pt-4">
          <p className="text-sm text-gray-500">
            PCA provides a fast, deterministic projection with no adjustable parameters.
          </p>
        </section>
      )}

      {/* Clustering Section */}
      <section className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">Clustering</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={clustering.enabled}
              onChange={(e) => setClusteringEnabled(e.target.checked)}
              disabled={isLoading}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
        </div>
        {clustering.enabled && (
          <>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Number of Clusters: {clustering.nClusters}
              </label>
              <input
                type="range"
                min={2}
                max={10}
                value={clustering.nClusters}
                onChange={(e) => setNClusters(parseInt(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            {dataset && (
              <button
                onClick={handleRunClustering}
                disabled={isLoading}
                className="w-full py-1.5 px-3 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors disabled:opacity-50"
              >
                Run Clustering
              </button>
            )}
          </>
        )}
      </section>

      {/* Outlier Detection Section */}
      <section className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">Outlier Detection</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={outlierSettings.enabled}
              onChange={(e) => setOutlierSettings({ enabled: e.target.checked })}
              disabled={isLoading}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
        </div>
        {outlierSettings.enabled && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Z-Score Threshold: {outlierSettings.threshold.toFixed(1)}
            </label>
            <input
              type="range"
              min={1.5}
              max={5}
              step={0.1}
              value={outlierSettings.threshold}
              onChange={(e) => setOutlierSettings({ threshold: parseFloat(e.target.value) })}
              disabled={isLoading}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-1">
              Points with Z-score &gt; {outlierSettings.threshold.toFixed(1)} will be marked as outliers
            </p>
          </div>
        )}
      </section>

      {/* Visualization Settings */}
      <section className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-700">Visualization</h3>

        <div>
          <label className="block text-xs text-gray-600 mb-1">
            Point Size: {visualization.pointSize}
          </label>
          <input
            type="range"
            min={2}
            max={20}
            value={visualization.pointSize}
            onChange={(e) => setVisualization({ pointSize: parseInt(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">
            Point Opacity: {visualization.pointOpacity.toFixed(1)}
          </label>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.1}
            value={visualization.pointOpacity}
            onChange={(e) => setVisualization({ pointOpacity: parseFloat(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-2">Color By</label>
          <div className="flex space-x-2">
            {(['value', 'cluster'] as ColorMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setVisualization({ colorMode: mode })}
                disabled={mode === 'cluster' && !clustering.enabled}
                className={`
                  px-3 py-1.5 rounded text-xs font-medium transition-colors
                  ${visualization.colorMode === mode
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
                  ${mode === 'cluster' && !clustering.enabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {outlierSettings.enabled && (
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="showOutliers"
              checked={visualization.showOutliers}
              onChange={(e) => setVisualization({ showOutliers: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="showOutliers" className="text-xs text-gray-600">
              Show Outliers
            </label>
          </div>
        )}
      </section>

      {/* Rerun button */}
      {dataset && (
        <section className="border-t pt-4">
          <button
            onClick={handleRerun}
            disabled={isLoading}
            className={`
              w-full py-2 px-4 rounded-md text-white font-medium transition-colors
              ${isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700'}
            `}
          >
            {isLoading ? 'Processing...' : 'Rerun Analysis'}
          </button>
        </section>
      )}

      {/* Export Section */}
      {dataset && (
        <section className="border-t pt-4 space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Export</h3>
          <div className="flex space-x-2">
            <button
              onClick={handleExportHTML}
              disabled={isLoading}
              className="flex-1 py-1.5 px-3 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors disabled:opacity-50"
            >
              Export HTML
            </button>
            <button
              onClick={handleExportCSV}
              disabled={isLoading}
              className="flex-1 py-1.5 px-3 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
