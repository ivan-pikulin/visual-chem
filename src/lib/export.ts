import Plotly from 'plotly.js-dist-min';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

export async function exportPlotAsPNG(
  plotDiv: HTMLElement,
  filename: string = 'visual-chem-plot'
): Promise<void> {
  await Plotly.downloadImage(plotDiv, {
    format: 'png',
    width: 1200,
    height: 800,
    filename,
  });
}

export async function exportPlotAsSVG(
  plotDiv: HTMLElement,
  filename: string = 'visual-chem-plot'
): Promise<void> {
  await Plotly.downloadImage(plotDiv, {
    format: 'svg',
    width: 1200,
    height: 800,
    filename,
  });
}

export async function exportInteractiveHTML(
  plotData: Plotly.Data[],
  layout: Partial<Plotly.Layout>,
  defaultFilename: string = 'visual-chem-plot.html'
): Promise<boolean> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Chem Plot</title>
  <script src="https://cdn.plot.ly/plotly-2.35.0.min.js"></script>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #f8fafc; }
    #plot { width: 100%; height: 90vh; background: white; border-radius: 8px; }
    h1 { color: #1e293b; margin-bottom: 20px; font-size: 1.5rem; }
  </style>
</head>
<body>
  <h1>Visual Chem - Chemical Space Visualization</h1>
  <div id="plot"></div>
  <script>
    const data = ${JSON.stringify(plotData)};
    const layout = ${JSON.stringify({
      ...layout,
      autosize: true,
      paper_bgcolor: 'white',
      plot_bgcolor: '#fafafa',
    })};
    Plotly.newPlot('plot', data, layout, { responsive: true });
  </script>
</body>
</html>`;

  try {
    // Open save dialog
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{
        name: 'HTML',
        extensions: ['html']
      }]
    });

    if (filePath) {
      await writeTextFile(filePath, html);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Export error:', error);
    // Fallback to browser download if Tauri is not available
    fallbackDownload(html, defaultFilename, 'text/html');
    return true;
  }
}

export async function exportDataAsCSV(
  data: Array<{
    smiles: string;
    label?: string;
    value?: number;
    group?: string;
    x: number;
    y: number;
    cluster?: number;
  }>,
  defaultFilename: string = 'visual-chem-data.csv'
): Promise<boolean> {
  // Build headers dynamically based on available data
  const headers = ['SMILES'];
  const hasLabel = data.some(d => d.label !== undefined);
  const hasValue = data.some(d => d.value !== undefined);
  const hasGroup = data.some(d => d.group !== undefined);
  const hasCluster = data.some(d => d.cluster !== undefined);

  if (hasLabel) headers.push('Label');
  if (hasValue) headers.push('Value');
  if (hasGroup) headers.push('Group');
  headers.push('X', 'Y');
  if (hasCluster) headers.push('Cluster');

  const escapeCSV = (value: unknown): string => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = data.map(row => {
    const values = [escapeCSV(row.smiles)];
    if (hasLabel) values.push(escapeCSV(row.label ?? ''));
    if (hasValue) values.push(row.value !== undefined ? row.value.toString() : '');
    if (hasGroup) values.push(escapeCSV(row.group ?? ''));
    values.push(row.x.toString(), row.y.toString());
    if (hasCluster) values.push(row.cluster !== undefined ? row.cluster.toString() : '');
    return values.join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');

  try {
    // Open save dialog
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{
        name: 'CSV',
        extensions: ['csv']
      }]
    });

    if (filePath) {
      await writeTextFile(filePath, csv);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Export error:', error);
    // Fallback to browser download if Tauri is not available
    fallbackDownload(csv, defaultFilename, 'text/csv;charset=utf-8;');
    return true;
  }
}

// Fallback for browser or when Tauri APIs are not available
function fallbackDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export selected molecules with their original CSV data
 * This preserves all original columns from the CSV file
 */
export async function exportSelectedAsCSV(
  originalRows: Record<string, unknown>[],
  headers: string[],
  defaultFilename: string = 'selected-molecules.csv'
): Promise<boolean> {
  if (originalRows.length === 0) {
    return false;
  }

  // Build CSV with original headers
  const escapeCSV = (value: unknown): string => {
    const str = String(value ?? '');
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = originalRows.map(row =>
    headers.map(header => escapeCSV(row[header])).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');

  try {
    // Open save dialog
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{
        name: 'CSV',
        extensions: ['csv']
      }]
    });

    if (filePath) {
      await writeTextFile(filePath, csv);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Export error:', error);
    // Fallback to browser download if Tauri is not available
    fallbackDownload(csv, defaultFilename, 'text/csv;charset=utf-8;');
    return true;
  }
}
