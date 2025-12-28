import { useMemo, useCallback, useState, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
import type { PlotHoverEvent, PlotRelayoutEvent } from 'plotly.js';
import { useAppStore } from '../store/useAppStore';
import { CLUSTER_COLORS } from '../lib/clustering';

const Plot = createPlotlyComponent(Plotly);

interface AxisRange {
  xaxis?: [number, number];
  yaxis?: [number, number];
}

export function ScatterPlot() {
  const {
    dataset,
    visualization,
    clustering,
    clusterLabels,
    outlierSettings,
    setHoveredIndex,
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
          title: { text: 'Value' },
          thickness: 15,
          len: 0.9,
        },
      };
    }
  }, [plotData, visualization, clustering.enabled, clusterLabels]);

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

  if (!plotData || !markerConfig) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-500">No data to display. Upload a CSV file to get started.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
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
          margin: { t: 40, r: 80, b: 60, l: 60 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'white',
          xaxis: {
            title: { text: 'Dimension 1' },
            zeroline: false,
            gridcolor: '#eee',
            range: axisRangeRef.current.xaxis,
          },
          yaxis: {
            title: { text: 'Dimension 2' },
            zeroline: false,
            gridcolor: '#eee',
            range: axisRangeRef.current.yaxis,
          },
          hovermode: 'closest',
          dragmode: 'pan',
          uirevision: 'true',
        }}
        config={{
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['autoScale2d', 'lasso2d', 'select2d'],
          scrollZoom: true,
          responsive: true,
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
        onHover={handleHover}
        onUnhover={handleUnhover}
        onRelayout={handleRelayout}
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
    maxWidth: '250px',
    pointerEvents: 'none',
    zIndex: 9999,
  };

  return (
    <div
      className="bg-white rounded-lg shadow-lg border p-3"
      style={tooltipStyle}
    >
      {molecule.svg ? (
        <div
          className="mb-2"
          dangerouslySetInnerHTML={{ __html: molecule.svg }}
        />
      ) : (
        <div className="w-[200px] h-[150px] bg-gray-100 flex items-center justify-center mb-2 rounded">
          <span className="text-gray-400 text-sm">No image</span>
        </div>
      )}
      <div className="text-xs space-y-1">
        <p className="font-mono text-gray-600 truncate" title={molecule.smiles}>
          {molecule.smiles}
        </p>
        <p className="font-semibold">
          Value: <span className="text-primary-600">{molecule.value.toFixed(4)}</span>
        </p>
        {showCluster && molecule.cluster !== undefined && (
          <p className="flex items-center gap-1">
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ backgroundColor: CLUSTER_COLORS[molecule.cluster % CLUSTER_COLORS.length] }}
            />
            <span>Cluster {molecule.cluster + 1}</span>
          </p>
        )}
        {molecule.isOutlier && (
          <p className="text-red-500 font-medium">Outlier</p>
        )}
      </div>
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
    <div className="absolute top-2 right-2 bg-white/90 rounded-lg shadow p-2 text-xs">
      <p className="font-medium mb-1">Clusters</p>
      {Array.from({ length: nClusters }, (_, i) => {
        const count = counts.get(i) || 0;
        const percent = ((count / total) * 100).toFixed(1);
        return (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}
            />
            <span>Cluster {i + 1}: {percent}%</span>
          </div>
        );
      })}
    </div>
  );
}
