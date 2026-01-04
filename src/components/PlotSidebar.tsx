import { useState, useCallback, useMemo, useRef } from 'react';
import { useAppStore, DATASET_COLORS } from '../store/useAppStore';
import { CLUSTER_COLORS } from '../lib/clustering';
import { exportInteractiveHTML, exportDataAsCSV, exportSelectedAsCSV } from '../lib/export';
import type { PlotTool } from '../types';
import { LabelTemplateInput } from './LabelTemplateInput';

type SidebarTab = 'datasets' | 'settings' | 'selection';

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

// Tool definitions
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
    category: 'Export',
    tools: [
      { id: 'toImage', label: 'Save Image', description: 'Download plot as PNG' },
      { id: 'sendDataToCloud', label: 'Edit in Studio', description: 'Edit in Plotly Chart Studio' },
    ],
  },
];

type SectionId = 'visualization' | 'toolbar' | 'export';

interface PlotSidebarProps {
  className?: string;
  onClose?: () => void;
}

export function PlotSidebar({ className, onClose }: PlotSidebarProps) {
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
    setDatasetVisible,
    setAllDatasetsVisible,
    setSelectedIndices,
    setDatasetDisplaySettings,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<SidebarTab>(() =>
    selectedIndices.length > 0 ? 'selection' : 'datasets'
  );

  // Auto-switch to selection tab when selection changes
  const prevSelectedCount = useRef(selectedIndices.length);
  if (selectedIndices.length > 0 && prevSelectedCount.current === 0) {
    if (activeTab !== 'selection') {
      setActiveTab('selection');
    }
  }
  prevSelectedCount.current = selectedIndices.length;

  // Get currently visible dataset IDs
  const visibleIds = new Set(
    datasets.filter(d => d.visible !== false).map(d => d.id)
  );

  // Track last clicked index for shift+click range selection
  const lastClickedRef = useRef<number | null>(null);

  const handleDatasetClick = useCallback((index: number, e: React.MouseEvent) => {
    const clickedDataset = datasets[index];
    if (!clickedDataset) return;

    if (e.metaKey || e.ctrlKey) {
      setDatasetVisible(clickedDataset.id, !visibleIds.has(clickedDataset.id));
      lastClickedRef.current = index;
    } else if (e.shiftKey && lastClickedRef.current !== null) {
      const start = Math.min(lastClickedRef.current, index);
      const end = Math.max(lastClickedRef.current, index);
      setAllDatasetsVisible(false);
      for (let i = start; i <= end; i++) {
        setDatasetVisible(datasets[i].id, true);
      }
    } else {
      setAllDatasetsVisible(false);
      setDatasetVisible(clickedDataset.id, true);
      lastClickedRef.current = index;
    }
  }, [datasets, visibleIds, setDatasetVisible, setAllDatasetsVisible]);

  // Settings tab state
  const visibleDatasets = datasets.filter(d => d.visible !== false);
  const hasMultipleVisibleDatasets = visibleDatasets.length > 1;
  const labelColumns = dataset?.columnMapping?.labels || [];
  const labelTemplate = visualization.activeColumns.labelTemplate || '';
  const allColumns = useMemo(() => dataset?.csvHeaders || [], [dataset?.csvHeaders]);
  const columnInfo = useMemo(() => dataset?.columnInfo || [], [dataset?.columnInfo]);

  const [openSections, setOpenSections] = useState<Set<SectionId>>(new Set(['visualization']));

  const toggleSection = (id: SectionId) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

    const validMolecules = dataset.molecules.filter((m) => m.isValid && m.coordinates);
    if (validMolecules.length === 0) return;

    const selectedMolecules = selectedIndices
      .filter(i => i < validMolecules.length)
      .map(i => validMolecules[i]);

    const originalRows = selectedMolecules
      .map(m => m.originalRow)
      .filter((row): row is Record<string, unknown> => row !== undefined);

    if (originalRows.length === 0) return;

    const headers = dataset.csvHeaders || Object.keys(originalRows[0]);

    exportSelectedAsCSV(
      originalRows,
      headers,
      `${dataset.name.replace(/\.[^/.]+$/, '')}-selected.csv`
    );
  }, [dataset, selectedIndices]);

  const clearSelection = useCallback(() => {
    setSelectedIndices([]);
  }, [setSelectedIndices]);

  // Get selected molecules for the selection tab
  const selectedMolecules = useMemo(() => {
    if (!dataset || selectedIndices.length === 0) return [];
    const validMolecules = dataset.molecules.filter((m) => m.isValid && m.coordinates);
    return selectedIndices
      .filter(i => i < validMolecules.length)
      .map(i => validMolecules[i]);
  }, [dataset, selectedIndices]);

  const visibleCount = visibleIds.size;

  return (
    <div className={`plot-sidebar ${className || ''}`}>
      {/* Tab bar */}
      <div className="plot-sidebar-tabs">
        <button
          className={`plot-sidebar-tab ${activeTab === 'datasets' ? 'active' : ''}`}
          onClick={() => setActiveTab('datasets')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Datasets</span>
        </button>
        <button
          className={`plot-sidebar-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>
        {selectedIndices.length > 0 && (
          <button
            className={`plot-sidebar-tab ${activeTab === 'selection' ? 'active' : ''}`}
            onClick={() => setActiveTab('selection')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 3a2 2 0 0 0-2 2" />
              <path d="M19 3a2 2 0 0 1 2 2" />
              <path d="M21 19a2 2 0 0 1-2 2" />
              <path d="M5 21a2 2 0 0 1-2-2" />
              <path d="M9 3h1" />
              <path d="M9 21h1" />
              <path d="M14 3h1" />
              <path d="M14 21h1" />
              <path d="M3 9v1" />
              <path d="M21 9v1" />
              <path d="M3 14v1" />
              <path d="M21 14v1" />
            </svg>
            <span className="plot-sidebar-tab-badge">{selectedIndices.length}</span>
          </button>
        )}
        {onClose && (
          <button className="plot-sidebar-close" onClick={onClose} title="Close sidebar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="plot-sidebar-content">
        {activeTab === 'datasets' && (
          <div className="plot-sidebar-datasets">
            {datasets.length === 0 ? (
              <div className="plot-sidebar-empty">
                <p>No datasets loaded</p>
              </div>
            ) : (
              <>
                <div className="dataset-list">
                  {datasets.map((ds, index) => {
                    const color = ds.color || DATASET_COLORS[index % DATASET_COLORS.length];
                    const isSelected = visibleIds.has(ds.id);
                    const validCount = ds.molecules.filter(m => m.isValid).length;

                    return (
                      <div
                        key={ds.id}
                        className={`dataset-list-item ${isSelected ? 'selected' : ''}`}
                        onClick={(e) => handleDatasetClick(index, e)}
                        style={{ '--dataset-color': color } as React.CSSProperties}
                      >
                        <span className="dataset-list-color" style={{ backgroundColor: color }} />
                        <span className="dataset-list-name" title={ds.name}>
                          {ds.name}
                        </span>
                        <span className="dataset-list-count">{validCount}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="dataset-selector-footer">
                  <span className="dataset-selector-count">
                    {visibleCount} of {datasets.length} selected
                  </span>
                  {datasets.length > 1 && (
                    <span className="dataset-selector-hint">
                      ⌘+click to add, ⇧+click for range
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
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
                      disabled={!dataset?.displaySettings?.valueExpression && (dataset?.columnMapping?.values?.length ?? 0) === 0}
                      className={`color-mode-btn ${visualization.colorMode === 'value' ? 'active' : ''}`}
                    >
                      Value
                    </button>
                    <button
                      onClick={() => setVisualization({ colorMode: 'group' })}
                      disabled={!dataset?.groups}
                      className={`color-mode-btn ${visualization.colorMode === 'group' ? 'active' : ''}`}
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
                    >
                      Dataset
                    </button>
                  </div>
                </div>

                {allColumns.length > 0 && (
                  <div className="param-group">
                    <div className="param-label">
                      <span className="param-name">Value</span>
                      <span className="param-hint">Numeric only. Supports: @col, +, -, *, /, abs(), log()</span>
                    </div>
                    <LabelTemplateInput
                      value={dataset?.displaySettings?.valueExpression || ''}
                      onChange={(value) => dataset && setDatasetDisplaySettings(dataset.id, { valueExpression: value })}
                      columns={allColumns}
                      columnInfo={columnInfo}
                      columnTypeFilter="number"
                      placeholder="e.g., @pKi or abs(@a - @b)"
                    />
                  </div>
                )}

                {allColumns.length > 0 && (
                  <div className="param-group">
                    <div className="param-label">
                      <span className="param-name">Label Template</span>
                      <span className="param-hint">Use @column to insert column values</span>
                    </div>
                    <LabelTemplateInput
                      value={labelTemplate}
                      onChange={(value) => setActiveColumns({ labelTemplate: value })}
                      columns={allColumns}
                      placeholder="e.g., Name: @name, Value: @logK"
                    />
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
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'selection' && (
          <div className="plot-sidebar-selection">
            <div className="selection-header">
              <span className="selection-header-count">{selectedIndices.length} molecules selected</span>
              <button className="selection-header-clear" onClick={clearSelection}>
                Clear
              </button>
            </div>

            <div className="selection-list">
              {selectedMolecules.slice(0, 100).map((mol, idx) => (
                <div key={idx} className="selection-list-item">
                  {mol.svg ? (
                    <div
                      className="selection-list-image"
                      dangerouslySetInnerHTML={{ __html: mol.svg }}
                    />
                  ) : (
                    <div className="selection-list-image-placeholder">
                      ?
                    </div>
                  )}
                  <div className="selection-list-info">
                    {mol.label && <span className="selection-list-label">{mol.label}</span>}
                    <span className="selection-list-smiles" title={mol.smiles}>
                      {mol.smiles.length > 30 ? mol.smiles.slice(0, 28) + '...' : mol.smiles}
                    </span>
                  </div>
                </div>
              ))}
              {selectedMolecules.length > 100 && (
                <div className="selection-list-more">
                  +{selectedMolecules.length - 100} more molecules
                </div>
              )}
            </div>

            <div className="selection-actions">
              <button
                onClick={handleExportSelected}
                className="btn btn-primary selection-export-btn"
              >
                <ExportIcon />
                Export Selected
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
