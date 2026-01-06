/**
 * Project manager - handles file operations, dirty state, window title, and keyboard shortcuts
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeFile, readFile } from '@tauri-apps/plugin-fs';
import JSZip from 'jszip';
import type { AppState } from '../types';
import { useAppStore } from '../store/useAppStore';

const APP_NAME = 'ChemPlot';
const VCHEM_VERSION = '1.0.0';
const APP_VERSION = '0.1.0';
const AUTOSAVE_INTERVAL = 60000; // 1 minute

// ============ STATE ============

interface ProjectState {
  currentFilePath: string | null;
  isDirty: boolean;
  lastSavedState: string | null; // JSON hash of last saved state for comparison
  autosaveEnabled: boolean;
  autosaveInterval: number;
}

let projectState: ProjectState = {
  currentFilePath: null,
  isDirty: false,
  lastSavedState: null,
  autosaveEnabled: true,
  autosaveInterval: AUTOSAVE_INTERVAL,
};

let autosaveTimer: ReturnType<typeof setInterval> | null = null;
let storeUnsubscribe: (() => void) | null = null;

// Listeners for state changes
type ProjectStateListener = (state: ProjectState) => void;
const listeners: Set<ProjectStateListener> = new Set();

function notifyListeners() {
  listeners.forEach(listener => listener(projectState));
}

export function subscribeToProjectState(listener: ProjectStateListener): () => void {
  listeners.add(listener);
  listener(projectState); // Initial call
  return () => listeners.delete(listener);
}

export function getProjectState(): ProjectState {
  return { ...projectState };
}

// ============ FINGERPRINT ENCODING ============

function fingerprintToBase64(fp: number[]): string {
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 2048; i++) {
    if (fp[i]) {
      bytes[Math.floor(i / 8)] |= (1 << (i % 8));
    }
  }
  return btoa(String.fromCharCode(...bytes));
}

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

function minifySvg(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ============ WINDOW TITLE ============

async function updateWindowTitle() {
  try {
    const window = getCurrentWindow();
    let title = APP_NAME;

    if (projectState.currentFilePath) {
      // Extract filename from path
      const filename = projectState.currentFilePath.split('/').pop() || projectState.currentFilePath.split('\\').pop() || projectState.currentFilePath;
      title = `${filename} - ${APP_NAME}`;
    }

    if (projectState.isDirty) {
      title = `• ${title}`;
    }

    await window.setTitle(title);
  } catch (error) {
    console.warn('Failed to update window title:', error);
  }
}

// ============ DIRTY STATE ============

function computeStateHash(state: AppState): string {
  // Create a minimal representation of state for comparison
  const relevantState = {
    datasets: state.datasets.map(d => ({
      id: d.id,
      name: d.name,
      molecules: d.molecules.map(m => ({
        smiles: m.smiles,
        value: m.value,
        label: m.label,
        group: m.group,
        coordinates: m.coordinates,
        cluster: m.cluster,
        isOutlier: m.isOutlier,
      })),
      color: d.color,
      visible: d.visible,
      pointShape: d.pointShape,
      pointSize: d.pointSize,
      columnMapping: d.columnMapping,
      displaySettings: d.displaySettings,
      filters: d.filters,
    })),
    activeDatasetId: state.activeDatasetId,
    drMethod: state.drMethod,
    tsneParams: state.tsneParams,
    umapParams: state.umapParams,
    clustering: state.clustering,
    clusterLabels: state.clusterLabels,
    outlierSettings: state.outlierSettings,
    visualization: state.visualization,
    toolbar: state.toolbar,
    selectedIndices: state.selectedIndices,
  };
  return JSON.stringify(relevantState);
}

function checkDirtyState() {
  const currentHash = computeStateHash(useAppStore.getState());
  const wasDirty = projectState.isDirty;
  projectState.isDirty = projectState.lastSavedState !== currentHash;

  if (wasDirty !== projectState.isDirty) {
    updateWindowTitle();
    notifyListeners();
  }
}

// ============ SAVE/LOAD ============

async function createProjectZip(state: AppState): Promise<Uint8Array> {
  const zip = new JSZip();

  // 1. Manifest
  const manifest = {
    version: VCHEM_VERSION,
    format: 'vchem',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    application: { name: APP_NAME, version: APP_VERSION },
    compression: { method: 'deflate', fingerprintsFormat: 'base64', svgCompression: true },
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // 2. Project settings
  const project = {
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

  // 3. Datasets
  const datasetsFolder = zip.folder('datasets');

  for (const dataset of state.datasets) {
    const datasetFolder = datasetsFolder!.folder(dataset.id);

    // Metadata
    const metadata = {
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
      filters: dataset.filters,
    };
    datasetFolder!.file('metadata.json', JSON.stringify(metadata, null, 2));

    // Molecules
    const moleculesData = dataset.molecules.map(mol => ({
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

    // Fingerprints
    const validMolecules = dataset.molecules.filter(m => m.isValid && m.fingerprint?.length === 2048);
    const fingerprints = {
      encoding: 'base64',
      bitLength: 2048,
      data: validMolecules.map(m => fingerprintToBase64(m.fingerprint)),
    };
    datasetFolder!.file('fingerprints.json', JSON.stringify(fingerprints));

    // Images
    const images: Record<string, string> = {};
    dataset.molecules.forEach((mol, idx) => {
      if (mol.svg) {
        images[String(idx)] = minifySvg(mol.svg);
      }
    });
    datasetFolder!.file('images.json', JSON.stringify({ compression: 'none', images }));
  }

  // 4. UI State
  zip.file('state.json', JSON.stringify({ selectedIndices: state.selectedIndices }, null, 2));

  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

async function parseProjectZip(data: Uint8Array) {
  const zip = await JSZip.loadAsync(data);

  // Read manifest
  const manifestJson = await zip.file('manifest.json')?.async('string');
  if (!manifestJson) throw new Error('Invalid .vchem file: missing manifest.json');
  const manifest = JSON.parse(manifestJson);
  if (!manifest.version.startsWith('1.')) {
    throw new Error(`Unsupported .vchem version: ${manifest.version}`);
  }

  // Read project
  const projectJson = await zip.file('project.json')?.async('string');
  if (!projectJson) throw new Error('Invalid .vchem file: missing project.json');
  const project = JSON.parse(projectJson);

  // Read datasets
  const datasets = [];

  for (const datasetId of project.datasetIds) {
    const metadataJson = await zip.file(`datasets/${datasetId}/metadata.json`)?.async('string');
    if (!metadataJson) continue;
    const metadata = JSON.parse(metadataJson);

    const moleculesJson = await zip.file(`datasets/${datasetId}/molecules.json`)?.async('string');
    if (!moleculesJson) continue;
    const { molecules: moleculesData } = JSON.parse(moleculesJson);

    // Fingerprints
    let fingerprints: number[][] = [];
    const fpJson = await zip.file(`datasets/${datasetId}/fingerprints.json`)?.async('string');
    if (fpJson) {
      const fpData = JSON.parse(fpJson);
      fingerprints = fpData.data.map((b64: string) => base64ToFingerprint(b64));
    }

    // Images
    let images: Record<string, string> = {};
    const imagesJson = await zip.file(`datasets/${datasetId}/images.json`)?.async('string');
    if (imagesJson) {
      const imagesData = JSON.parse(imagesJson);
      images = imagesData.images;
    }

    // Reconstruct molecules
    let fpIndex = 0;
    const molecules = moleculesData.map((mol: any, idx: number) => ({
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
    }));

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
      filters: metadata.filters,
    });
  }

  // Read state
  let selectedIndices: number[] = [];
  const stateJson = await zip.file('state.json')?.async('string');
  if (stateJson) {
    const uiState = JSON.parse(stateJson);
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

export async function saveProjectToPath(filePath: string): Promise<void> {
  const state = useAppStore.getState();
  const zipData = await createProjectZip(state);
  await writeFile(filePath, zipData);

  projectState.currentFilePath = filePath;
  projectState.lastSavedState = computeStateHash(state);
  projectState.isDirty = false;

  updateWindowTitle();
  notifyListeners();
}

export async function saveProject(): Promise<boolean> {
  if (projectState.currentFilePath) {
    await saveProjectToPath(projectState.currentFilePath);
    return true;
  } else {
    return await saveProjectAs();
  }
}

export async function saveProjectAs(): Promise<boolean> {
  const state = useAppStore.getState();
  if (state.datasets.length === 0) {
    return false;
  }

  const filePath = await save({
    filters: [{ name: 'ChemPlot Project', extensions: ['vchem'] }],
    defaultPath: projectState.currentFilePath || 'project.vchem',
  });

  if (filePath) {
    await saveProjectToPath(filePath);
    return true;
  }
  return false;
}

export async function openProjectFromPath(filePath: string): Promise<boolean> {
  const data = await readFile(filePath);
  const projectData = await parseProjectZip(data);

  useAppStore.getState().loadProjectState(projectData);

  projectState.currentFilePath = filePath;
  projectState.lastSavedState = computeStateHash(useAppStore.getState());
  projectState.isDirty = false;

  updateWindowTitle();
  notifyListeners();
  return true;
}

export async function openProject(): Promise<boolean> {
  const filePath = await open({
    filters: [{ name: 'ChemPlot Project', extensions: ['vchem'] }],
    multiple: false,
  });

  if (filePath && typeof filePath === 'string') {
    return await openProjectFromPath(filePath);
  }
  return false;
}

export function newProject() {
  useAppStore.getState().reset();
  projectState.currentFilePath = null;
  projectState.lastSavedState = computeStateHash(useAppStore.getState());
  projectState.isDirty = false;

  updateWindowTitle();
  notifyListeners();
}

// ============ AUTOSAVE ============

function performAutosave() {
  if (projectState.autosaveEnabled && projectState.isDirty && projectState.currentFilePath) {
    saveProject().catch(err => console.warn('Autosave failed:', err));
  }
}

export function setAutosaveEnabled(enabled: boolean) {
  projectState.autosaveEnabled = enabled;
  notifyListeners();

  if (enabled && !autosaveTimer) {
    autosaveTimer = setInterval(performAutosave, projectState.autosaveInterval);
  } else if (!enabled && autosaveTimer) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
}

export function setAutosaveInterval(intervalMs: number) {
  projectState.autosaveInterval = intervalMs;

  if (autosaveTimer) {
    clearInterval(autosaveTimer);
    autosaveTimer = setInterval(performAutosave, intervalMs);
  }
}

// ============ KEYBOARD SHORTCUTS ============

function handleKeyDown(event: KeyboardEvent) {
  const isMeta = event.metaKey || event.ctrlKey;

  if (isMeta && event.key === 's') {
    event.preventDefault();
    if (event.shiftKey) {
      saveProjectAs();
    } else {
      saveProject();
    }
  } else if (isMeta && event.key === 'o') {
    event.preventDefault();
    openProject();
  } else if (isMeta && event.key === 'n') {
    event.preventDefault();
    if (!projectState.isDirty || confirm('You have unsaved changes. Create a new project anyway?')) {
      newProject();
    }
  }
}

// ============ INITIALIZATION ============

export function initProjectManager() {
  // Subscribe to store changes for dirty state tracking
  storeUnsubscribe = useAppStore.subscribe(() => {
    checkDirtyState();
  });

  // Set initial state
  projectState.lastSavedState = computeStateHash(useAppStore.getState());

  // Setup keyboard shortcuts
  window.addEventListener('keydown', handleKeyDown);

  // Setup autosave
  if (projectState.autosaveEnabled) {
    autosaveTimer = setInterval(performAutosave, projectState.autosaveInterval);
  }

  // Update window title
  updateWindowTitle();
}

export function destroyProjectManager() {
  if (storeUnsubscribe) {
    storeUnsubscribe();
    storeUnsubscribe = null;
  }

  window.removeEventListener('keydown', handleKeyDown);

  if (autosaveTimer) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
}

// ============ EXPORTS FOR EXTERNAL USE ============

export function markDirty() {
  if (!projectState.isDirty) {
    projectState.isDirty = true;
    updateWindowTitle();
    notifyListeners();
  }
}

export function getCurrentFilePath(): string | null {
  return projectState.currentFilePath;
}

export function isDirty(): boolean {
  return projectState.isDirty;
}

export function isAutosaveEnabled(): boolean {
  return projectState.autosaveEnabled;
}
