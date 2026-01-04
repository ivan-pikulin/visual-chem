import { useCallback, useMemo } from 'react';
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

// Tooltip component for parameter hints
const ParamTooltip = ({ text }: { text: string }) => (
  <span className="param-tooltip-wrapper">
    <span className="param-tooltip-icon">i</span>
    <span className="param-tooltip-text">{text}</span>
  </span>
);

const PlayIcon = () => (
  <svg className="play-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
  </svg>
);

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

      {/* Compact Data Summary Bar */}
      {configuredDatasets.length > 0 && (
        <div className="data-summary-bar">
          <div className="data-summary-bar-left">
            <div className="data-summary-bar-icon">
              <DataIcon />
            </div>
            <div className="data-summary-bar-text">
              <span className="data-summary-bar-title">
                {totalValidMolecules.toLocaleString()} molecules ready
              </span>
              <span className="data-summary-bar-meta">
                2048-bit fingerprints
              </span>
            </div>
          </div>
          <div className="data-summary-bar-right">
            {configuredDatasets.map(ds => (
              <div key={ds.id} className="dataset-chip">
                <span className="dataset-chip-dot" style={{ backgroundColor: ds.color }} />
                {ds.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two column grid */}
      <div className="analysis-grid">
        {/* Method Selection */}
        <div className="analysis-card-compact">
          <div className="card-title">Reduction Method</div>
          <div className="method-selector-wide">
            {(['pca', 'umap', 'tsne'] as const).map((method) => (
              <button
                key={method}
                onClick={() => handleMethodChange(method)}
                disabled={isLoading}
                className={`method-btn ${drMethod === method ? 'active' : ''}`}
              >
                <span className="method-btn-name">{method === 'tsne' ? 't-SNE' : method.toUpperCase()}</span>
                <span className="method-btn-desc">
                  {method === 'pca' && 'Fast, linear'}
                  {method === 'umap' && 'Balanced'}
                  {method === 'tsne' && 'Best quality'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Parameters */}
        <div className="analysis-card-compact">
          {drMethod === 'pca' ? (
            <>
              <div className="card-title">PCA</div>
              <div className="pca-info-box" style={{ margin: 0, border: 'none', background: 'transparent', padding: 0 }}>
                <InfoIcon />
                <span>Fast and deterministic with no adjustable parameters.</span>
              </div>
            </>
          ) : (
            <>
              <div className="params-header">
                <div className="card-title">{drMethod === 'tsne' ? 't-SNE' : 'UMAP'} Parameters</div>
                {(drMethod === 'tsne' ? tsneRecs : umapRecs) && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={drMethod === 'tsne' ? applyTSNERecommendations : applyUMAPRecommendations}
                    disabled={isLoading}
                    style={{ padding: '4px 10px', fontSize: '11px' }}
                  >
                    <CheckIcon />
                    Apply recommended
                  </button>
                )}
              </div>
              <div className="params-grid">
                {drMethod === 'tsne' && (
                  <>
                    <div className="param-group">
                      <div className="param-label">
                        <span className="param-name">
                          Perplexity
                          <ParamTooltip text="Balance between local and global structure. Lower values focus on local clusters, higher values preserve global relationships." />
                        </span>
                        <span className={`param-value ${perplexityStatus?.inRange ? '' : 'param-value-warning'}`}>
                          {tsneParams.perplexity}
                        </span>
                      </div>
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
                    </div>
                    <div className="param-group">
                      <div className="param-label">
                        <span className="param-name">
                          Iterations
                          <ParamTooltip text="Number of optimization steps. More iterations improve quality but take longer." />
                        </span>
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
                        <span className="param-name">
                          Learning Rate
                          <ParamTooltip text="Step size for optimization. Too high may cause instability, too low slows convergence." />
                        </span>
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
                        <span className="param-name">
                          Neighbors
                          <ParamTooltip text="Number of neighbors to consider. Lower values capture fine detail, higher values preserve broader topology." />
                        </span>
                        <span className={`param-value ${neighborsStatus?.inRange ? '' : 'param-value-warning'}`}>
                          {umapParams.nNeighbors}
                        </span>
                      </div>
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
                    </div>
                    <div className="param-group">
                      <div className="param-label">
                        <span className="param-name">
                          Min Distance
                          <ParamTooltip text="Minimum distance between points. Lower values create tighter clusters, higher values spread points more evenly." />
                        </span>
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
                        <span className="param-name">
                          Epochs
                          <ParamTooltip text="Training iterations. More epochs improve embedding quality but increase computation time." />
                        </span>
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
              </div>
            </>
          )}
        </div>

        {/* Post-Processing - full width */}
        <div className="analysis-card-compact analysis-grid-full">
          <div className="card-title">Post-Processing</div>
          <div className="postprocess-row">
            {/* Clustering */}
            <div className="postprocess-item">
              <div className="postprocess-toggle-group">
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
                <span className="postprocess-label">
                  K-Means Clustering
                  <ParamTooltip text="Group molecules into K clusters based on their positions in the reduced space." />
                </span>
              </div>
              <div className="postprocess-control">
                <span className="postprocess-input-label">
                  K
                  <ParamTooltip text="Number of clusters to create. Choose based on expected groupings in your data." />
                </span>
                <input
                  type="number"
                  className="postprocess-input"
                  value={clustering.nClusters}
                  min={2}
                  max={10}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (val >= 2 && val <= 10) {
                      setNClusters(val);
                      if (hasData) setNeedsAnalysis(true);
                    }
                  }}
                  disabled={isLoading || !clustering.enabled}
                />
              </div>
            </div>

            {/* Outliers */}
            <div className="postprocess-item">
              <div className="postprocess-toggle-group">
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
                <span className="postprocess-label">
                  Remove Outliers
                  <ParamTooltip text="Hide molecules that are statistically distant from the main distribution." />
                </span>
              </div>
              <div className="postprocess-control">
                <span className="postprocess-input-label">
                  σ
                  <ParamTooltip text="Standard deviations threshold. Lower values remove more points, higher values keep more." />
                </span>
                <input
                  type="number"
                  className="postprocess-input"
                  value={outlierSettings.threshold}
                  min={1.5}
                  max={5}
                  step={0.1}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (val >= 1.5 && val <= 5) {
                      setOutlierSettings({ threshold: val });
                      if (hasData) setNeedsAnalysis(true);
                    }
                  }}
                  disabled={isLoading || !outlierSettings.enabled}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Footer */}
      <div className="analysis-footer-wide">
        <div className="footer-info">
          <div className="footer-status-item">
            <span className="footer-status-dot" />
            {totalValidMolecules.toLocaleString()} molecules
          </div>
          <div className="footer-status-item">
            <MethodIcon />
            {drMethod === 'tsne' ? 't-SNE' : drMethod.toUpperCase()}
          </div>
          {clustering.enabled && (
            <div className="footer-status-item">
              <PostProcessIcon />
              K={clustering.nClusters}
            </div>
          )}
        </div>
        <div className="footer-actions">
          {timeEstimate && !isLoading && canRun && (
            <div className={`time-estimate time-estimate-${timeEstimate.confidence}`} title="Estimated time">
              <ClockIcon />
              <span>{timeEstimate.formatted}</span>
            </div>
          )}
          <button
            onClick={handleRunAnalysis}
            disabled={!canRun}
            className={`btn btn-primary analysis-run-btn ${needsAnalysis && canRun ? 'btn-accent pulse' : ''}`}
          >
            <PlayIcon />
            {isLoading ? 'Processing...' : needsAnalysis ? 'Run Analysis' : 'Reanalyze'}
          </button>
        </div>
      </div>
    </div>
  );
}
