import { getMorganFingerprint, isValidSmiles, getMoleculeSVG } from './rdkit';
import type { MoleculeData, ProcessedMolecule } from '../types';

export interface FingerprintProgress {
  current: number;
  total: number;
  validCount: number;
}

export async function computeFingerprints(
  molecules: MoleculeData[],
  onProgress?: (progress: FingerprintProgress) => void
): Promise<ProcessedMolecule[]> {
  const results: ProcessedMolecule[] = [];
  const batchSize = 50;

  for (let i = 0; i < molecules.length; i += batchSize) {
    const batch = molecules.slice(i, Math.min(i + batchSize, molecules.length));

    for (const mol of batch) {
      const fingerprint = getMorganFingerprint(mol.smiles);

      results.push({
        ...mol,
        isValid: fingerprint !== null,
        fingerprint: fingerprint ?? [],
      });
    }

    if (onProgress) {
      onProgress({
        current: Math.min(i + batchSize, molecules.length),
        total: molecules.length,
        validCount: results.filter((r) => r.isValid).length,
      });
    }

    // Yield to event loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return results;
}

export function validateSmilesList(smilesList: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const smiles of smilesList) {
    if (isValidSmiles(smiles)) {
      valid.push(smiles);
    } else {
      invalid.push(smiles);
    }
  }

  return { valid, invalid };
}

export function getFingerprintMatrix(molecules: ProcessedMolecule[]): number[][] {
  return molecules.filter((m) => m.isValid).map((m) => m.fingerprint);
}

export function precomputeSVGs(
  molecules: ProcessedMolecule[],
  onProgress?: (current: number, total: number) => void
): ProcessedMolecule[] {
  console.log('precomputeSVGs: starting for', molecules.length, 'molecules');

  const result = molecules.map((mol, i) => {
    if (onProgress && i % 10 === 0) {
      onProgress(i, molecules.length);
    }

    if (!mol.isValid) return mol;

    const svg = getMoleculeSVG(mol.smiles);
    if (i === 0) {
      console.log('First molecule SVG result:', mol.smiles, svg ? 'OK' : 'NULL');
    }
    return { ...mol, svg: svg ?? undefined };
  });

  const withSvg = result.filter(m => m.svg).length;
  console.log('precomputeSVGs: generated', withSvg, 'SVGs');

  return result;
}
