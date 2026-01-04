/**
 * DevTools utilities for timing inspection
 *
 * Usage in browser console:
 *   __visualChemTiming.showStatus()
 *   __visualChemTiming.showCoefficients()
 *   __visualChemTiming.reset()
 *   __visualChemTiming.testEstimate(1000, "tsne")
 */

import {
  resetToDefaults,
  getCalibrationStatus,
  printCalibrationReport,
} from './benchmark';
import {
  estimateDRTime,
  formatTimeEstimate,
} from './index';

export interface DevToolsAPI {
  showStatus: () => void;
  showCoefficients: () => void;
  reset: () => void;
  testEstimate: (n: number, method?: 'pca' | 'tsne' | 'umap') => string;
}

/**
 * Show calibration status
 */
function showStatus(): void {
  const status = getCalibrationStatus();
  console.log('📊 Timing Calibration Status');
  console.log('  Calibrated:', status.isCalibrated ? 'Yes' : 'No (using defaults)');
  console.log('  Samples collected:', status.sampleCount);
  console.log('  Last updated:', status.lastUpdated?.toLocaleString() || 'Never');
  console.log('');
  console.log('Coefficients adapt automatically as you run analyses.');
  console.log('Use __visualChemTiming.showCoefficients() for details.');
}

/**
 * Show current coefficients with examples
 */
function showCoefficients(): void {
  printCalibrationReport();
}

/**
 * Reset to default coefficients
 */
function reset(): void {
  resetToDefaults();
  console.log('✅ Coefficients reset to defaults');
  showStatus();
}

/**
 * Test time estimate for given parameters
 */
function testEstimate(n: number, method: 'pca' | 'tsne' | 'umap' = 'umap'): string {
  const params = {
    tsne: { perplexity: 30, iterations: 1000, learningRate: 200 },
    umap: { nNeighbors: 15, minDist: 0.1, nEpochs: 200 },
  };

  const ms = estimateDRTime(n, method, params);
  const formatted = formatTimeEstimate(ms);

  console.log(`⏱️ Estimate for ${method.toUpperCase()} with n=${n}:`);
  console.log(`   ${ms.toFixed(0)}ms (${formatted})`);

  if (method === 'tsne') {
    console.log(`   Params: perplexity=${params.tsne.perplexity}, iterations=${params.tsne.iterations}`);
  } else if (method === 'umap') {
    console.log(`   Params: neighbors=${params.umap.nNeighbors}, epochs=${params.umap.nEpochs}`);
  }

  return formatted;
}

// Create API object
const devToolsAPI: DevToolsAPI = {
  showStatus,
  showCoefficients,
  reset,
  testEstimate,
};

/**
 * Register DevTools API on window object
 */
export function registerDevTools(): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { __visualChemTiming: DevToolsAPI }).__visualChemTiming = devToolsAPI;

    console.log('⏱️ Visual Chem Timing DevTools registered!');
    console.log('Commands:');
    console.log('  __visualChemTiming.showStatus()        - Show calibration status');
    console.log('  __visualChemTiming.showCoefficients()  - Show timing formulas');
    console.log('  __visualChemTiming.reset()             - Reset to defaults');
    console.log('  __visualChemTiming.testEstimate(1000)  - Test estimate for n samples');
  }
}
