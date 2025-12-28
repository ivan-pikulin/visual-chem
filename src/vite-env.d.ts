/// <reference types="vite/client" />

declare module 'react-plotly.js' {
  import { Component } from 'react';
  import type { PlotParams } from 'react-plotly.js';

  export interface PlotParams {
    data: Plotly.Data[];
    layout?: Partial<Plotly.Layout>;
    config?: Partial<Plotly.Config>;
    style?: React.CSSProperties;
    className?: string;
    useResizeHandler?: boolean;
    onHover?: (event: Plotly.PlotMouseEvent) => void;
    onUnhover?: (event: Plotly.PlotMouseEvent) => void;
    onClick?: (event: Plotly.PlotMouseEvent) => void;
    onSelected?: (event: Plotly.PlotSelectionEvent) => void;
    onRelayout?: (event: Plotly.PlotRelayoutEvent) => void;
  }

  const Plot: React.ComponentType<PlotParams>;
  export default Plot;
}

declare module 'plotly.js-dist-min' {
  export * from 'plotly.js';
}

declare module 'tsne-js' {
  interface TSNEOptions {
    dim?: number;
    perplexity?: number;
    earlyExaggeration?: number;
    learningRate?: number;
    nIter?: number;
    metric?: string;
  }

  interface InitOptions {
    data: number[][];
    type: 'dense' | 'sparse';
  }

  class TSNE {
    constructor(options?: TSNEOptions);
    init(options: InitOptions): void;
    run(): number;
    getOutput(): number[][];
    getOutputScaled(): number[][];
  }

  export default TSNE;
}
