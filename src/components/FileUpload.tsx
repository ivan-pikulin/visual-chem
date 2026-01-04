import { useCallback, useState, useRef } from 'react';
import Papa from 'papaparse';
import { useAppStore } from '../store/useAppStore';
import { initRDKit } from '../lib/rdkit';
import { computeFingerprints, precomputeSVGs, OperationCancelledError } from '../lib/fingerprints';
import { getAdaptiveParams } from '../lib/dimensionality';
import { loadProject, isVChemFile } from '../lib/project';
import type { MoleculeData, ColumnMapping, ColumnInfo } from '../types';

// Auto-detect patterns for SMILES column
const SMILES_PATTERNS = ['smiles', 'smile', 'mol', 'molecule', 'structure', 'canonical_smiles', 'smi'];
const VALUE_PATTERNS = ['value', 'target', 'activity', 'y', 'ic50', 'pki', 'score', 'affinity', 'logk', 'pk'];
const LABEL_PATTERNS = ['name', 'label', 'id', 'title', 'compound', 'molecule_name', 'mol_name'];
const GROUP_PATTERNS = ['group', 'category', 'class', 'type', 'series', 'source', 'dataset'];

interface FileUploadProps {
  /** If true, adds to existing datasets instead of replacing */
  addToExisting?: boolean;
  /** Callback when file is successfully processed */
  onComplete?: () => void;
  /** Compact mode for inline use */
  compact?: boolean;
  /** External ref to the file input for programmatic triggering */
  inputRef?: React.RefObject<HTMLInputElement>;
}

// Detect column type based on sample values
function detectColumnType(rows: Record<string, unknown>[], columnName: string): 'number' | 'string' {
  let numericCount = 0;
  let totalCount = 0;

  for (const row of rows.slice(0, 100)) {
    const val = row[columnName];
    if (val !== null && val !== undefined && val !== '') {
      totalCount++;
      const num = parseFloat(String(val));
      if (!isNaN(num) && isFinite(num)) {
        numericCount++;
      }
    }
  }

  return totalCount > 0 && numericCount / totalCount > 0.8 ? 'number' : 'string';
}

// Get sample values for a column
function getSampleValues(rows: Record<string, unknown>[], columnName: string, maxSamples = 5): string[] {
  const samples: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const val = row[columnName];
    if (val !== null && val !== undefined && val !== '') {
      const strVal = String(val);
      if (!seen.has(strVal) && strVal.length < 50) {
        seen.add(strVal);
        samples.push(strVal);
        if (samples.length >= maxSamples) break;
      }
    }
  }

  return samples;
}

// Auto-detect column mapping based on header names
function autoDetectMapping(headers: string[], rows: Record<string, unknown>[]): { mapping: ColumnMapping; columnInfo: ColumnInfo[] } {
  const mapping: ColumnMapping = {
    smiles: '',
    values: [],
    labels: [],
    group: undefined,
  };

  const usedColumns = new Set<string>();
  const columnInfo: ColumnInfo[] = [];

  // Build column info first
  for (const header of headers) {
    columnInfo.push({
      name: header,
      type: detectColumnType(rows, header),
      sampleValues: getSampleValues(rows, header),
    });
  }

  // Detect SMILES column
  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().trim();
    if (SMILES_PATTERNS.some(pattern => normalizedHeader === pattern || normalizedHeader.includes(pattern))) {
      mapping.smiles = header;
      usedColumns.add(header);
      break;
    }
  }

  // Detect value columns (numeric only)
  for (const header of headers) {
    if (usedColumns.has(header)) continue;
    const normalizedHeader = header.toLowerCase().trim();
    const info = columnInfo.find(c => c.name === header);

    if (info?.type === 'number' && VALUE_PATTERNS.some(pattern =>
      normalizedHeader === pattern || normalizedHeader.includes(pattern)
    )) {
      mapping.values.push(header);
      usedColumns.add(header);
    }
  }

  // Detect label columns
  for (const header of headers) {
    if (usedColumns.has(header)) continue;
    const normalizedHeader = header.toLowerCase().trim();

    if (LABEL_PATTERNS.some(pattern =>
      normalizedHeader === pattern || normalizedHeader.includes(pattern)
    )) {
      mapping.labels.push(header);
      usedColumns.add(header);
    }
  }

  // Detect group column
  for (const header of headers) {
    if (usedColumns.has(header)) continue;
    const normalizedHeader = header.toLowerCase().trim();

    if (GROUP_PATTERNS.some(pattern =>
      normalizedHeader === pattern || normalizedHeader.includes(pattern)
    )) {
      mapping.group = header;
      usedColumns.add(header);
      break;
    }
  }

  return { mapping, columnInfo };
}

