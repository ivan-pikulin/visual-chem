// RDKit.js module types
interface JSMol {
  delete(): void;
  is_valid(): boolean;
  get_smiles(): string;
  get_svg(width?: number, height?: number): string;
  get_morgan_fp(options?: string): string;
}

interface RDKitModuleType {
  get_mol(input: string, details_json?: string): JSMol | null;
  version(): string;
}

declare global {
  interface Window {
    initRDKitModule: (options?: { locateFile?: () => string }) => Promise<RDKitModuleType>;
  }
}

let RDKitModule: RDKitModuleType | null = null;
let initPromise: Promise<RDKitModuleType> | null = null;

export async function initRDKit(): Promise<RDKitModuleType> {
  if (RDKitModule) return RDKitModule;

  if (!initPromise) {
    initPromise = (async () => {
      // Load RDKit script if not loaded
      if (!window.initRDKitModule) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/RDKit_minimal.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load RDKit.js'));
          document.head.appendChild(script);
        });
      }

      // Initialize RDKit module
      const module = await window.initRDKitModule();
      RDKitModule = module;
      console.log('RDKit.js initialized successfully, version:', module.version());
      return module;
    })();
  }

  return initPromise;
}

export function getRDKit(): RDKitModuleType {
  if (!RDKitModule) {
    throw new Error('RDKit not initialized. Call initRDKit() first.');
  }
  return RDKitModule;
}

export function isValidSmiles(smiles: string): boolean {
  const rdkit = getRDKit();
  if (!rdkit) return false;

  const mol = rdkit.get_mol(smiles);
  if (!mol) return false;

  const isValid = mol.is_valid();
  mol.delete();
  return isValid;
}

export function getMoleculeFromSmiles(smiles: string): JSMol | null {
  const rdkit = getRDKit();
  if (!rdkit) return null;

  const mol = rdkit.get_mol(smiles);
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return null;
  }

  return mol;
}

export function getMorganFingerprint(smiles: string, radius: number = 2, nBits: number = 2048): number[] | null {
  const rdkit = getRDKit();
  if (!rdkit) return null;

  const mol = rdkit.get_mol(smiles);
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return null;
  }

  try {
    const fp = mol.get_morgan_fp(JSON.stringify({ radius, nBits }));
    mol.delete();

    // Convert bit string to array of 0s and 1s
    const bits: number[] = [];
    for (let i = 0; i < fp.length; i++) {
      bits.push(fp[i] === '1' ? 1 : 0);
    }
    return bits;
  } catch (e) {
    mol.delete();
    console.error('Error computing fingerprint:', e);
    return null;
  }
}

export function getMoleculeSVG(smiles: string, width: number = 200, height: number = 150): string | null {
  const rdkit = getRDKit();
  if (!rdkit) return null;

  const mol = rdkit.get_mol(smiles);
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return null;
  }

  try {
    const svg = mol.get_svg(width, height);
    mol.delete();
    return svg;
  } catch (e) {
    mol.delete();
    console.error('Error generating SVG:', e);
    return null;
  }
}

export function canonicalizeSmiles(smiles: string): string | null {
  const rdkit = getRDKit();
  if (!rdkit) return null;

  const mol = rdkit.get_mol(smiles);
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return null;
  }

  try {
    const canonical = mol.get_smiles();
    mol.delete();
    return canonical;
  } catch (e) {
    mol.delete();
    return null;
  }
}
