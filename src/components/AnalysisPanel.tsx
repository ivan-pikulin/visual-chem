import { useCallback, useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { reduceDimensionality } from '../lib/dimensionality';
import { OperationCancelledError } from '../lib/fingerprints';
import { computeKMeans } from '../lib/clustering';
import { removeOutliers } from '../lib/outliers';
import {
  estimateDRTime,
  formatTimeEstimate,
  getConfidenceLevel,
} from '../lib/timing';
import {
  getTSNERecommendations,
  getUMAPRecommendations,
  isInRecommendedRange,
  getDeviationFromRecommended,
} from '../lib/timing/recommendations';
import type { DimensionalityMethod } from '../types';

// Icons
const WarningIcon = () => (
  <svg className="warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const DataIcon = () => (
  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
  </svg>
);

const MethodIcon = () => (
  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83m-4.48 4.48l-2.83 2.83m0-10.14l2.83 2.83m4.48 4.48l2.83 2.83" />
  </svg>
);

const ParamsIcon = () => (
  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
    <circle cx="12" cy="12" r="4" />
  </svg>
);

const PostProcessIcon = () => (
  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="time-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const CheckIcon = () => (
  <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const InfoIcon = () => (
  <svg className="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

const PlayIcon = () => (
  <svg className="play-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
  </svg>
);

type SectionId = 'data' | 'method' | 'params' | 'postprocess';

interface AnalysisPanelProps {
  onGoToData?: (datasetId?: string) => void;
}

export function AnalysisPanel({ onGoToData }: AnalysisPanelProps) {
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
    new Set(['method', 'params'])
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

  const hasData = datasets.length > 0;

  // Time estimation
  const timeEstimate = useMemo(() => {
    if (totalValidMolecules === 0) return null;
    const ms = estimateDRTime(totalValidMolecules, drMethod, { tsne: tsneParams, umap: umapParams });
    return {
      formatted: formatTimeEstimate(ms),
      ms,
      confidence: getConfidenceLevel(),
    };
  }, [totalValidMolecules, drMethod, tsneParams, umapParams]);

  // Smart recommendations
  const tsneRecs = useMemo(() => {
    if (totalValidMolecules < 10) return null;
    return getTSNERecommendations(totalValidMolecules);
  }, [totalValidMolecules]);

  const umapRecs = useMemo(() => {
    if (totalValidMolecules < 10) return null;
    return getUMAPRecommendations(totalValidMolecules);
  }, [totalValidMolecules]);

  // Check if current params are in recommended range
  const perplexityStatus = useMemo(() => {
    if (!tsneRecs) return null;
    const inRange = isInRecommendedRange(tsneParams.perplexity, tsneRecs.perplexity.range);
    const deviation = getDeviationFromRecommended(tsneParams.perplexity, tsneRecs.perplexity.range);
    return { inRange, deviation, rec: tsneRecs.perplexity };
  }, [tsneParams.perplexity, tsneRecs]);

  const neighborsStatus = useMemo(() => {
    if (!umapRecs) return null;
    const inRange = isInRecommendedRange(umapParams.nNeighbors, umapRecs.nNeighbors.range);
    const deviation = getDeviationFromRecommended(umapParams.nNeighbors, umapRecs.nNeighbors.range);
    return { inRange, deviation, rec: umapRecs.nNeighbors };
  }, [umapParams.nNeighbors, umapRecs]);

  // Apply recommended params
  const applyTSNERecommendations = useCallback(() => {
    if (!tsneRecs) return;
    setTSNEParams(tsneRecs.params);
    if (hasData) setNeedsAnalysis(true);
  }, [tsneRecs, setTSNEParams, hasData, setNeedsAnalysis]);

  const applyUMAPRecommendations = useCallback(() => {
    if (!umapRecs) return;
    setUMAPParams(umapRecs.params);
    if (hasData) setNeedsAnalysis(true);
  }, [umapRecs, setUMAPParams, hasData, setNeedsAnalysis]);

  const handleRunAnalysis = useCallback(async () => {
    if (totalValidMolecules === 0) return;

    const abortController = startOperation();
    const signal = abortController.signal;
    setProgress(0, `Running ${drMethod.toUpperCase()}...`);

    try {
      // Collect all fingerprints from all datasets into one combined matrix
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

      // Run DR on combined fingerprints
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

  // Find datasets that need configuration
  const unconfiguredDatasets = useMemo(() => {
    return datasets.filter(ds => !ds.columnMapping?.smiles);
  }, [datasets]);

  // Count datasets that will be processed
  const configuredDatasets = useMemo(() => {
    return datasets.filter(ds => ds.columnMapping?.smiles);
  }, [datasets]);

  const canRun = hasData && configuredDatasets.length > 0 && !isLoading;

  return (
    <div className="analysis-panel-new">
      {/* Warning for unconfigured datasets */}
      {unconfiguredDatasets.length > 0 && (
        <div className="analysis-warning-box">
          <div className="analysis-warning-header">
            <WarningIcon />
            <span>{unconfiguredDatasets.length} dataset{unconfiguredDatasets.length > 1 ? 's' : ''} will be skipped</span>
          </div>
          <ul className="analysis-warning-list">
            {unconfiguredDatasets.map(ds => (
              <li key={ds.id} className="analysis-warning-item">
                <span className="analysis-warning-name">{ds.name}</span>
                <span className="analysis-warning-reason">— SMILES not configured</span>
                {onGoToData && (
                  <button
                    className="analysis-warning-link"
                    onClick={() => onGoToData(ds.id)}
                  >
                    Configure →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="analysis-sections">
        {/* Data Summary Section */}
        <div className={`settings-section ${openSections.has('data') ? 'open' : ''}`}>
          <div className="section-header" onClick={() => toggleSection('data')}>
            <div className="section-header-left">
              <DataIcon />
              <span className="section-title">Data Summary</span>
            </div>
            <div className="section-header-right">
              <span className="section-badge">
                {configuredDatasets.length} dataset{configuredDatasets.length !== 1 ? 's' : ''} • {totalValidMolecules.toLocaleString()} molecules
              </span>
              <ChevronDownIcon />
            </div>
          </div>
          <div className="section-content">
            {configuredDatasets.length > 0 ? (
              <div className="data-summary-list">
                {configuredDatasets.map(ds => {
                  const validCount = ds.molecules.filter(m => m.isValid).length;
                  return (
                    <div key={ds.id} className="data-summary-item">
                      <span
                        className="data-summary-dot"
                        style={{ backgroundColor: ds.color }}
                      />
                      <span className="data-summary-name">{ds.name}</span>
                      <span className="data-summary-count">{validCount.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty-state-text">
                No datasets configured. Go to Data tab to load and configure datasets.
              </p>
            )}
          </div>
        </div>

        {/* Reduction Method Section */}
        <div className={`settings-section ${openSections.has('method') ? 'open' : ''}`}>
          <div className="section-header" onClick={() => toggleSection('method')}>
            <div className="section-header-left">
              <MethodIcon />
              <span className="section-title">Reduction Method</span>
            </div>
            <div className="section-header-right">
              <span className="section-badge section-badge-accent">{drMethod.toUpperCase()}</span>
              <ChevronDownIcon />
            </div>
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
                  <span className="method-btn-name">{method.toUpperCase()}</span>
                  <span className="method-btn-desc">
                    {method === 'pca' && 'Fast, linear'}
                    {method === 'umap' && 'Balanced'}
                    {method === 'tsne' && 'Best quality'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Parameters Section - only for UMAP/t-SNE */}
        {drMethod !== 'pca' && (
          <div className={`settings-section ${openSections.has('params') ? 'open' : ''}`}>
            <div className="section-header" onClick={() => toggleSection('params')}>
              <div className="section-header-left">
                <ParamsIcon />
                <span className="section-title">{drMethod.toUpperCase()} Parameters</span>
              </div>
              <ChevronDownIcon />
            </div>
            <div className="section-content">
              {drMethod === 'tsne' && (
                <>
                  {tsneRecs && (
                    <button
                      className="btn btn-secondary btn-sm apply-recommended-btn"
                      onClick={applyTSNERecommendations}
                      disabled={isLoading}
                    >
                      <CheckIcon />
                      Apply recommended for {totalValidMolecules.toLocaleString()} molecules
                    </button>
                  )}

                  <div className="param-group">
                    <div className="param-label">
                      <span className="param-name">Perplexity</span>
                      <span className={`param-value ${perplexityStatus?.inRange ? '' : 'param-value-warning'}`}>
                        {tsneParams.perplexity}
                        {perplexityStatus && !perplexityStatus.inRange && (
                          <span className="param-deviation">
                            ({perplexityStatus.deviation.direction === 'low' ? '↓' : '↑'})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="param-slider-container">
                      <input
                        type="range"
                        min={perplexityStatus?.rec.range.min ?? 5}
                        max={perplexityStatus?.rec.range.max ?? 50}
                        value={tsneParams.perplexity}
                        onChange={(e) => {
                          setTSNEParams({ perplexity: parseInt(e.target.value) });
                          if (hasData) setNeedsAnalysis(true);
                        }}
                        disabled={isLoading}
                      />
                      {perplexityStatus && (
                        <div
                          className="param-recommended-marker"
                          style={{
                            left: `${((perplexityStatus.rec.range.recommended - perplexityStatus.rec.range.min) /
                              (perplexityStatus.rec.range.max - perplexityStatus.rec.range.min)) * 100}%`
                          }}
                          title={`Recommended: ${perplexityStatus.rec.range.recommended}`}
                        />
                      )}
                    </div>
                    {perplexityStatus && (
                      <p className="param-hint param-recommendation">
                        <InfoIcon />
                        {perplexityStatus.rec.range.description}
                      </p>
                    )}
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
                    <p className="param-hint">More iterations = better quality, slower</p>
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
                  {umapRecs && (
                    <button
                      className="btn btn-secondary btn-sm apply-recommended-btn"
                      onClick={applyUMAPRecommendations}
                      disabled={isLoading}
                    >
                      <CheckIcon />
                      Apply recommended for {totalValidMolecules.toLocaleString()} molecules
                    </button>
                  )}

                  <div className="param-group">
                    <div className="param-label">
                      <span className="param-name">Neighbors</span>
                      <span className={`param-value ${neighborsStatus?.inRange ? '' : 'param-value-warning'}`}>
                        {umapParams.nNeighbors}
                        {neighborsStatus && !neighborsStatus.inRange && (
                          <span className="param-deviation">
                            ({neighborsStatus.deviation.direction === 'low' ? '↓' : '↑'})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="param-slider-container">
                      <input
                        type="range"
                        min={neighborsStatus?.rec.range.min ?? 2}
                        max={neighborsStatus?.rec.range.max ?? 100}
                        value={umapParams.nNeighbors}
                        onChange={(e) => {
                          setUMAPParams({ nNeighbors: parseInt(e.target.value) });
                          if (hasData) setNeedsAnalysis(true);
                        }}
                        disabled={isLoading}
                      />
                      {neighborsStatus && (
                        <div
                          className="param-recommended-marker"
                          style={{
                            left: `${((neighborsStatus.rec.range.recommended - neighborsStatus.rec.range.min) /
                              (neighborsStatus.rec.range.max - neighborsStatus.rec.range.min)) * 100}%`
                          }}
                          title={`Recommended: ${neighborsStatus.rec.range.recommended}`}
                        />
                      )}
                    </div>
                    {neighborsStatus && (
                      <p className="param-hint param-recommendation">
                        <InfoIcon />
                        {neighborsStatus.rec.range.description}
                      </p>
                    )}
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
                    <p className="param-hint">Lower = tighter clusters, higher = more spread</p>
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
                    <p className="param-hint">More epochs = better convergence, slower</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* PCA info when selected */}
        {drMethod === 'pca' && (
          <div className="pca-info-box">
            <InfoIcon />
            <span>PCA is fast and deterministic with no adjustable parameters.</span>
          </div>
        )}

        {/* Post-Processing Section */}
        <div className={`settings-section ${openSections.has('postprocess') ? 'open' : ''}`}>
          <div className="section-header" onClick={() => toggleSection('postprocess')}>
            <div className="section-header-left">
              <PostProcessIcon />
              <span className="section-title">Post-Processing</span>
            </div>
            <div className="section-header-right">
              {(clustering.enabled || outlierSettings.enabled) && (
                <span className="section-badge">
                  {[clustering.enabled && 'Clustering', outlierSettings.enabled && 'Outliers'].filter(Boolean).join(' + ')}
                </span>
              )}
              <ChevronDownIcon />
            </div>
          </div>
          <div className="section-content">
            {/* Clustering */}
            <div className="postprocess-block">
              <div className="toggle-container">
                <span className="toggle-label">K-Means Clustering</span>
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
                  <div className="param-group">
                    <div className="param-label">
                      <span className="param-name">Number of Clusters (K)</span>
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
                      className="btn btn-secondary btn-sm"
                    >
                      Update Clusters Only
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Outlier Detection */}
            <div className="postprocess-block">
              <div className="toggle-container">
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
                <div className="param-group">
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
      </div>

      {/* Sticky Footer - Run Analysis */}
      <div className="analysis-footer">
        <div className="analysis-footer-content">
          {needsAnalysis && canRun && (
            <p className="analysis-footer-hint">Settings changed — click to update</p>
          )}
          {!hasData && (
            <p className="analysis-footer-hint">Load data in the Data tab first</p>
          )}
          {hasData && configuredDatasets.length === 0 && (
            <p className="analysis-footer-hint">Configure SMILES column for at least one dataset</p>
          )}

          <div className="analysis-footer-row">
            <button
              onClick={handleRunAnalysis}
              disabled={!canRun}
              className={`btn btn-primary btn-large analysis-run-btn ${needsAnalysis && canRun ? 'btn-accent pulse' : ''}`}
            >
              <PlayIcon />
              {isLoading ? 'Processing...' : needsAnalysis ? 'Run Analysis' : 'Reanalyze'}
            </button>

            {timeEstimate && !isLoading && canRun && (
              <div className={`time-estimate time-estimate-${timeEstimate.confidence}`} title="Estimated time">
                <ClockIcon />
                <span>{timeEstimate.formatted}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
