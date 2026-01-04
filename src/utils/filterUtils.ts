import type {
  ProcessedMolecule,
  ColumnFilter,
  NumericFilter,
  TextFilter,
  CategoryFilter,
} from '../types';

/**
 * Apply a single numeric filter to a value
 */
function applyNumericFilter(value: unknown, filter: NumericFilter): boolean {
  const numValue = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(numValue)) return false;

  switch (filter.operator) {
    case 'between':
      if (filter.min !== undefined && filter.max !== undefined) {
        return numValue >= filter.min && numValue <= filter.max;
      }
      return true;
    case 'gt':
      return filter.value !== undefined && numValue > filter.value;
    case 'gte':
      return filter.value !== undefined && numValue >= filter.value;
    case 'lt':
      return filter.value !== undefined && numValue < filter.value;
    case 'lte':
      return filter.value !== undefined && numValue <= filter.value;
    case 'eq':
      return filter.value !== undefined && numValue === filter.value;
    case 'neq':
      return filter.value !== undefined && numValue !== filter.value;
    default:
      return true;
  }
}

/**
 * Apply a single text filter to a value
 */
function applyTextFilter(value: unknown, filter: TextFilter): boolean {
  const strValue = String(value ?? '');
  const filterValue = filter.caseSensitive ? filter.value : filter.value.toLowerCase();
  const compareValue = filter.caseSensitive ? strValue : strValue.toLowerCase();

  switch (filter.operator) {
    case 'contains':
      return compareValue.includes(filterValue);
    case 'equals':
      return compareValue === filterValue;
    case 'startsWith':
      return compareValue.startsWith(filterValue);
    case 'endsWith':
      return compareValue.endsWith(filterValue);
    case 'regex':
      try {
        const flags = filter.caseSensitive ? '' : 'i';
        const regex = new RegExp(filter.value, flags);
        return regex.test(strValue);
      } catch {
        return false;
      }
    default:
      return true;
  }
}

/**
 * Apply a single category filter to a value
 */
function applyCategoryFilter(value: unknown, filter: CategoryFilter): boolean {
  const strValue = String(value ?? '');
  const isSelected = filter.selectedValues.includes(strValue);
  return filter.excludeMode ? !isSelected : isSelected;
}

/**
 * Apply a single filter to a molecule
 */
function applyFilter(molecule: ProcessedMolecule, filter: ColumnFilter): boolean {
  const value = molecule.originalRow?.[filter.column];

  switch (filter.type) {
    case 'numeric':
      return applyNumericFilter(value, filter);
    case 'text':
      return applyTextFilter(value, filter);
    case 'category':
      return applyCategoryFilter(value, filter);
    default:
      return true;
  }
}

/**
 * Apply all filters to a list of molecules
 * Filters are combined with AND logic
 */
export function applyFilters(
  molecules: ProcessedMolecule[],
  filters: ColumnFilter[]
): ProcessedMolecule[] {
  if (!filters || filters.length === 0) {
    return molecules;
  }

  return molecules.filter(molecule =>
    filters.every(filter => applyFilter(molecule, filter))
  );
}

/**
 * Get a human-readable description of a filter
 */
export function getFilterDescription(filter: ColumnFilter): string {
  switch (filter.type) {
    case 'numeric': {
      const col = filter.column;
      switch (filter.operator) {
        case 'between':
          return `${col}: ${filter.min} — ${filter.max}`;
        case 'gt':
          return `${col} > ${filter.value}`;
        case 'gte':
          return `${col} >= ${filter.value}`;
        case 'lt':
          return `${col} < ${filter.value}`;
        case 'lte':
          return `${col} <= ${filter.value}`;
        case 'eq':
          return `${col} = ${filter.value}`;
        case 'neq':
          return `${col} != ${filter.value}`;
        default:
          return col;
      }
    }
    case 'text': {
      const col = filter.column;
      const val = filter.value.length > 20 ? filter.value.slice(0, 20) + '...' : filter.value;
      switch (filter.operator) {
        case 'contains':
          return `${col} ~ "${val}"`;
        case 'equals':
          return `${col} = "${val}"`;
        case 'startsWith':
          return `${col} ^= "${val}"`;
        case 'endsWith':
          return `${col} $= "${val}"`;
        case 'regex':
          return `${col} ~= /${val}/`;
        default:
          return col;
      }
    }
    case 'category': {
      const count = filter.selectedValues.length;
      if (count === 0) return `${filter.column}: (none)`;
      if (count === 1) return `${filter.column}: ${filter.selectedValues[0]}`;
      if (count <= 3) return `${filter.column}: ${filter.selectedValues.join(', ')}`;
      return `${filter.column}: ${count} selected`;
    }
    default:
      return 'Unknown filter';
  }
}

/**
 * Count molecules that pass filters
 */
export function countFilteredMolecules(
  molecules: ProcessedMolecule[],
  filters: ColumnFilter[]
): { filtered: number; total: number } {
  const total = molecules.length;
  const filtered = applyFilters(molecules, filters).length;
  return { filtered, total };
}
