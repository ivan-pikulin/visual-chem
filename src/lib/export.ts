import Plotly from 'plotly.js-dist-min';

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

export function exportInteractiveHTML(
  plotData: Plotly.Data[],
  layout: Partial<Plotly.Layout>,
  filename: string = 'visual-chem-plot.html'
): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Chem Plot</title>
  <script src="https://cdn.plot.ly/plotly-2.35.0.min.js"></script>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; }
    #plot { width: 100%; height: 90vh; }
    h1 { color: #333; margin-bottom: 20px; }
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
    })};
    Plotly.newPlot('plot', data, layout, { responsive: true });
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportDataAsCSV(
  data: Array<{
    smiles: string;
    value: number;
    x: number;
    y: number;
    cluster?: number;
  }>,
  filename: string = 'visual-chem-data.csv'
): void {
  const headers = ['SMILES', 'Value', 'X', 'Y'];
  if (data.length > 0 && data[0].cluster !== undefined) {
    headers.push('Cluster');
  }

  const rows = data.map(row => {
    const values = [
      `"${row.smiles.replace(/"/g, '""')}"`,
      row.value.toString(),
      row.x.toString(),
      row.y.toString(),
    ];
    if (row.cluster !== undefined) {
      values.push(row.cluster.toString());
    }
    return values.join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
