import { useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { reduceDimensionality } from '../lib/dimensionality';
import { computeKMeans, CLUSTER_COLORS } from '../lib/clustering';
import { removeOutliers } from '../lib/outliers';
import { exportInteractiveHTML, exportDataAsCSV } from '../lib/export';
import type { DimensionalityMethod, ColorMode, PlotTool } from '../types';

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

const PaletteIcon = () => (
  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 21a9 9 0 110-18 9 9 0 019 9c0 1.5-.5 3-1.5 4-.8.8-2 1-3 .5-.5-.3-1-.8-1-1.5V12m0 0a2 2 0 10-4 0 2 2 0 004 0z" />
    <circle cx="7.5" cy="10.5" r="1.5" />
    <circle cx="12" cy="7.5" r="1.5" />
    <circle cx="16.5" cy="10.5" r="1.5" />
  </svg>
);

const ExportIcon = () => (
  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const ToolbarIcon = () => (
  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

// Tool definitions with labels - organized by category
const TOOL_CATEGORIES: { category: string; tools: { id: PlotTool; label: string; description: string }[] }[] = [
  {
    category: 'Navigation',
    tools: [
      { id: 'pan2d', label: 'Pan', description: 'Drag to pan the view' },
      { id: 'zoom2d', label: 'Zoom Box', description: 'Draw rectangle to zoom' },
      { id: 'zoomIn2d', label: 'Zoom In', description: 'Zoom in incrementally' },
      { id: 'zoomOut2d', label: 'Zoom Out', description: 'Zoom out incrementally' },
      { id: 'autoScale2d', label: 'Auto Scale', description: 'Auto-scale axes' },
      { id: 'resetScale2d', label: 'Reset View', description: 'Reset to original view' },
    ],
  },
  {
    category: 'Selection',
    tools: [
      { id: 'select2d', label: 'Box Select', description: 'Select points with rectangle' },
      { id: 'lasso2d', label: 'Lasso Select', description: 'Select points with freeform lasso' },
    ],
  },
  {
    category: 'Drawing',
    tools: [
      { id: 'drawline', label: 'Draw Line', description: 'Draw a line annotation' },
      { id: 'drawrect', label: 'Draw Rectangle', description: 'Draw a rectangle shape' },
      { id: 'drawcircle', label: 'Draw Circle', description: 'Draw a circle/ellipse shape' },
      { id: 'drawopenpath', label: 'Draw Path', description: 'Draw an open path' },
      { id: 'drawclosedpath', label: 'Draw Polygon', description: 'Draw a closed polygon' },
      { id: 'eraseshape', label: 'Erase Shape', description: 'Erase drawn shapes' },
    ],
  },
  {
    category: 'Hover & Spikes',
    tools: [
      { id: 'hoverClosestCartesian', label: 'Hover Closest', description: 'Show data for closest point' },
      { id: 'hoverCompareCartesian', label: 'Hover Compare', description: 'Compare data on hover' },
      { id: 'toggleSpikelines', label: 'Spike Lines', description: 'Toggle spike lines on hover' },
      { id: 'toggleHover', label: 'Toggle Hover', description: 'Toggle hover mode' },
    ],
  },
  {
    category: 'Export',
    tools: [
      { id: 'toImage', label: 'Save Image', description: 'Download plot as PNG' },
      { id: 'sendDataToCloud', label: 'Edit in Studio', description: 'Edit in Plotly Chart Studio' },
    ],
  },
];

type SectionId = 'method' | 'analysis' | 'visualization' | 'toolbar' | 'export';

export function SettingsPanel() {
  const {
    dataset,
    drMethod,
    tsneParams,
    umapParams,
    isLoading,
    needsAnalysis,
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
    setNeedsAnalysis,
    setClusteringEnabled,
    setNClusters,
    updateMoleculeClusters,
    setOutlierSettings,
    updateMoleculeOutliers,
    setVisualization,
    toolbar,
    toggleTool,
  } = useAppStore();

  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    new Set(['method', 'visualization'])
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

      if (clustering.enabled && coordinates.length > 0) {
        setProgress(95, 'Computing clusters...');
        const clusterResult = computeKMeans(coordinates, clustering.nClusters);
        updateMoleculeClusters(clusterResult.labels);
      }

      if (outlierSettings.enabled && coordinates.length > 0) {
        setProgress(98, 'Detecting outliers...');
        const outlierResult = removeOutliers(coordinates, outlierSettings.threshold);
        updateMoleculeOutliers(outlierResult.removedIndices);
      }

      setProgress(100, 'Done!');
      setNeedsAnalysis(false);
    } catch (error) {
      console.error('Error in dimensionality reduction:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [
    dataset, drMethod, tsneParams, umapParams, clustering, outlierSettings,
    setLoading, setProgress, updateCoordinates, updateMoleculeClusters,
    updateMoleculeOutliers, setError, setNeedsAnalysis
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
    <div className="settings-panel">
      {/* Analysis required banner */}
      {needsAnalysis && dataset && (
        <div className="analysis-banner">
          <svg className="analysis-banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div className="analysis-banner-text">
            <strong>Data loaded!</strong> Configure parameters below and click <strong>Run Analysis</strong> to compute dimensionality reduction.
          </div>
        </div>
      )}

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
                  onChange={(e) => setTSNEParams({ perplexity: parseInt(e.target.value) })}
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
                  onChange={(e) => setTSNEParams({ iterations: parseInt(e.target.value) })}
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
                  onChange={(e) => setTSNEParams({ learningRate: parseInt(e.target.value) })}
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
                  onChange={(e) => setUMAPParams({ nNeighbors: parseInt(e.target.value) })}
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
                  onChange={(e) => setUMAPParams({ minDist: parseFloat(e.target.value) })}
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
                  onChange={(e) => setUMAPParams({ nEpochs: parseInt(e.target.value) })}
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

          {dataset && (
            <button
              onClick={handleRerun}
              disabled={isLoading}
              className={`btn btn-primary ${needsAnalysis ? 'btn-accent' : ''}`}
              style={{ marginTop: 16 }}
            >
              {isLoading ? 'Processing...' : needsAnalysis ? 'Run Analysis' : 'Rerun Analysis'}
            </button>
          )}
        </div>
      </div>

      {/* Analysis Section */}
      <div className={`settings-section ${openSections.has('analysis') ? 'open' : ''}`}>
        <div className="section-header" onClick={() => toggleSection('analysis')}>
          <div className="section-header-left">
            <AnalysisIcon />
            <span className="section-title">Analysis</span>
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
                onChange={(e) => setClusteringEnabled(e.target.checked)}
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
                  onChange={(e) => setNClusters(parseInt(e.target.value))}
                  disabled={isLoading}
                />
              </div>
              {dataset && (
                <button
                  onClick={handleRunClustering}
                  disabled={isLoading}
                  className="btn btn-secondary"
                  style={{ marginTop: 8 }}
                >
                  Run Clustering
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
                onChange={(e) => setOutlierSettings({ enabled: e.target.checked })}
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
                onChange={(e) => setOutlierSettings({ threshold: parseFloat(e.target.value) })}
                disabled={isLoading}
              />
              <p className="param-hint">
                Points with Z-score &gt; {outlierSettings.threshold.toFixed(1)} will be marked as outliers
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Visualization Section */}
      <div className={`settings-section ${openSections.has('visualization') ? 'open' : ''}`}>
        <div className="section-header" onClick={() => toggleSection('visualization')}>
          <div className="section-header-left">
            <PaletteIcon />
            <span className="section-title">Visualization</span>
          </div>
          <ChevronDownIcon />
        </div>
        <div className="section-content">
          <div className="param-group">
            <div className="param-label">
              <span className="param-name">Point Size</span>
              <span className="param-value">{visualization.pointSize}</span>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              value={visualization.pointSize}
              onChange={(e) => setVisualization({ pointSize: parseInt(e.target.value) })}
            />
          </div>

          <div className="param-group">
            <div className="param-label">
              <span className="param-name">Point Opacity</span>
              <span className="param-value">{visualization.pointOpacity.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.1}
              value={visualization.pointOpacity}
              onChange={(e) => setVisualization({ pointOpacity: parseFloat(e.target.value) })}
            />
          </div>

          <div className="param-group">
            <div className="param-label">
              <span className="param-name">Color By</span>
            </div>
            <div className="color-mode-selector">
              {(['value', 'cluster'] as ColorMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setVisualization({ colorMode: mode })}
                  disabled={mode === 'cluster' && !clustering.enabled}
                  className={`color-mode-btn ${visualization.colorMode === mode ? 'active' : ''}`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {outlierSettings.enabled && (
            <div className="toggle-container">
              <span className="toggle-label">Show Outliers</span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={visualization.showOutliers}
                  onChange={(e) => setVisualization({ showOutliers: e.target.checked })}
                />
                <span className="toggle-track" />
                <span className="toggle-thumb" />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar Section */}
      <div className={`settings-section ${openSections.has('toolbar') ? 'open' : ''}`}>
        <div className="section-header" onClick={() => toggleSection('toolbar')}>
          <div className="section-header-left">
            <ToolbarIcon />
            <span className="section-title">Plot Toolbar</span>
          </div>
          <ChevronDownIcon />
        </div>
        <div className="section-content">
          <p className="param-hint" style={{ marginBottom: 12 }}>
            Select which tools to show in the plot toolbar
          </p>
          {TOOL_CATEGORIES.map((category) => (
            <div key={category.category} className="toolbar-category">
              <p className="toolbar-category-title">{category.category}</p>
              <div className="toolbar-tools-grid">
                {category.tools.map((tool) => (
                  <label key={tool.id} className="toolbar-tool-item" title={tool.description}>
                    <input
                      type="checkbox"
                      checked={toolbar.enabledTools.includes(tool.id)}
                      onChange={() => toggleTool(tool.id)}
                    />
                    <span className="toolbar-tool-checkbox" />
                    <span className="toolbar-tool-label">{tool.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export Section */}
      {dataset && (
        <div className={`settings-section ${openSections.has('export') ? 'open' : ''}`}>
          <div className="section-header" onClick={() => toggleSection('export')}>
            <div className="section-header-left">
              <ExportIcon />
              <span className="section-title">Export</span>
            </div>
            <ChevronDownIcon />
          </div>
          <div className="section-content">
            <div className="export-buttons">
              <button
                onClick={handleExportHTML}
                disabled={isLoading}
                className="btn btn-secondary"
              >
                HTML
              </button>
              <button
                onClick={handleExportCSV}
                disabled={isLoading}
                className="btn btn-secondary"
              >
                CSV
              </button>
            </div>
            <p className="param-hint" style={{ marginTop: 12 }}>
              HTML exports an interactive Plotly chart. CSV exports coordinates with SMILES.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
