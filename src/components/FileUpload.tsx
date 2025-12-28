import { useCallback, useState, useRef } from 'react';
import Papa from 'papaparse';
import { useAppStore } from '../store/useAppStore';
import { initRDKit } from '../lib/rdkit';
import { computeFingerprints, precomputeSVGs } from '../lib/fingerprints';
import { getAdaptiveParams } from '../lib/dimensionality';
import type { MoleculeData, Dataset } from '../types';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processCSV = useCallback(
    async (file: File) => {
      setLoading(true);
      setProgress(0, 'Initializing RDKit...');

      try {
        // Initialize RDKit
        await initRDKit();
        setProgress(5, 'Parsing CSV...');

        // Parse CSV
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

        // Find SMILES and value columns
        const smilesCol = Object.keys(data[0]).find(
          (h) => h.toLowerCase().trim() === 'smiles'
        );
        const valueCol = Object.keys(data[0]).find((h) =>
          ['value', 'target', 'activity', 'y'].includes(h.toLowerCase().trim())
        );

        if (!smilesCol) {
          throw new Error('No "smiles" column found in CSV');
        }

        if (!valueCol) {
          throw new Error('No "value" column found in CSV (tried: value, target, activity, y)');
        }

        setProgress(10, 'Processing molecules...');

        // Extract molecule data
        const molecules: MoleculeData[] = data
          .map((row) => ({
            smiles: row[smilesCol]?.trim() || '',
            value: parseFloat(row[valueCol]) || 0,
            isValid: false,
          }))
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
        setProgress(80, 'Generating molecule images...');
        const finalMolecules = precomputeSVGs(processed);

        // Calculate value range
        const values = finalMolecules.filter((m) => m.isValid).map((m) => m.value);
        const valueRange = {
          min: Math.min(...values),
          max: Math.max(...values),
        };

        const dataset: Dataset = {
          id: crypto.randomUUID(),
          molecules: finalMolecules,
          valueRange,
          name: file.name,
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
    [setDataset, setLoading, setProgress, setError, setTSNEParams, setUMAPParams, setNeedsAnalysis]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      console.log('Dropped file:', file?.name, file?.type);
      if (file && (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv')) {
        processCSV(file);
      } else {
        setError(`Please drop a CSV file (got: ${file?.name || 'no file'})`);
      }
    },
    [processCSV, setError]
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
        processCSV(file);
      }
    },
    [processCSV]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
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
        smiles, value
      </span>
    </div>
  );
}
