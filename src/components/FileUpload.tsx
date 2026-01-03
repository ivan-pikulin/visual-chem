import { useCallback, useState, useRef } from 'react';
import Papa from 'papaparse';
import { useAppStore } from '../store/useAppStore';
import { initRDKit } from '../lib/rdkit';
import { computeFingerprints, precomputeSVGs } from '../lib/fingerprints';
import { getAdaptiveParams } from '../lib/dimensionality';
import { ColumnMappingDialog } from './ColumnMappingDialog';
import type { MoleculeData, Dataset, ColumnMapping, ParsedCSVData } from '../types';

export function FileUpload() {
  const {
    setDataset,
    setLoading,
    setProgress,
    setError,
    setTSNEParams,
    setUMAPParams,
    setNeedsAnalysis,
  } = useAppStore();

  const [isDragging, setIsDragging] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedCSVData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse CSV and show mapping dialog
  const parseCSV = useCallback(
    async (file: File) => {
      try {
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

        setParsedData({
          headers,
          rows: data as Record<string, unknown>[],
          fileName: file.name,
        });
      } catch (error) {
        console.error('Error parsing CSV:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
      }
    },
    [setError]
  );

  // Process data after column mapping is confirmed
  const processWithMapping = useCallback(
    async (mapping: ColumnMapping) => {
      if (!parsedData) return;

      setLoading(true);
      setProgress(0, 'Initializing RDKit...');
      setParsedData(null); // Close dialog

      try {
        // Initialize RDKit
        await initRDKit();
        setProgress(10, 'Processing molecules...');

        // Extract molecule data with original row data
        const molecules: (MoleculeData & { originalRow: Record<string, unknown>; originalIndex: number })[] = parsedData.rows
          .map((row, index) => {
            const smiles = String(row[mapping.smiles] ?? '').trim();
            const value = mapping.value ? parseFloat(String(row[mapping.value])) : undefined;
            const label = mapping.label ? String(row[mapping.label] ?? '') : undefined;
            const group = mapping.group ? String(row[mapping.group] ?? '') : undefined;

            return {
              smiles,
              value: value !== undefined && !isNaN(value) ? value : undefined,
              label: label || undefined,
              group: group || undefined,
              isValid: false,
              originalRow: row,
              originalIndex: index,
            };
          })
          .filter((m) => m.smiles.length > 0);

        if (molecules.length === 0) {
          throw new Error('No valid SMILES found in file');
        }

        // Compute fingerprints
        setProgress(15, 'Computing fingerprints...');
        const processed = await computeFingerprints(molecules, (p) => {
          const percent = 15 + (p.current / p.total) * 35;
          setProgress(
            percent,
            `Computing fingerprints: ${p.current}/${p.total} (${p.validCount} valid)`
          );
        });

        const validMolecules = processed.filter((m) => m.isValid);
        if (validMolecules.length === 0) {
          throw new Error('No valid molecules after fingerprint computation');
        }

        // Get adaptive parameters based on dataset size
        const adaptiveParams = getAdaptiveParams(validMolecules.length);
        setTSNEParams(adaptiveParams.tsne);
        setUMAPParams(adaptiveParams.umap);

        // Generate SVG images for molecules (no coordinates yet)
        setProgress(50, 'Generating molecule images...');
        const finalMolecules = await precomputeSVGs(processed, (current, total) => {
          const percent = 50 + (current / total) * 45;
          setProgress(percent, `Generating images: ${current}/${total}`);
        });

        // Calculate value range (only if value column was mapped)
        let valueRange: { min: number; max: number } | null = null;
        if (mapping.value) {
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

        // Extract unique groups if group column was mapped
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

        const dataset: Dataset = {
          id: crypto.randomUUID(),
          molecules: finalMolecules,
          valueRange,
          name: parsedData.fileName,
          csvHeaders: parsedData.headers,
          columnMapping: mapping,
          groups,
        };

        setDataset(dataset);
        setProgress(100, 'File loaded! Configure parameters and run analysis.');
        setNeedsAnalysis(true);
        setLoading(false);
      } catch (error) {
        console.error('Error processing file:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
        setLoading(false);
      }
    },
    [parsedData, setDataset, setLoading, setProgress, setError, setTSNEParams, setUMAPParams, setNeedsAnalysis]
  );

  const handleCancelMapping = useCallback(() => {
    setParsedData(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      console.log('Dropped file:', file?.name, file?.type);
      if (file && (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv')) {
        parseCSV(file);
      } else {
        setError(`Please drop a CSV file (got: ${file?.name || 'no file'})`);
      }
    },
    [parseCSV, setError]
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
        parseCSV(file);
      }
      // Reset input value so the same file can be selected again
      e.target.value = '';
    },
    [parseCSV]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <>
      <div
        className={`file-upload ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="sr-only"
        />

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
          {isDragging ? 'Drop your file here' : 'Upload CSV File'}
        </p>
        <p className="file-upload-subtitle">
          Drag and drop or click to select
        </p>
        <span className="file-upload-hint">
          SMILES required, other columns optional
        </span>
      </div>

      {parsedData && (
        <ColumnMappingDialog
          parsedData={parsedData}
          onConfirm={processWithMapping}
          onCancel={handleCancelMapping}
        />
      )}
    </>
  );
}
