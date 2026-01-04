import { useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { reduceDimensionality } from '../lib/dimensionality';
import { OperationCancelledError } from '../lib/fingerprints';
import { computeKMeans } from '../lib/clustering';
import { removeOutliers } from '../lib/outliers';
import type { DimensionalityMethod } from '../types';

// Icons
const ChevronDownIcon = () => (
  <svg className="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const MethodIcon = () => (
  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
  </svg>
);

const AnalysisIcon = () => (
  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

type SectionId = 'method' | 'analysis';

export function AnalysisPanel() {
  const {
    datasets,
    drMethod,
    tsneParams,
    umapParams,
    isLoading,
    needsAnalysis,
    clustering,
    outlierSettings,
    setDRMethod,
    setTSNEParams,
    setUMAPParams,
    setProgress,
    setLoading,
    setError,
    setNeedsAnalysis,
    setClusteringEnabled,
    setNClusters,
    setOutlierSettings,
    startOperation,
    updateAllCoordinates,
    updateAllClusters,
    updateAllOutliers,
  } = useAppStore();

  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    new Set(['method', 'analysis'])
  );

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Count all valid molecules across all datasets
  const totalValidMolecules = datasets.reduce((sum, ds) => {
    return sum + ds.molecules.filter(m => m.isValid).length;
  }, 0);

  const handleRunAnalysis = useCallback(async () => {
    if (totalValidMolecules === 0) return;

    const abortController = startOperation();
    const signal = abortController.signal;
    setProgress(0, `Running ${drMethod.toUpperCase()}...`);

    try {
      // Collect all fingerprints from all datasets into one combined matrix
      // Keep track of which indices belong to which dataset
      const combinedFingerprints: number[][] = [];
      const datasetRanges: { id: string; start: number; count: number }[] = [];

      for (const ds of datasets) {
        const validMolecules = ds.molecules.filter((m) => m.isValid);
        if (validMolecules.length === 0) continue;

        const start = combinedFingerprints.length;
        for (const mol of validMolecules) {
          combinedFingerprints.push(mol.fingerprint);
        }
        datasetRanges.push({ id: ds.id, start, count: validMolecules.length });
      }

      if (combinedFingerprints.length === 0) {
        setLoading(false);
        return;
      }

      // Run DR on combined fingerprints (all datasets together)
      const coordinates = await reduceDimensionality(
        combinedFingerprints,
        drMethod,
        { tsne: tsneParams, umap: umapParams },
        (p) => {
          const percent = (p.current / p.total) * 100;
          setProgress(percent, `${p.stage.toUpperCase()} ${p.current}/${p.total}`);
        },
        signal
      );

      // Check for cancellation
      if (signal.aborted) throw new OperationCancelledError();

      // Split coordinates back to respective datasets
      const coordinatesMap = new Map<string, typeof coordinates>();
      for (const range of datasetRanges) {
        const dsCoords = coordinates.slice(range.start, range.start + range.count);
        coordinatesMap.set(range.id, dsCoords);
      }
      updateAllCoordinates(coordinatesMap);

      // Clustering on combined coordinates
      if (clustering.enabled && coordinates.length > 0) {
        setProgress(95, 'Computing clusters...');
        const clusterResult = computeKMeans(coordinates, clustering.nClusters);
        updateAllClusters(clusterResult.labels);
      }

      // Outlier detection on combined coordinates
      if (outlierSettings.enabled && coordinates.length > 0) {
        setProgress(98, 'Detecting outliers...');
        const outlierResult = removeOutliers(coordinates, outlierSettings.threshold);
        updateAllOutliers(outlierResult.removedIndices);
      }

      setProgress(100, 'Done!');
      setNeedsAnalysis(false);
      setLoading(false);
    } catch (error) {
      // Don't show error for cancelled operations
      if (error instanceof OperationCancelledError) {
        console.log('Analysis cancelled');
        return;
      }
      console.error('Error in dimensionality reduction:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      setLoading(false);
    }
  }, [
    datasets, totalValidMolecules, drMethod, tsneParams, umapParams, clustering, outlierSettings,
    setLoading, setProgress, updateAllCoordinates, updateAllClusters,
    updateAllOutliers, setError, setNeedsAnalysis, startOperation
  ]);

  const handleMethodChange = (method: DimensionalityMethod) => {
    setDRMethod(method);
    if (totalValidMolecules > 0) {
      setNeedsAnalysis(true);
    }
  };

  const handleRunClustering = useCallback(() => {
    // Collect all coordinates from all datasets
    const allCoordinates: { x: number; y: number }[] = [];
    for (const ds of datasets) {
      const validMolecules = ds.molecules.filter((m) => m.isValid && m.coordinates);
      for (const mol of validMolecules) {
        allCoordinates.push(mol.coordinates!);
      }
    }

    if (allCoordinates.length === 0) return;

    const clusterResult = computeKMeans(allCoordinates, clustering.nClusters);
    updateAllClusters(clusterResult.labels);
  }, [datasets, clustering.nClusters, updateAllClusters]);

  const hasData = datasets.length > 0;

  return (
    <div className="analysis-panel">
      {/* Reanalyze button - always visible at top */}
      <div className="analysis-action-bar">
        <button
          onClick={handleRunAnalysis}
          disabled={isLoading || !hasData}
          className={`btn btn-primary btn-large ${needsAnalysis ? 'btn-accent pulse' : ''}`}
        >
          {isLoading ? 'Processing...' : needsAnalysis ? 'Run Analysis' : 'Reanalyze'}
        </button>
        {needsAnalysis && hasData && (
          <p className="analysis-hint">Settings or data changed. Click to update the plot.</p>
        )}
        {!hasData && (
          <p className="analysis-hint">Load data in the Data tab first.</p>
        )}
      </div>

      {/* Dimensionality Reduction Method */}
      <div className={`settings-section ${openSections.has('method') ? 'open' : ''}`}>
        <div className="section-header" onClick={() => toggleSection('method')}>
          <div className="section-header-left">
            <MethodIcon />
            <span className="section-title">Reduction Method</span>
          </div>
          <ChevronDownIcon />
        </div>
        <div className="section-content">
          <div className="method-selector">
            {(['pca', 'umap', 'tsne'] as const).map((method) => (
              <button
                key={method}
                onClick={() => handleMethodChange(method)}
                disabled={isLoading}
                className={`method-btn ${drMethod === method ? 'active' : ''}`}
              >
                {method.toUpperCase()}
              </button>
            ))}
          </div>

          {drMethod === 'tsne' && (
            <>
              <div className="param-group">
                <div className="param-label">
                  <span className="param-name">Perplexity</span>
                  <span className="param-value">{tsneParams.perplexity}</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={50}
                  value={tsneParams.perplexity}
                  onChange={(e) => {
                    setTSNEParams({ perplexity: parseInt(e.target.value) });
                    if (hasData) setNeedsAnalysis(true);
                  }}
                  disabled={isLoading}
                />
              </div>
              <div className="param-group">
                <div className="param-label">
                  <span className="param-name">Iterations</span>
                  <span className="param-value">{tsneParams.iterations}</span>
                </div>
                <input
                  type="range"
                  min={250}
                  max={2000}
                  step={250}
                  value={tsneParams.iterations}
                  onChange={(e) => {
                    setTSNEParams({ iterations: parseInt(e.target.value) });
                    if (hasData) setNeedsAnalysis(true);
                  }}
                  disabled={isLoading}
                />
              </div>
              <div className="param-group">
                <div className="param-label">
                  <span className="param-name">Learning Rate</span>
                  <span className="param-value">{tsneParams.learningRate}</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={1000}
                  step={10}
                  value={tsneParams.learningRate}
                  onChange={(e) => {
                    setTSNEParams({ learningRate: parseInt(e.target.value) });
                    if (hasData) setNeedsAnalysis(true);
                  }}
                  disabled={isLoading}
                />
              </div>
            </>
          )}

          {drMethod === 'umap' && (
            <>
              <div className="param-group">
                <div className="param-label">
                  <span className="param-name">Neighbors</span>
                  <span className="param-value">{umapParams.nNeighbors}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={100}
                  value={umapParams.nNeighbors}
                  onChange={(e) => {
                    setUMAPParams({ nNeighbors: parseInt(e.target.value) });
                    if (hasData) setNeedsAnalysis(true);
                  }}
                  disabled={isLoading}
                />
              </div>
              <div className="param-group">
                <div className="param-label">
                  <span className="param-name">Min Distance</span>
                  <span className="param-value">{umapParams.minDist.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.99}
                  step={0.01}
                  value={umapParams.minDist}
                  onChange={(e) => {
                    setUMAPParams({ minDist: parseFloat(e.target.value) });
                    if (hasData) setNeedsAnalysis(true);
                  }}
                  disabled={isLoading}
                />
              </div>
              <div className="param-group">
                <div className="param-label">
                  <span className="param-name">Epochs</span>
                  <span className="param-value">{umapParams.nEpochs}</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={1000}
                  step={50}
                  value={umapParams.nEpochs}
                  onChange={(e) => {
                    setUMAPParams({ nEpochs: parseInt(e.target.value) });
                    if (hasData) setNeedsAnalysis(true);
                  }}
                  disabled={isLoading}
                />
              </div>
            </>
          )}

          {drMethod === 'pca' && (
            <p className="param-hint">
              PCA provides a fast, deterministic projection with no adjustable parameters.
            </p>
          )}
        </div>
      </div>

      {/* Analysis Section */}
      <div className={`settings-section ${openSections.has('analysis') ? 'open' : ''}`}>
        <div className="section-header" onClick={() => toggleSection('analysis')}>
          <div className="section-header-left">
            <AnalysisIcon />
            <span className="section-title">Clustering & Outliers</span>
          </div>
          <ChevronDownIcon />
        </div>
        <div className="section-content">
          {/* Clustering */}
          <div className="toggle-container">
            <span className="toggle-label">Clustering</span>
            <label className="toggle">
              <input
                type="checkbox"
                checked={clustering.enabled}
                onChange={(e) => {
                  setClusteringEnabled(e.target.checked);
                  if (hasData) setNeedsAnalysis(true);
                }}
                disabled={isLoading}
              />
              <span className="toggle-track" />
              <span className="toggle-thumb" />
            </label>
          </div>

          {clustering.enabled && (
            <>
              <div className="param-group" style={{ marginTop: 12 }}>
                <div className="param-label">
                  <span className="param-name">Number of Clusters</span>
                  <span className="param-value">{clustering.nClusters}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={clustering.nClusters}
                  onChange={(e) => {
                    setNClusters(parseInt(e.target.value));
                    if (hasData) setNeedsAnalysis(true);
                  }}
                  disabled={isLoading}
                />
              </div>
              {datasets.some(ds => ds.molecules.some(m => m.coordinates)) && (
                <button
                  onClick={handleRunClustering}
                  disabled={isLoading}
                  className="btn btn-secondary"
                  style={{ marginTop: 8 }}
                >
                  Update Clusters Only
                </button>
              )}
            </>
          )}

          {/* Outlier Detection */}
          <div className="toggle-container" style={{ marginTop: 20 }}>
            <span className="toggle-label">Outlier Detection</span>
            <label className="toggle">
              <input
                type="checkbox"
                checked={outlierSettings.enabled}
                onChange={(e) => {
                  setOutlierSettings({ enabled: e.target.checked });
                  if (hasData) setNeedsAnalysis(true);
                }}
                disabled={isLoading}
              />
              <span className="toggle-track" />
              <span className="toggle-thumb" />
            </label>
          </div>

          {outlierSettings.enabled && (
            <div className="param-group" style={{ marginTop: 12 }}>
              <div className="param-label">
                <span className="param-name">Z-Score Threshold</span>
                <span className="param-value">{outlierSettings.threshold.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1.5}
                max={5}
                step={0.1}
                value={outlierSettings.threshold}
                onChange={(e) => {
                  setOutlierSettings({ threshold: parseFloat(e.target.value) });
                  if (hasData) setNeedsAnalysis(true);
                }}
                disabled={isLoading}
              />
              <p className="param-hint">
                Points with Z-score &gt; {outlierSettings.threshold.toFixed(1)} will be marked as outliers
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
