/**
 * .vchem project file format - save and load complete project state
 *
 * Format: ZIP archive containing:
 * - manifest.json: version and metadata
 * - project.json: DR settings, clustering, visualization
 * - datasets/{id}/metadata.json: dataset metadata
 * - datasets/{id}/molecules.json: molecule data (without fingerprints/svg)
 * - datasets/{id}/fingerprints.json: base64-encoded fingerprints
 * - datasets/{id}/images.json: SVG images
 * - state.json: UI state (selection)
 */

import JSZip from 'jszip';
import type {
  AppState,
  Dataset,
  ProcessedMolecule,
  VChemManifest,
  VChemProject,
  VChemDatasetMetadata,
  VChemMoleculeData,
  VChemFingerprints,
  VChemImages,
  VChemState,
} from '../types';

const VCHEM_VERSION = '1.0.0';
const APP_NAME = 'Visual Chem';
const APP_VERSION = '0.1.0';

// ============ FINGERPRINT ENCODING ============

/**
 * Pack 2048-bit fingerprint into 256 bytes, then encode as Base64
 */
function fingerprintToBase64(fp: number[]): string {
  const bytes = new Uint8Array(256); // 2048 / 8 = 256
  for (let i = 0; i < 2048; i++) {
    if (fp[i]) {
      bytes[Math.floor(i / 8)] |= (1 << (i % 8));
    }
  }
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Decode Base64 to 2048-bit fingerprint array
 */
function base64ToFingerprint(b64: string): number[] {
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }

  const fp: number[] = new Array(2048);
  for (let i = 0; i < 2048; i++) {
    fp[i] = (bytes[Math.floor(i / 8)] & (1 << (i % 8))) ? 1 : 0;
  }
  return fp;
}

// ============ SVG MINIFICATION ============

/**
 * Minify SVG by removing comments and collapsing whitespace
 */
function minifySvg(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
    .replace(/>\s+</g, '><')          // Remove whitespace between tags
    .replace(/\s{2,}/g, ' ')          // Collapse multiple spaces
    .trim();
}

// ============ BROWSER FILE DOWNLOAD ============

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ SAVE PROJECT ============

export interface SaveProjectOptions {
  filename?: string;
  includeFingerprints?: boolean;
  includeSvg?: boolean;
}

/**
 * Save current app state to .vchem file
 */
