import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
import type { PlotHoverEvent, PlotRelayoutEvent, PlotSelectionEvent } from 'plotly.js';
import { useAppStore, DATASET_COLORS } from '../store/useAppStore';
import { CLUSTER_COLORS } from '../lib/clustering';
import { resolveLabelTemplate } from './LabelTemplateInput';
import { evaluateExpression } from '../lib/expression';
import type { PointShape, ProcessedMolecule } from '../types';

const Plot = createPlotlyComponent(Plotly);

interface AxisRange {
  xaxis?: [number, number];
  yaxis?: [number, number];
}

// All available tools (must match PlotTool type)
const ALL_TOOLS = [
  // Navigation
  'zoom2d', 'pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d',
  // Selection
  'select2d', 'lasso2d',
  // Drawing
  'drawline', 'drawopenpath', 'drawclosedpath', 'drawcircle', 'drawrect', 'eraseshape',
  // Hover & Spikes
  'hoverClosestCartesian', 'hoverCompareCartesian', 'toggleSpikelines', 'toggleHover',
  // Export
  'toImage', 'sendDataToCloud',
] as const;

// Map PointShape to Plotly symbol
const SHAPE_TO_PLOTLY: Record<PointShape, string> = {
  'circle': 'circle',
  'square': 'square',
  'diamond': 'diamond',
  'triangle-up': 'triangle-up',
  'cross': 'cross',
  'star': 'star',
};

// Group colors for 'group' color mode
const GROUP_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

