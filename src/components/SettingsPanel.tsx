import { useCallback, useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { CLUSTER_COLORS } from '../lib/clustering';
import { exportInteractiveHTML, exportDataAsCSV, exportSelectedAsCSV } from '../lib/export';
import type { PlotTool } from '../types';
import { LabelTemplateInput } from './LabelTemplateInput';

// Icons
const ChevronDownIcon = () => (
  <svg className="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
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

type SectionId = 'visualization' | 'toolbar' | 'export';

export function SettingsPanel() {
  const {
    dataset,
    datasets,
    isLoading,
    clustering,
    outlierSettings,
    visualization,
    clusterLabels,
    selectedIndices,
    setVisualization,
    toolbar,
    toggleTool,
    setActiveColumns,
  } = useAppStore();

  // Check if multiple datasets are visible (for Dataset color mode)
  const visibleDatasets = datasets.filter(d => d.visible !== false);
  const hasMultipleVisibleDatasets = visibleDatasets.length > 1;

  // Get available value and label columns from dataset
  const valueColumns = dataset?.columnMapping?.values || [];
  const labelColumns = dataset?.columnMapping?.labels || [];
  const activeValueColumn = visualization.activeColumns.value;
  const labelTemplate = visualization.activeColumns.labelTemplate || '';

  // Get all available columns from dataset (for template input suggestions)
  const allColumns = useMemo(() => {
    return dataset?.csvHeaders || [];
  }, [dataset?.csvHeaders]);

  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    new Set(['visualization'])
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

  const handleExportHTML = useCallback(() => {
    if (!dataset) return;

    const validMolecules = dataset.molecules.filter((m) => m.isValid && m.coordinates);
    if (validMolecules.length === 0) return;

    const x = validMolecules.map((m) => m.coordinates!.x);
    const y = validMolecules.map((m) => m.coordinates!.y);
    const values = validMolecules.map((m) => m.value ?? 0);

    const plotData: Plotly.Data[] = [{
      type: 'scattergl',
      mode: 'markers',
      x,
      y,
      marker: {
        size: visualization.pointSize,
        color: visualization.colorMode === 'cluster' && clusterLabels
          ? clusterLabels.map(c => CLUSTER_COLORS[c % CLUSTER_COLORS.length])
          : dataset.valueRange ? values : '#3b82f6',
        colorscale: visualization.colorMode === 'value' && dataset.valueRange ? 'Inferno' : undefined,
        colorbar: visualization.colorMode === 'value' && dataset.valueRange ? { title: { text: 'Value' } } : undefined,
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
      ...(m.label !== undefined && { label: m.label }),
      ...(m.value !== undefined && { value: m.value }),
      ...(m.group !== undefined && { group: m.group }),
      x: m.coordinates!.x,
      y: m.coordinates!.y,
      cluster: clusterLabels ? clusterLabels[i] : undefined,
    }));

    exportDataAsCSV(data, `${dataset.name.replace(/\.[^/.]+$/, '')}-coordinates.csv`);
  }, [dataset, clusterLabels]);

  const handleExportSelected = useCallback(() => {
    if (!dataset || selectedIndices.length === 0) return;

    // Get valid molecules with coordinates (same filtering as ScatterPlot)
    const validMolecules = dataset.molecules.filter((m) => m.isValid && m.coordinates);
    if (validMolecules.length === 0) return;

    // Get the selected molecules based on plot indices
    const selectedMolecules = selectedIndices
      .filter(i => i < validMolecules.length)
      .map(i => validMolecules[i]);

    // Extract original row data
    const originalRows = selectedMolecules
      .map(m => m.originalRow)
      .filter((row): row is Record<string, unknown> => row !== undefined);

    if (originalRows.length === 0) return;

    // Use original CSV headers if available
    const headers = dataset.csvHeaders || Object.keys(originalRows[0]);

    exportSelectedAsCSV(
      originalRows,
      headers,
      `${dataset.name.replace(/\.[^/.]+$/, '')}-selected.csv`
    );
  }, [dataset, selectedIndices]);

  return (
    <div className="settings-panel">
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
              <button
                onClick={() => setVisualization({ colorMode: 'value' })}
                disabled={valueColumns.length === 0}
                className={`color-mode-btn ${visualization.colorMode === 'value' ? 'active' : ''}`}
                title={valueColumns.length === 0 ? 'No value column mapped' : undefined}
              >
                Value
              </button>
              <button
                onClick={() => setVisualization({ colorMode: 'group' })}
                disabled={!dataset?.groups}
                className={`color-mode-btn ${visualization.colorMode === 'group' ? 'active' : ''}`}
                title={!dataset?.groups ? 'No group column mapped' : undefined}
              >
                Group
              </button>
              <button
                onClick={() => setVisualization({ colorMode: 'cluster' })}
                disabled={!clustering.enabled}
                className={`color-mode-btn ${visualization.colorMode === 'cluster' ? 'active' : ''}`}
              >
                Cluster
              </button>
              <button
                onClick={() => setVisualization({ colorMode: 'dataset' })}
                disabled={!hasMultipleVisibleDatasets}
                className={`color-mode-btn ${visualization.colorMode === 'dataset' ? 'active' : ''}`}
                title={!hasMultipleVisibleDatasets ? 'Load multiple datasets to use this mode' : 'Color by dataset'}
              >
                Dataset
              </button>
            </div>
          </div>

          {/* Value column selector - show when multiple value columns available */}
          {valueColumns.length > 1 && (
            <div className="param-group">
              <div className="param-label">
                <span className="param-name">Value Column</span>
              </div>
              <select
                className="param-select"
                value={activeValueColumn || ''}
                onChange={(e) => setActiveColumns({ value: e.target.value || undefined })}
              >
                {valueColumns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Label template - show when any columns available */}
          {allColumns.length > 0 && (
            <div className="param-group">
              <div className="param-label">
                <span className="param-name">Label Template</span>
                <span className="param-hint">Use @column to insert column values</span>
              </div>
              <LabelTemplateInput
                value={labelTemplate}
                onChange={(value) => {
                  setActiveColumns({ labelTemplate: value });
                }}
                columns={allColumns}
                placeholder="e.g., Name: @name, Value: @logK"
              />
              {/* Quick presets from label columns */}
              {labelColumns.length > 0 && (
                <div className="label-template-presets">
                  <span className="label-template-presets-label">Quick:</span>
                  {labelColumns.slice(0, 4).map((col) => (
                    <button
                      key={col}
                      type="button"
                      className="label-template-preset-btn"
                      onClick={() => setActiveColumns({ labelTemplate: `${col}: @${col}` })}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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

            {selectedIndices.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={handleExportSelected}
                  disabled={isLoading}
                  className="btn btn-primary"
                >
                  Export {selectedIndices.length} Selected
                </button>
                <p className="param-hint" style={{ marginTop: 8 }}>
                  Exports selected points with all original CSV columns.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