export async function saveProject(
  state: AppState,
  options: SaveProjectOptions = {}
): Promise<void> {
  const {
    filename = 'project.vchem',
    includeFingerprints = true,
    includeSvg = true,
  } = options;

  const zip = new JSZip();

  // 1. Create manifest
  const manifest: VChemManifest = {
    version: VCHEM_VERSION,
    format: 'vchem',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    application: {
      name: APP_NAME,
      version: APP_VERSION,
    },
    compression: {
      method: 'deflate',
      fingerprintsFormat: 'base64',
      svgCompression: true,
    },
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // 2. Create project.json
  const project: VChemProject = {
    activeDatasetId: state.activeDatasetId,
    drMethod: state.drMethod,
    tsneParams: state.tsneParams,
    umapParams: state.umapParams,
    clustering: state.clustering,
    clusterLabels: state.clusterLabels,
    outlierSettings: state.outlierSettings,
    visualization: state.visualization,
    toolbar: state.toolbar,
    datasetIds: state.datasets.map(d => d.id),
  };
  zip.file('project.json', JSON.stringify(project, null, 2));

  // 3. Create datasets folder
  const datasetsFolder = zip.folder('datasets');

  for (const dataset of state.datasets) {
    const datasetFolder = datasetsFolder!.folder(dataset.id);

    // 3.1 Metadata
    const metadata: VChemDatasetMetadata = {
      id: dataset.id,
      name: dataset.name,
      color: dataset.color,
      visible: dataset.visible,
      pointShape: dataset.pointShape,
      pointSize: dataset.pointSize,
      valueRange: dataset.valueRange,
      csvHeaders: dataset.csvHeaders,
      columnMapping: dataset.columnMapping,
      columnInfo: dataset.columnInfo,
      groups: dataset.groups,
      displaySettings: dataset.displaySettings,
      totalRows: dataset.totalRows,
      moleculeCount: dataset.molecules.length,
    };
    datasetFolder!.file('metadata.json', JSON.stringify(metadata, null, 2));

    // 3.2 Molecules (without fingerprints and svg)
    const moleculesData: VChemMoleculeData[] = dataset.molecules.map(mol => ({
      smiles: mol.smiles,
      value: mol.value,
      label: mol.label,
      group: mol.group,
      isValid: mol.isValid,
      coordinates: mol.coordinates,
      cluster: mol.cluster,
      isOutlier: mol.isOutlier,
      originalIndex: mol.originalIndex,
      originalRow: mol.originalRow,
    }));
    datasetFolder!.file('molecules.json', JSON.stringify({ molecules: moleculesData }));

    // 3.3 Fingerprints (Base64 encoded)
    if (includeFingerprints) {
      const validMolecules = dataset.molecules.filter(
        m => m.isValid && m.fingerprint?.length === 2048
      );
      const fingerprints: VChemFingerprints = {
        encoding: 'base64',
        bitLength: 2048,
        data: validMolecules.map(m => fingerprintToBase64(m.fingerprint)),
      };
      datasetFolder!.file('fingerprints.json', JSON.stringify(fingerprints));
    }

    // 3.4 Images (SVG)
    if (includeSvg) {
      const images: Record<string, string> = {};
      dataset.molecules.forEach((mol, idx) => {
        if (mol.svg) {
          images[String(idx)] = minifySvg(mol.svg);
        }
      });
      const imagesData: VChemImages = {
        compression: 'none',
        images,
      };
      datasetFolder!.file('images.json', JSON.stringify(imagesData));
    }
  }

  // 4. Create state.json
  const uiState: VChemState = {
    selectedIndices: state.selectedIndices,
  };
  zip.file('state.json', JSON.stringify(uiState, null, 2));

  // 5. Generate ZIP blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // 6. Download file
  downloadBlob(blob, filename);
}

// ============ LOAD PROJECT ============

export interface LoadProjectResult {
  datasets: Dataset[];
  activeDatasetId: string | null;
  drMethod: AppState['drMethod'];
  tsneParams: AppState['tsneParams'];
  umapParams: AppState['umapParams'];
  clustering: AppState['clustering'];
  clusterLabels: AppState['clusterLabels'];
  outlierSettings: AppState['outlierSettings'];
  visualization: AppState['visualization'];
  toolbar: AppState['toolbar'];
  selectedIndices: number[];
}

/**
 * Load project from .vchem file
 */
export async function loadProject(file: File): Promise<LoadProjectResult> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Read and validate manifest
  const manifestJson = await zip.file('manifest.json')?.async('string');
  if (!manifestJson) {
    throw new Error('Invalid .vchem file: missing manifest.json');
  }
  const manifest: VChemManifest = JSON.parse(manifestJson);

  // Version check
  if (!manifest.version.startsWith('1.')) {
    throw new Error(`Unsupported .vchem version: ${manifest.version}`);
  }

  // 2. Read project
  const projectJson = await zip.file('project.json')?.async('string');
  if (!projectJson) {
    throw new Error('Invalid .vchem file: missing project.json');
  }
  const project: VChemProject = JSON.parse(projectJson);

  // 3. Read datasets
  const datasets: Dataset[] = [];

  for (const datasetId of project.datasetIds) {
    // 3.1 Metadata
    const metadataJson = await zip.file(`datasets/${datasetId}/metadata.json`)?.async('string');
    if (!metadataJson) {
      console.warn(`Missing metadata for dataset ${datasetId}, skipping`);
      continue;
    }
    const metadata: VChemDatasetMetadata = JSON.parse(metadataJson);

    // 3.2 Molecules
    const moleculesJson = await zip.file(`datasets/${datasetId}/molecules.json`)?.async('string');
    if (!moleculesJson) {
      console.warn(`Missing molecules for dataset ${datasetId}, skipping`);
      continue;
    }
    const { molecules: moleculesData }: { molecules: VChemMoleculeData[] } = JSON.parse(moleculesJson);

    // 3.3 Fingerprints (optional)
    let fingerprints: number[][] = [];
    const fingerprintsJson = await zip.file(`datasets/${datasetId}/fingerprints.json`)?.async('string');
    if (fingerprintsJson) {
      const fpData: VChemFingerprints = JSON.parse(fingerprintsJson);
      fingerprints = fpData.data.map(b64 => base64ToFingerprint(b64));
    }

    // 3.4 Images (optional)
    let images: Record<string, string> = {};
    const imagesJson = await zip.file(`datasets/${datasetId}/images.json`)?.async('string');
    if (imagesJson) {
      const imagesData: VChemImages = JSON.parse(imagesJson);
      images = imagesData.images;
    }

    // Reconstruct molecules
    let fpIndex = 0;
    const molecules: ProcessedMolecule[] = moleculesData.map((mol, idx) => {
      const molecule: ProcessedMolecule = {
        smiles: mol.smiles,
        value: mol.value,
        label: mol.label,
        group: mol.group,
        isValid: mol.isValid,
        coordinates: mol.coordinates,
        cluster: mol.cluster,
        isOutlier: mol.isOutlier,
        originalIndex: mol.originalIndex,
        originalRow: mol.originalRow,
        fingerprint: mol.isValid && fingerprints[fpIndex] ? fingerprints[fpIndex++] : [],
        svg: images[String(idx)],
      };
      return molecule;
    });

    datasets.push({
      id: metadata.id,
      name: metadata.name,
      color: metadata.color,
      visible: metadata.visible ?? true,
      pointShape: metadata.pointShape,
      pointSize: metadata.pointSize,
      molecules,
      valueRange: metadata.valueRange,
      csvHeaders: metadata.csvHeaders,
      columnMapping: metadata.columnMapping,
      columnInfo: metadata.columnInfo,
      groups: metadata.groups,
      displaySettings: metadata.displaySettings,
      totalRows: metadata.totalRows,
    });
  }

  // 4. Read state (optional)
  let selectedIndices: number[] = [];
  const stateJson = await zip.file('state.json')?.async('string');
  if (stateJson) {
    const uiState: VChemState = JSON.parse(stateJson);
    selectedIndices = uiState.selectedIndices || [];
  }

  return {
    datasets,
    activeDatasetId: project.activeDatasetId,
    drMethod: project.drMethod,
    tsneParams: project.tsneParams,
    umapParams: project.umapParams,
    clustering: project.clustering,
    clusterLabels: project.clusterLabels,
    outlierSettings: project.outlierSettings,
    visualization: project.visualization,
    toolbar: project.toolbar,
    selectedIndices,
  };
}

/**
 * Check if file is a .vchem project file
 */
export function isVChemFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.vchem');
}