export function ScatterPlot() {
  const {
    datasets,
    dataset,
    visualization,
    clustering,
    clusterLabels,
    outlierSettings,
    toolbar,
    selectedIndices,
    setHoveredIndex,
    setSelectedIndices,
  } = useAppStore();

  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredMolecule, setHoveredMolecule] = useState<{
    smiles: string;
    value?: number;
    label?: string;
    group?: string;
    svg?: string;
    cluster?: number;
    isOutlier?: boolean;
    datasetName?: string;
    datasetColor?: string;
  } | null>(null);
  const axisRangeRef = useRef<AxisRange>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Prevent page scroll when scrolling on the plot (for zoom)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Note: labelTemplate is now per-dataset in displaySettings
  // activeColumns.labelTemplate is kept for backward compatibility
  const globalLabelTemplate = visualization.activeColumns.labelTemplate;

  // Filter visible datasets
  const visibleDatasets = useMemo(() => {
    return datasets.filter(d => d.visible !== false);
  }, [datasets]);

  // Build plot data for all visible datasets
  const plotTraces = useMemo(() => {
    if (visibleDatasets.length === 0) return null;

    const traces: Plotly.Data[] = [];
    const allMolecules: { molecule: ProcessedMolecule; datasetId: string; datasetName: string; datasetColor: string; traceIndex: number; pointIndex: number }[] = [];

    visibleDatasets.forEach((ds, dsIndex) => {
      let validMolecules = ds.molecules.filter(
        (m) => m.isValid && m.coordinates
      );

      // Filter out outliers if not showing them
      if (outlierSettings.enabled && !visualization.showOutliers) {
        validMolecules = validMolecules.filter((m) => !m.isOutlier);
      }

      if (validMolecules.length === 0) return;

      const x = validMolecules.map((m) => m.coordinates!.x);
      const y = validMolecules.map((m) => m.coordinates!.y);

      // Get valueExpression from dataset's displaySettings
      const valueExpression = ds.displaySettings?.valueExpression;

      // Get values using expression evaluation
      const values = validMolecules.map((m) => {
        if (valueExpression && m.originalRow) {
          const computed = evaluateExpression(valueExpression, m.originalRow);
          if (computed !== undefined) {
            return computed;
          }
        }
        return m.value;
      });

      const smiles = validMolecules.map((m) => m.smiles);

      // Get labelTemplate from dataset's displaySettings (fallback to global)
      const labelTemplate = ds.displaySettings?.labelTemplate || globalLabelTemplate;

      // Get labels
      const labels = validMolecules.map((m) => {
        if (labelTemplate && m.originalRow) {
          const resolved = resolveLabelTemplate(labelTemplate, m.originalRow);
          return resolved || undefined;
        }
        return m.label;
      });

      const groups = validMolecules.map((m) => m.group);
      const clusters = validMolecules.map((m) => m.cluster);
      const isOutliers = validMolecules.map((m) => m.isOutlier);

      const dsColor = ds.color || DATASET_COLORS[dsIndex % DATASET_COLORS.length];
      const dsShape = ds.pointShape || 'circle';
      const dsPointSize = ds.pointSize ?? visualization.pointSize;

      // Determine marker colors
      let markerColor: string | string[] | number[] = dsColor;

      if (visualization.colorMode === 'dataset') {
        // Each dataset gets its own color
        markerColor = dsColor;
      } else if (visualization.colorMode === 'cluster' && clustering.enabled && clusterLabels) {
        // Color by cluster - need to map to this dataset's molecules
        // Note: clusterLabels are for the active dataset only, so we only apply to active
        if (ds.id === dataset?.id) {
          markerColor = clusters.map((c) =>
            c !== undefined ? CLUSTER_COLORS[c % CLUSTER_COLORS.length] : '#ccc'
          );
        }
      } else if (visualization.colorMode === 'group' && ds.groups) {
        // Color by group
        const groupIndexMap = new Map(ds.groups.map((g, i) => [g, i]));
        markerColor = groups.map((g) => {
          if (g === undefined) return '#ccc';
          const idx = groupIndexMap.get(g) ?? 0;
          return GROUP_COLORS[idx % GROUP_COLORS.length];
        });
      } else if (visualization.colorMode === 'value') {
        // Color by value - will be handled with colorscale
        const validValues = values.map(v => v ?? 0);
        markerColor = validValues;
      }

      const traceIndex = traces.length;

      // Store molecule references for hover
      validMolecules.forEach((mol, i) => {
        allMolecules.push({
          molecule: mol,
          datasetId: ds.id,
          datasetName: ds.name,
          datasetColor: dsColor,
          traceIndex,
          pointIndex: i,
        });
      });

      const trace: Plotly.Data = {
        type: 'scattergl',
        mode: 'markers',
        name: ds.name,
        x,
        y,
        marker: {
          size: dsPointSize,
          opacity: visualization.pointOpacity,
          symbol: SHAPE_TO_PLOTLY[dsShape],
          color: markerColor,
          ...(visualization.colorMode === 'value' && Array.isArray(markerColor) && {
            colorscale: 'Inferno',
            colorbar: dsIndex === 0 ? {
              title: { text: valueExpression || 'Value', font: { size: 12 } },
              thickness: 12,
              len: 0.8,
              tickfont: { size: 10 },
            } : undefined,
          }),
        },
        text: smiles,
        hoverinfo: 'none',
        // Store extra data for hover (cast to any to avoid TypeScript issues with Plotly types)
        customdata: validMolecules.map((_, i) => ({
          value: values[i],
          label: labels[i],
          group: groups[i],
          cluster: clusters[i],
          isOutlier: isOutliers[i],
          datasetName: ds.name,
          datasetColor: dsColor,
        })) as unknown as Plotly.Datum[],
      };

      traces.push(trace);
    });

    return { traces, allMolecules };
  }, [visibleDatasets, visualization, clustering.enabled, clusterLabels, outlierSettings, globalLabelTemplate, dataset]);

  // Compute which tools to remove
  const modeBarButtonsToRemove = useMemo(() => {
    return ALL_TOOLS.filter((tool) => !toolbar.enabledTools.includes(tool as typeof toolbar.enabledTools[number])) as unknown as Plotly.ModeBarDefaultButtons[];
  }, [toolbar.enabledTools]);

  const handleHover = useCallback(
    (event: Readonly<PlotHoverEvent>) => {
      if (event.points && event.points.length > 0 && plotTraces) {
        const point = event.points[0];
        const pointIdx = point.pointIndex;
        const traceIdx = point.curveNumber;

        // Find the molecule from the correct trace
        const traceData = plotTraces.traces[traceIdx] as any;
        if (traceData && traceData.customdata) {
          const customData = traceData.customdata[pointIdx];
          const smiles = traceData.text?.[pointIdx] || '';

          // Find the actual molecule for SVG
          const molRef = plotTraces.allMolecules.find(
            m => m.traceIndex === traceIdx && m.pointIndex === pointIdx
          );

          setHoveredIndex(pointIdx);
          setHoveredMolecule({
            smiles,
            value: customData?.value,
            label: customData?.label,
            group: customData?.group,
            svg: molRef?.molecule.svg,
            cluster: customData?.cluster,
            isOutlier: customData?.isOutlier,
            datasetName: customData?.datasetName,
            datasetColor: customData?.datasetColor,
          });
          const evt = event.event as MouseEvent;
          if (evt) {
            setTooltipPos({ x: evt.clientX, y: evt.clientY });
          }
        }
      }
    },
    [setHoveredIndex, plotTraces]
  );

  const handleUnhover = useCallback(() => {
    setHoveredIndex(null);
    setHoveredMolecule(null);
    setTooltipPos(null);
  }, [setHoveredIndex]);

  const handleRelayout = useCallback((event: Readonly<PlotRelayoutEvent>) => {
    if (event['xaxis.range[0]'] !== undefined && event['xaxis.range[1]'] !== undefined) {
      axisRangeRef.current.xaxis = [event['xaxis.range[0]'] as number, event['xaxis.range[1]'] as number];
    }
    if (event['yaxis.range[0]'] !== undefined && event['yaxis.range[1]'] !== undefined) {
      axisRangeRef.current.yaxis = [event['yaxis.range[0]'] as number, event['yaxis.range[1]'] as number];
    }
    if (event['xaxis.autorange'] || event['yaxis.autorange']) {
      axisRangeRef.current = {};
    }
  }, []);

  const handleSelected = useCallback(
    (event: Readonly<PlotSelectionEvent>) => {
      if (event && event.points && event.points.length > 0) {
        const indices = event.points.map((p) => p.pointIndex);
        setSelectedIndices(indices);
      }
    },
    [setSelectedIndices]
  );

  const handleDeselect = useCallback(() => {
    setSelectedIndices([]);
  }, [setSelectedIndices]);

  // Check if we have any value data for coloring (either valueRange or valueExpression)
  const hasValueRange = useMemo(() => {
    return visibleDatasets.some(ds =>
      ds.valueRange !== null || ds.displaySettings?.valueExpression
    );
  }, [visibleDatasets]);

  // Get the first dataset's valueExpression for tooltip display
  const activeValueExpression = dataset?.displaySettings?.valueExpression;

  if (!plotTraces || plotTraces.traces.length === 0) {
    return (
      <div className="scatter-plot-empty">
        <svg
          className="scatter-plot-empty-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        >
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="8" r="2" />
          <circle cx="10" cy="14" r="2" />
          <circle cx="16" cy="18" r="2" />
          <circle cx="4" cy="18" r="2" />
          <path d="M3 3v18h18" strokeWidth="1.5" />
        </svg>
        <p className="scatter-plot-empty-text">
          No data to display.<br />
          Upload a CSV file to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="scatter-plot-container" ref={containerRef}>
      <Plot
        data={plotTraces.traces}
        layout={{
          autosize: true,
          margin: { t: 20, r: 60, b: 50, l: 50 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: '#fafafa',
          xaxis: {
            title: { text: 'Dimension 1', font: { size: 12 } },
            zeroline: false,
            gridcolor: '#eaeaea',
            linecolor: '#e2e8f0',
            tickfont: { size: 10 },
            range: axisRangeRef.current.xaxis,
          },
          yaxis: {
            title: { text: 'Dimension 2', font: { size: 12 } },
            zeroline: false,
            gridcolor: '#eaeaea',
            linecolor: '#e2e8f0',
            tickfont: { size: 10 },
            range: axisRangeRef.current.yaxis,
          },
          hovermode: 'closest',
          dragmode: 'pan',
          uirevision: 'true',
          showlegend: false, // Using custom legends instead
          legend: {
            x: 1,
            y: 1,
            xanchor: 'right',
            bgcolor: 'rgba(255,255,255,0.9)',
            bordercolor: '#e2e8f0',
            borderwidth: 1,
          },
        }}
        config={{
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: modeBarButtonsToRemove,
          scrollZoom: true,
          responsive: true,
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
        onHover={handleHover}
        onUnhover={handleUnhover}
        onRelayout={handleRelayout}
        onSelected={handleSelected}
        onDeselect={handleDeselect}
      />

      {/* Molecule tooltip */}
      {hoveredMolecule && tooltipPos && (
        <MoleculeTooltip
          molecule={hoveredMolecule}
          position={tooltipPos}
          showCluster={clustering.enabled}
          showValue={hasValueRange}
          valueColumnName={activeValueExpression}
          showDataset={visibleDatasets.length > 1}
        />
      )}

      {/* Cluster legend */}
      {visualization.colorMode === 'cluster' && clustering.enabled && clusterLabels && (
        <ClusterLegend nClusters={clustering.nClusters} clusterLabels={clusterLabels} />
      )}

      {/* Group legend */}
      {visualization.colorMode === 'group' && dataset?.groups && (
        <GroupLegend groups={dataset.groups} molecules={dataset.molecules.filter(m => m.isValid && m.coordinates)} />
      )}

      {/* Dataset legend - only when not using Plotly's built-in legend */}
      {visualization.colorMode === 'dataset' && visibleDatasets.length > 1 && (
        <DatasetLegend datasets={visibleDatasets} />
      )}

      {/* Selection indicator */}
      {selectedIndices.length > 0 && (
        <div className="selection-indicator">
          <span className="selection-count">{selectedIndices.length}</span>
          <span className="selection-label">selected</span>
          <button
            className="selection-clear"
            onClick={handleDeselect}
            title="Clear selection"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

interface MoleculeTooltipProps {
  molecule: {
    smiles: string;
    value?: number;
    label?: string;
    group?: string;
    svg?: string;
    cluster?: number;
    isOutlier?: boolean;
    datasetName?: string;
    datasetColor?: string;
  };
  position: { x: number; y: number };
  showCluster: boolean;
  showValue: boolean;
  valueColumnName?: string;
  showDataset?: boolean;
}

function MoleculeTooltip({
  molecule,
  position,
  showCluster,
  showValue,
  valueColumnName,
  showDataset,
}: MoleculeTooltipProps) {
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x + 15,
    top: position.y - 75,
    pointerEvents: 'none',
    zIndex: 9999,
  };

  return (
    <div className="molecule-tooltip" style={tooltipStyle}>
      {molecule.svg ? (
        <div
          className="molecule-tooltip-image"
          dangerouslySetInnerHTML={{ __html: molecule.svg }}
        />
      ) : (
        <div className="molecule-tooltip-placeholder">
          No structure
        </div>
      )}
      {molecule.label && (
        <p className="molecule-tooltip-label">
          {molecule.label}
        </p>
      )}
      <p className="molecule-tooltip-smiles" title={molecule.smiles}>
        {molecule.smiles}
      </p>
      {showValue && molecule.value !== undefined && (
        <p className="molecule-tooltip-value">
          {valueColumnName || 'Value'}: <span>{molecule.value.toFixed(4)}</span>
        </p>
      )}
      {molecule.group && (
        <p className="molecule-tooltip-group">
          Group: <span>{molecule.group}</span>
        </p>
      )}
      {showCluster && molecule.cluster !== undefined && (
        <div className="molecule-tooltip-cluster">
          <span
            className="cluster-legend-dot"
            style={{ backgroundColor: CLUSTER_COLORS[molecule.cluster % CLUSTER_COLORS.length] }}
          />
          <span>Cluster {molecule.cluster + 1}</span>
        </div>
      )}
      {showDataset && molecule.datasetName && (
        <div className="molecule-tooltip-cluster">
          <span
            className="cluster-legend-dot"
            style={{ backgroundColor: molecule.datasetColor }}
          />
          <span>{molecule.datasetName}</span>
        </div>
      )}
      {molecule.isOutlier && (
        <p className="molecule-tooltip-outlier">Outlier</p>
      )}
    </div>
  );
}

// Draggable Legend Wrapper
interface DraggableLegendProps {
  children: React.ReactNode;
  title: string;
}

function DraggableLegend({ children, title }: DraggableLegendProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const legendRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start drag from the title area
    if ((e.target as HTMLElement).closest('.cluster-legend-title')) {
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

  return (
    <div
      ref={legendRef}
      className={`cluster-legend ${isDragging ? 'dragging' : ''}`}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
      onMouseDown={handleMouseDown}
    >
      <p className="cluster-legend-title">{title}</p>
      {children}
    </div>
  );
}

interface ClusterLegendProps {
  nClusters: number;
  clusterLabels: number[];
}

function ClusterLegend({ nClusters, clusterLabels }: ClusterLegendProps) {
  const counts = new Map<number, number>();
  for (const label of clusterLabels) {
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const total = clusterLabels.length;

  return (
    <DraggableLegend title="Clusters">
      {Array.from({ length: nClusters }, (_, i) => {
        const count = counts.get(i) || 0;
        const percent = ((count / total) * 100).toFixed(0);
        return (
          <div key={i} className="cluster-legend-item">
            <span
              className="cluster-legend-dot"
              style={{ backgroundColor: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}
            />
            <span className="cluster-legend-label">
              C{i + 1}: {percent}%
            </span>
          </div>
        );
      })}
    </DraggableLegend>
  );
}

interface GroupLegendProps {
  groups: string[];
  molecules: { group?: string }[];
}

function GroupLegend({ groups, molecules }: GroupLegendProps) {
  const counts = new Map<string, number>();
  for (const mol of molecules) {
    if (mol.group) {
      counts.set(mol.group, (counts.get(mol.group) || 0) + 1);
    }
  }
  const total = molecules.length;

  return (
    <DraggableLegend title="Groups">
      {groups.map((group, i) => {
        const count = counts.get(group) || 0;
        const percent = ((count / total) * 100).toFixed(0);
        return (
          <div key={group} className="cluster-legend-item">
            <span
              className="cluster-legend-dot"
              style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}
            />
            <span className="cluster-legend-label" title={group}>
              {group.length > 12 ? group.slice(0, 10) + '...' : group}: {percent}%
            </span>
          </div>
        );
      })}
    </DraggableLegend>
  );
}

interface DatasetLegendProps {
  datasets: { id: string; name: string; color?: string; molecules: ProcessedMolecule[] }[];
}

function DatasetLegend({ datasets }: DatasetLegendProps) {
  return (
    <DraggableLegend title="Datasets">
      {datasets.map((ds, i) => {
        const validCount = ds.molecules.filter(m => m.isValid && m.coordinates).length;
        const color = ds.color || DATASET_COLORS[i % DATASET_COLORS.length];
        return (
          <div key={ds.id} className="cluster-legend-item">
            <span
              className="cluster-legend-dot"
              style={{ backgroundColor: color }}
            />
            <span className="cluster-legend-label" title={ds.name}>
              {ds.name.length > 12 ? ds.name.slice(0, 10) + '...' : ds.name}: {validCount}
            </span>
          </div>
        );
      })}
    </DraggableLegend>
  );
}