export function FileUpload({ addToExisting = false, onComplete, compact = false, inputRef }: FileUploadProps) {
  const {
    datasets,
    setDataset,
    setError,
    setTSNEParams,
    setUMAPParams,
    setActiveColumns,
    addLoadingDataset,
    setDatasetLoadingState,
    updateDataset,
    removeDataset,
    loadProjectState,
  } = useAppStore();

  const [isDragging, setIsDragging] = useState(false);
  const internalFileInputRef = useRef<HTMLInputElement>(null);

  // Use external ref if provided, otherwise use internal
  const actualRef = inputRef || internalFileInputRef;

  // Process .vchem project file
  const processVChemFile = useCallback(
    async (file: File) => {
      try {
        const projectData = await loadProject(file);
        loadProjectState(projectData);
        onComplete?.();
      } catch (error) {
        console.error('Error loading project:', error);
        setError(error instanceof Error ? error.message : 'Failed to load project');
      }
    },
    [loadProjectState, setError, onComplete]
  );

  // Process CSV file in background with per-dataset progress
  const processFile = useCallback(
    async (file: File) => {
      // Generate ID upfront so we can track progress
      const datasetId = crypto.randomUUID();
      const abortController = new AbortController();
      const signal = abortController.signal;

      // Create placeholder dataset with loading state
      addLoadingDataset(datasetId, file.name);

      // Helper to update progress
      const updateProgress = (progress: number, message: string) => {
        setDatasetLoadingState(datasetId, { progress, message });
      };

      try {
        // Parse CSV
        updateProgress(0, 'Parsing CSV...');
        const text = await file.text();
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        });

        if (result.errors.length > 0) {
          throw new Error(`CSV parse error: ${result.errors[0].message}`);
        }

        const data = result.data;
        if (data.length === 0) {
          throw new Error('CSV file is empty');
        }

        const headers = result.meta.fields || Object.keys(data[0]);

        if (signal.aborted) throw new OperationCancelledError();

        // Auto-detect column mapping
        updateProgress(5, 'Detecting columns...');
        const { mapping, columnInfo } = autoDetectMapping(headers, data as Record<string, unknown>[]);

        // Initialize RDKit
        updateProgress(10, 'Initializing RDKit...');
        await initRDKit();

        if (signal.aborted) throw new OperationCancelledError();

        updateProgress(15, 'Processing molecules...');

        // Get first value and label columns as defaults
        const defaultValueCol = mapping.values[0];
        const defaultLabelCol = mapping.labels[0];

        // Extract molecule data with original row data
        const molecules: (MoleculeData & { originalRow: Record<string, unknown>; originalIndex: number })[] = data
          .map((row, index) => {
            const smilesCol = mapping.smiles || headers[0];
            const smiles = String(row[smilesCol] ?? '').trim();
            const value = defaultValueCol ? parseFloat(String(row[defaultValueCol])) : undefined;
            const label = defaultLabelCol ? String(row[defaultLabelCol] ?? '') : undefined;
            const group = mapping.group ? String(row[mapping.group] ?? '') : undefined;

            return {
              smiles,
              value: value !== undefined && !isNaN(value) ? value : undefined,
              label: label || undefined,
              group: group || undefined,
              isValid: false,
              originalRow: row as Record<string, unknown>,
              originalIndex: index,
            };
          })
          .filter((m) => m.smiles.length > 0);

        if (molecules.length === 0) {
          throw new Error('No valid SMILES found in file');
        }

        // Compute fingerprints
        updateProgress(20, 'Computing fingerprints...');
        const processed = await computeFingerprints(molecules, (p) => {
          const percent = 20 + (p.current / p.total) * 30;
          updateProgress(percent, `Fingerprints: ${p.current}/${p.total}`);
        }, signal);

        const validMolecules = processed.filter((m) => m.isValid);
        if (validMolecules.length === 0) {
          throw new Error('No valid molecules after fingerprint computation');
        }

        // Get adaptive parameters based on dataset size
        const adaptiveParams = getAdaptiveParams(validMolecules.length);
        setTSNEParams(adaptiveParams.tsne);
        setUMAPParams(adaptiveParams.umap);

        // Generate SVG images for molecules
        updateProgress(50, 'Generating images...');
        const finalMolecules = await precomputeSVGs(processed, (current, total) => {
          const percent = 50 + (current / total) * 45;
          updateProgress(percent, `Images: ${current}/${total}`);
        }, signal);

        // Calculate value range
        let valueRange: { min: number; max: number } | null = null;
        if (mapping.values.length > 0) {
          const values = finalMolecules
            .filter((m) => m.isValid && m.value !== undefined)
            .map((m) => m.value!);
          if (values.length > 0) {
            valueRange = {
              min: Math.min(...values),
              max: Math.max(...values),
            };
          }
        }

        // Extract unique groups
        let groups: string[] | undefined;
        if (mapping.group) {
          const uniqueGroups = new Set<string>();
          for (const mol of finalMolecules) {
            if (mol.group) {
              uniqueGroups.add(mol.group);
            }
          }
          groups = Array.from(uniqueGroups).sort();
        }

        // Build display settings from auto-detected columns
        const displaySettings = {
          valueExpression: mapping.values[0] ? `@${mapping.values[0]}` : '',
          labelTemplate: mapping.labels[0] ? `@${mapping.labels[0]}` : '',
        };

        // Update the placeholder dataset with full data
        updateDataset(datasetId, {
          molecules: finalMolecules,
          valueRange,
          csvHeaders: headers,
          columnMapping: mapping,
          groups,
          columnInfo,
          totalRows: data.length,
          displaySettings,
        });

        // Set active columns if this is the first dataset
        if (!addToExisting || datasets.length <= 1) {
          setActiveColumns({
            value: mapping.values[0],
            label: mapping.labels[0],
          });
        }

        onComplete?.();
      } catch (error) {
        if (error instanceof OperationCancelledError) {
          // Remove the placeholder dataset
          removeDataset(datasetId);
          return;
        }
        console.error('Error processing file:', error);
        // Update loading state with error
        setDatasetLoadingState(datasetId, {
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [datasets, setDataset, setError, setTSNEParams, setUMAPParams, setActiveColumns, addLoadingDataset, setDatasetLoadingState, updateDataset, removeDataset, addToExisting, onComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (!file) {
        setError('No file dropped');
        return;
      }

      if (isVChemFile(file)) {
        processVChemFile(file);
      } else if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
        processFile(file);
      } else {
        setError(`Please drop a CSV or .vchem file (got: ${file.name})`);
      }
    },
    [processFile, processVChemFile, setError]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (isVChemFile(file)) {
          processVChemFile(file);
        } else {
          processFile(file);
        }
      }
      e.target.value = '';
    },
    [processFile, processVChemFile]
  );

  const handleClick = useCallback(() => {
    actualRef.current?.click();
  }, [actualRef]);

  return (
    <div
      className={`file-upload ${isDragging ? 'dragging' : ''} ${compact ? 'compact' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
    >
      <input
        ref={actualRef}
        type="file"
        accept=".csv,.vchem"
        onChange={handleFileSelect}
        className="sr-only"
      />

      {compact ? (
        <>
          <svg
            className="file-upload-icon-sm"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="file-upload-compact-text">
            {isDragging ? 'Drop file' : 'Add CSV'}
          </span>
        </>
      ) : (
        <>
          <svg
            className="file-upload-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>

          <p className="file-upload-title">
            {isDragging ? 'Drop your file here' : 'Upload File'}
          </p>
          <p className="file-upload-subtitle">
            Drag and drop or click to select
          </p>
          <span className="file-upload-hint">
            CSV (SMILES auto-detected) or .vchem project
          </span>
        </>
      )}
    </div>
  );
}
