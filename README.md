# VisualChem

Desktop application for interactive visualization of molecular datasets using dimensionality reduction.

## Features

- **CSV Import**: Load datasets with SMILES and value columns
- **ECFP Fingerprints**: Morgan fingerprints (radius=2, 2048 bits) via RDKit.js
- **Dimensionality Reduction**:
  - t-SNE (adaptive perplexity)
  - UMAP (configurable neighbors, min_dist)
  - PCA (fast, deterministic)
- **Interactive Visualization**:
  - WebGL scatter plot with Plotly.js
  - Heatmap coloring by value (Inferno colorscale)
  - Molecule structure on hover
  - Zoom, pan, scroll interactions

## Tech Stack

- **Tauri v2** - Desktop framework
- **React 18 + TypeScript** - UI
- **Vite** - Build tool
- **RDKit.js** - Cheminformatics (WebAssembly)
- **Plotly.js** - Visualization
- **UMAP-js / tsne-js** - Dimensionality reduction
- **Tailwind CSS** - Styling
- **Zustand** - State management

## Installation

### Prerequisites

- Node.js 20+
- Rust (for Tauri native build)
- yarn

### Setup

```bash
# Install dependencies
yarn install

# Copy RDKit WASM files to public (if not already done)
cp node_modules/@rdkit/rdkit/dist/RDKit_minimal.js public/
cp node_modules/@rdkit/rdkit/dist/RDKit_minimal.wasm public/

# Run development server
yarn dev

# Build for production
yarn build

# Build Tauri desktop app (requires Rust)
yarn tauri build
```

## Usage

1. Prepare a CSV file with columns:
   - `smiles` - SMILES molecular representation
   - `value` (or `target`, `activity`, `y`) - Numeric property value

2. Open the application and upload your CSV

3. Select dimensionality reduction method (UMAP recommended)

4. Adjust parameters if needed and click "Rerun Analysis"

5. Explore the interactive scatter plot:
   - Hover over points to see molecule structures
   - Scroll to zoom, drag to pan
   - Use toolbar for additional controls

## Example CSV

```csv
smiles,value
CCO,0.5
c1ccccc1,0.3
CC(=O)O,0.45
```

## Project Structure

```
visual-chem/
├── src/
│   ├── components/     # React components
│   ├── lib/           # Core logic
│   │   ├── rdkit.ts   # RDKit.js wrapper
│   │   ├── fingerprints.ts
│   │   └── dimensionality/
│   ├── store/         # Zustand state
│   └── types/         # TypeScript types
├── src-tauri/         # Rust backend
└── public/            # Static assets (RDKit WASM)
```

## Acknowledgments

Based on [ChemPlot](https://github.com/mcsorkun/ChemPlot) architecture.
