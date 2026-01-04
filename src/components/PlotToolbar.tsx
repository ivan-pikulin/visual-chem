import { useCallback, useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { exportDataAsCSV, exportSelectedAsCSV } from '../lib/export';
import type { ColorMode } from '../types';

interface PlotToolbarProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

// Icons
const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const COLOR_MODE_OPTIONS: { value: ColorMode; label: string; icon: string }[] = [
  { value: 'value', label: 'Value', icon: '📊' },
  { value: 'group', label: 'Group', icon: '🏷️' },
  { value: 'cluster', label: 'Cluster', icon: '🎯' },
  { value: 'dataset', label: 'Dataset', icon: '📁' },
];

export function PlotToolbar({ onToggleSidebar, sidebarOpen }: PlotToolbarProps) {
  const {
    dataset,
    datasets,
    visualization,
    clustering,
    selectedIndices,
    clusterLabels,
    setVisualization,
  } = useAppStore();

  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const colorDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Dragging state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.plot-toolbar-drag-handle')) {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y,
      };
    }
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosition({
        x: dragStartRef.current.posX + dx,
        y: dragStartRef.current.posY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(event.target as Node)) {
        setColorDropdownOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check which color modes are available
  const visibleDatasets = datasets.filter(d => d.visible !== false);
  const hasMultipleDatasets = visibleDatasets.length > 1;
  const hasGroups = dataset?.groups != null;
  const hasClusters = clustering.enabled;
  const hasValues = (dataset?.columnMapping?.values?.length ?? 0) > 0;

  const isColorModeAvailable = (mode: ColorMode) => {
    switch (mode) {
      case 'value': return hasValues;
      case 'group': return hasGroups;
      case 'cluster': return hasClusters;
      case 'dataset': return hasMultipleDatasets;
      default: return false;
    }
  };

  const currentColorMode = COLOR_MODE_OPTIONS.find(o => o.value === visualization.colorMode);

  const handleColorModeChange = useCallback((mode: ColorMode) => {
    setVisualization({ colorMode: mode });
    setColorDropdownOpen(false);
  }, [setVisualization]);

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
    setExportDropdownOpen(false);
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
    setExportDropdownOpen(false);
  }, [dataset, selectedIndices]);

  const handlePointSizeChange = useCallback((delta: number) => {
    const newSize = Math.min(20, Math.max(2, visualization.pointSize + delta));
    setVisualization({ pointSize: newSize });
  }, [visualization.pointSize, setVisualization]);

  return (
    <div
      className={`plot-toolbar ${isDragging ? 'dragging' : ''}`}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      onMouseDown={handleDragStart}
    >
      {/* Drag handle */}
      <div className="plot-toolbar-drag-handle" title="Drag to move">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="2" />
          <circle cx="12" cy="5" r="2" />
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="5" cy="19" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </div>

      {/* Color mode dropdown */}
      <div className="plot-toolbar-group" ref={colorDropdownRef}>
        <button
          className={`plot-toolbar-btn plot-toolbar-dropdown-trigger ${colorDropdownOpen ? 'active' : ''}`}
          onClick={() => setColorDropdownOpen(!colorDropdownOpen)}
          title="Color by"
        >
          <span className="plot-toolbar-btn-icon">{currentColorMode?.icon || '🎨'}</span>
          <span className="plot-toolbar-btn-label">{currentColorMode?.label || 'Color'}</span>
          <ChevronDownIcon />
        </button>
        {colorDropdownOpen && (
          <div className="plot-toolbar-dropdown">
            {COLOR_MODE_OPTIONS.map(option => (
              <button
                key={option.value}
                className={`plot-toolbar-dropdown-item ${visualization.colorMode === option.value ? 'active' : ''} ${!isColorModeAvailable(option.value) ? 'disabled' : ''}`}
                onClick={() => isColorModeAvailable(option.value) && handleColorModeChange(option.value)}
                disabled={!isColorModeAvailable(option.value)}
              >
                <span className="plot-toolbar-dropdown-icon">{option.icon}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Point size controls */}
      <div className="plot-toolbar-group plot-toolbar-size">
        <button
          className="plot-toolbar-btn plot-toolbar-btn-icon-only"
          onClick={() => handlePointSizeChange(-1)}
          disabled={visualization.pointSize <= 2}
          title="Decrease point size"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="4" />
          </svg>
        </button>
        <span className="plot-toolbar-size-value">{visualization.pointSize}</span>
        <button
          className="plot-toolbar-btn plot-toolbar-btn-icon-only"
          onClick={() => handlePointSizeChange(1)}
          disabled={visualization.pointSize >= 20}
          title="Increase point size"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="6" />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="plot-toolbar-divider" />

      {/* Export dropdown */}
      <div className="plot-toolbar-group" ref={exportDropdownRef}>
        <button
          className={`plot-toolbar-btn plot-toolbar-btn-icon-only ${exportDropdownOpen ? 'active' : ''}`}
          onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
          title="Export"
        >
          <DownloadIcon />
        </button>
        {exportDropdownOpen && (
          <div className="plot-toolbar-dropdown plot-toolbar-dropdown-right">
            <button
              className="plot-toolbar-dropdown-item"
              onClick={handleExportCSV}
              disabled={!dataset}
            >
              <span>Export CSV</span>
            </button>
            {selectedIndices.length > 0 && (
              <button
                className="plot-toolbar-dropdown-item"
                onClick={handleExportSelected}
              >
                <span>Export {selectedIndices.length} selected</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Settings toggle */}
      <button
        className={`plot-toolbar-btn plot-toolbar-btn-icon-only ${sidebarOpen ? 'active' : ''}`}
        onClick={onToggleSidebar}
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        <SettingsIcon />
      </button>
    </div>
  );
}
