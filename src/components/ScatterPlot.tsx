import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
import type { PlotHoverEvent, PlotRelayoutEvent, PlotSelectionEvent } from 'plotly.js';
import { useAppStore } from '../store/useAppStore';
import { CLUSTER_COLORS } from '../lib/clustering';

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

export function ScatterPlot() {
  const {
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
    value: number;
    svg?: string;
    cluster?: number;
    isOutlier?: boolean;
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

  const plotData = useMemo(() => {
    if (!dataset) return null;

    let validMolecules = dataset.molecules.filter(
      (m) => m.isValid && m.coordinates
    );

    // Filter out outliers if not showing them
    if (outlierSettings.enabled && !visualization.showOutliers) {
      validMolecules = validMolecules.filter((m) => !m.isOutlier);
    }

    if (validMolecules.length === 0) return null;

    const x = validMolecules.map((m) => m.coordinates!.x);
    const y = validMolecules.map((m) => m.coordinates!.y);
    const values = validMolecules.map((m) => m.value);
    const smiles = validMolecules.map((m) => m.smiles);
    const clusters = validMolecules.map((m) => m.cluster);
    const isOutliers = validMolecules.map((m) => m.isOutlier);

    return { x, y, values, smiles, clusters, isOutliers, molecules: validMolecules };
  }, [dataset, visualization.showOutliers, outlierSettings.enabled]);

  // Determine marker colors based on colorMode
  const markerConfig = useMemo(() => {
    if (!plotData) return null;

    const baseConfig = {
      size: visualization.pointSize,
      opacity: visualization.pointOpacity,
    };

    if (visualization.colorMode === 'cluster' && clustering.enabled && clusterLabels) {
      // Color by cluster
      const colors = plotData.clusters.map((c) =>
        c !== undefined ? CLUSTER_COLORS[c % CLUSTER_COLORS.length] : '#ccc'
      );
      return {
        ...baseConfig,
        color: colors,
      };
    } else {
      // Color by value (default)
      return {
        ...baseConfig,
        color: plotData.values,
        colorscale: 'Inferno',
        colorbar: {
          title: { text: 'Value', font: { size: 12 } },
          thickness: 12,
          len: 0.8,
          tickfont: { size: 10 },
        },
      };
    }
  }, [plotData, visualization, clustering.enabled, clusterLabels]);

  // Compute which tools to remove (inverse of enabled tools)
  // Cast to any[] because Plotly's types don't include all valid modebar buttons (e.g., drawing tools)
  const modeBarButtonsToRemove = useMemo(() => {
    return ALL_TOOLS.filter((tool) => !toolbar.enabledTools.includes(tool as typeof toolbar.enabledTools[number])) as unknown as Plotly.ModeBarDefaultButtons[];
  }, [toolbar.enabledTools]);

  const handleHover = useCallback(
    (event: Readonly<PlotHoverEvent>) => {
      if (event.points && event.points.length > 0 && plotData) {
        const point = event.points[0];
        const mol = plotData.molecules[point.pointIndex];
        setHoveredIndex(point.pointIndex);
        setHoveredMolecule(mol ? {
          smiles: mol.smiles,
          value: mol.value,
          svg: mol.svg,
          cluster: mol.cluster,
          isOutlier: mol.isOutlier,
        } : null);
        const evt = event.event as MouseEvent;
        if (evt) {
          setTooltipPos({ x: evt.clientX, y: evt.clientY });
        }
      }
    },
    [setHoveredIndex, plotData]
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
        // Map selected point indices to original molecule indices
        const indices = event.points.map((p) => p.pointIndex);
        setSelectedIndices(indices);
      }
    },
    [setSelectedIndices]
  );

  const handleDeselect = useCallback(() => {
    setSelectedIndices([]);
  }, [setSelectedIndices]);

  if (!plotData || !markerConfig) {
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
        data={[
          {
            type: 'scattergl',
            mode: 'markers',
            x: plotData.x,
            y: plotData.y,
            marker: markerConfig,
            text: plotData.smiles,
            hoverinfo: 'none',
          },
        ]}
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
        />
      )}

      {/* Cluster legend */}
      {visualization.colorMode === 'cluster' && clustering.enabled && clusterLabels && (
        <ClusterLegend nClusters={clustering.nClusters} clusterLabels={clusterLabels} />
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
    value: number;
    svg?: string;
    cluster?: number;
    isOutlier?: boolean;
  };
  position: { x: number; y: number };
  showCluster: boolean;
}

function MoleculeTooltip({ molecule, position, showCluster }: MoleculeTooltipProps) {
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
      <p className="molecule-tooltip-smiles" title={molecule.smiles}>
        {molecule.smiles}
      </p>
      <p className="molecule-tooltip-value">
        Value: <span>{molecule.value.toFixed(4)}</span>
      </p>
      {showCluster && molecule.cluster !== undefined && (
        <div className="molecule-tooltip-cluster">
          <span
            className="cluster-legend-dot"
            style={{ backgroundColor: CLUSTER_COLORS[molecule.cluster % CLUSTER_COLORS.length] }}
          />
          <span>Cluster {molecule.cluster + 1}</span>
        </div>
      )}
      {molecule.isOutlier && (
        <p className="molecule-tooltip-outlier">Outlier</p>
      )}
    </div>
  );
}

interface ClusterLegendProps {
  nClusters: number;
  clusterLabels: number[];
}

function ClusterLegend({ nClusters, clusterLabels }: ClusterLegendProps) {
  // Calculate cluster percentages
  const counts = new Map<number, number>();
  for (const label of clusterLabels) {
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const total = clusterLabels.length;

  return (
    <div className="cluster-legend">
      <p className="cluster-legend-title">Clusters</p>
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
    </div>
  );
}
