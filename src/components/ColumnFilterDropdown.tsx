import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type {
  ColumnInfo,
  ColumnFilter,
  NumericFilter,
  TextFilter,
  CategoryFilter,
  NumericOperator,
  TextOperator,
  ProcessedMolecule,
} from '../types';

const CATEGORY_THRESHOLD = 15; // Max unique values to show as category filter

interface ColumnFilterDropdownProps {
  column: string;
  columnInfo: ColumnInfo;
  molecules: ProcessedMolecule[];
  currentFilter?: ColumnFilter;
  onApply: (filter: ColumnFilter | null) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

// Determine filter type from column info and data
function determineFilterType(
  columnInfo: ColumnInfo,
  molecules: ProcessedMolecule[]
): 'numeric' | 'text' | 'category' {
  if (columnInfo.type === 'number') {
    return 'numeric';
  }

  // Check if categorical (limited unique values)
  const uniqueValues = new Set<string>();
  for (const mol of molecules) {
    const val = mol.originalRow?.[columnInfo.name];
    if (val !== undefined && val !== null && val !== '') {
      uniqueValues.add(String(val));
      if (uniqueValues.size > CATEGORY_THRESHOLD) break;
    }
  }

  if (uniqueValues.size <= CATEGORY_THRESHOLD && uniqueValues.size > 0) {
    return 'category';
  }

  return 'text';
}

// Get unique values with counts for category filter
function getCategoryValues(
  columnName: string,
  molecules: ProcessedMolecule[]
): { value: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const mol of molecules) {
    const val = mol.originalRow?.[columnName];
    if (val !== undefined && val !== null) {
      const strVal = String(val);
      counts.set(strVal, (counts.get(strVal) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

// Get min/max for numeric column
function getNumericRange(
  columnName: string,
  molecules: ProcessedMolecule[]
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;

  for (const mol of molecules) {
    const val = mol.originalRow?.[columnName];
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    if (!isNaN(num)) {
      min = Math.min(min, num);
      max = Math.max(max, num);
    }
  }

  return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 100 : max };
}

// ============================================================
// NUMERIC FILTER PANEL
// ============================================================

interface NumericFilterPanelProps {
  column: string;
  molecules: ProcessedMolecule[];
  currentFilter?: NumericFilter;
  onApply: (filter: NumericFilter | null) => void;
}

function NumericFilterPanel({
  column,
  molecules,
  currentFilter,
  onApply,
}: NumericFilterPanelProps) {
  const range = useMemo(() => getNumericRange(column, molecules), [column, molecules]);

  const [operator, setOperator] = useState<NumericOperator>(
    currentFilter?.operator || 'between'
  );
  const [value, setValue] = useState<string>(
    currentFilter?.value?.toString() || ''
  );
  const [minVal, setMinVal] = useState<string>(
    currentFilter?.min?.toString() || range.min.toString()
  );
  const [maxVal, setMaxVal] = useState<string>(
    currentFilter?.max?.toString() || range.max.toString()
  );

  const handleApply = () => {
    if (operator === 'between') {
      const min = parseFloat(minVal);
      const max = parseFloat(maxVal);
      if (isNaN(min) || isNaN(max)) return;
      onApply({ type: 'numeric', column, operator, min, max });
    } else {
      const val = parseFloat(value);
      if (isNaN(val)) return;
      onApply({ type: 'numeric', column, operator, value: val });
    }
  };

  const handleClear = () => {
    onApply(null);
  };

  const handleQuickFilter = (type: 'top10' | 'bottom10') => {
    const sorted = molecules
      .map(m => {
        const v = m.originalRow?.[column];
        return typeof v === 'number' ? v : parseFloat(String(v));
      })
      .filter(v => !isNaN(v))
      .sort((a, b) => a - b);

    if (sorted.length === 0) return;

    const threshold = Math.ceil(sorted.length * 0.1);
    if (type === 'top10') {
      const cutoff = sorted[sorted.length - threshold];
      onApply({ type: 'numeric', column, operator: 'gte', value: cutoff });
    } else {
      const cutoff = sorted[threshold - 1];
      onApply({ type: 'numeric', column, operator: 'lte', value: cutoff });
    }
  };

  return (
    <div className="filter-panel filter-panel-numeric">
      <div className="filter-header">
        <span className="filter-title">{column}</span>
        <span className="filter-type-badge">Numeric</span>
      </div>

      <div className="filter-operators">
        {[
          { op: 'between', label: 'Between' },
          { op: 'gt', label: '>' },
          { op: 'gte', label: '>=' },
          { op: 'lt', label: '<' },
          { op: 'lte', label: '<=' },
          { op: 'eq', label: '=' },
          { op: 'neq', label: '!=' },
        ].map(({ op, label }) => (
          <button
            key={op}
            className={`filter-op-btn ${operator === op ? 'active' : ''}`}
            onClick={() => setOperator(op as NumericOperator)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="filter-inputs">
        {operator === 'between' ? (
          <div className="filter-range">
            <input
              type="number"
              className="filter-input"
              value={minVal}
              onChange={(e) => setMinVal(e.target.value)}
              placeholder="Min"
            />
            <span className="filter-range-sep">—</span>
            <input
              type="number"
              className="filter-input"
              value={maxVal}
              onChange={(e) => setMaxVal(e.target.value)}
              placeholder="Max"
            />
          </div>
        ) : (
          <input
            type="number"
            className="filter-input filter-input-full"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Value"
          />
        )}
      </div>

      <div className="filter-quick">
        <span className="filter-quick-label">Quick:</span>
        <button className="filter-quick-btn" onClick={() => handleQuickFilter('top10')}>
          Top 10%
        </button>
        <button className="filter-quick-btn" onClick={() => handleQuickFilter('bottom10')}>
          Bottom 10%
        </button>
      </div>

      <div className="filter-actions">
        <button className="filter-btn filter-btn-clear" onClick={handleClear}>
          Clear
        </button>
        <button className="filter-btn filter-btn-apply" onClick={handleApply}>
          Apply
        </button>
      </div>
    </div>
  );
}

// ============================================================
// TEXT FILTER PANEL
// ============================================================

interface TextFilterPanelProps {
  column: string;
  currentFilter?: TextFilter;
  onApply: (filter: TextFilter | null) => void;
}

function TextFilterPanel({
  column,
  currentFilter,
  onApply,
}: TextFilterPanelProps) {
  const [operator, setOperator] = useState<TextOperator>(
    currentFilter?.operator || 'contains'
  );
  const [value, setValue] = useState(currentFilter?.value || '');
  const [caseSensitive, setCaseSensitive] = useState(
    currentFilter?.caseSensitive || false
  );

  const handleApply = () => {
    if (!value.trim()) {
      onApply(null);
      return;
    }
    onApply({ type: 'text', column, operator, value, caseSensitive });
  };

  const handleClear = () => {
    onApply(null);
  };

  return (
    <div className="filter-panel filter-panel-text">
      <div className="filter-header">
        <span className="filter-title">{column}</span>
        <span className="filter-type-badge">Text</span>
      </div>

      <div className="filter-search">
        <input
          type="text"
          className="filter-input filter-input-full"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search..."
          autoFocus
        />
      </div>

      <div className="filter-operators filter-operators-text">
        {[
          { op: 'contains', label: 'Contains' },
          { op: 'equals', label: 'Equals' },
          { op: 'startsWith', label: 'Starts with' },
          { op: 'endsWith', label: 'Ends with' },
          { op: 'regex', label: 'Regex' },
        ].map(({ op, label }) => (
          <label key={op} className="filter-radio">
            <input
              type="radio"
              name="textOp"
              checked={operator === op}
              onChange={() => setOperator(op as TextOperator)}
            />
            <span className="filter-radio-label">{label}</span>
          </label>
        ))}
      </div>

      <label className="filter-checkbox">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
        />
        <span className="filter-checkbox-label">Case sensitive</span>
      </label>

      <div className="filter-actions">
        <button className="filter-btn filter-btn-clear" onClick={handleClear}>
          Clear
        </button>
        <button className="filter-btn filter-btn-apply" onClick={handleApply}>
          Apply
        </button>
      </div>
    </div>
  );
}

// ============================================================
// CATEGORY FILTER PANEL
// ============================================================

interface CategoryFilterPanelProps {
  column: string;
  molecules: ProcessedMolecule[];
  currentFilter?: CategoryFilter;
  onApply: (filter: CategoryFilter | null) => void;
}

function CategoryFilterPanel({
  column,
  molecules,
  currentFilter,
  onApply,
}: CategoryFilterPanelProps) {
  const categoryValues = useMemo(
    () => getCategoryValues(column, molecules),
    [column, molecules]
  );

  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => {
    if (currentFilter?.selectedValues) {
      return new Set(currentFilter.selectedValues);
    }
    // By default, all are selected
    return new Set(categoryValues.map((v) => v.value));
  });

  const [search, setSearch] = useState('');

  const filteredValues = useMemo(() => {
    if (!search.trim()) return categoryValues;
    const s = search.toLowerCase();
    return categoryValues.filter((v) => v.value.toLowerCase().includes(s));
  }, [categoryValues, search]);

  const allSelected = selectedValues.size === categoryValues.length;
  const noneSelected = selectedValues.size === 0;

  const toggleValue = (value: string) => {
    const next = new Set(selectedValues);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    setSelectedValues(next);
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedValues(new Set());
    } else {
      setSelectedValues(new Set(categoryValues.map((v) => v.value)));
    }
  };

  const handleApply = () => {
    if (allSelected || noneSelected) {
      // All or none selected = no filter
      onApply(null);
      return;
    }
    onApply({
      type: 'category',
      column,
      selectedValues: Array.from(selectedValues),
    });
  };

  const handleClear = () => {
    onApply(null);
  };

  return (
    <div className="filter-panel filter-panel-category">
      <div className="filter-header">
        <span className="filter-title">{column}</span>
        <span className="filter-type-badge">Category</span>
      </div>

      <div className="filter-search">
        <input
          type="text"
          className="filter-input filter-input-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search values..."
        />
      </div>

      <div className="filter-category-header">
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
          />
          <span className="filter-checkbox-label">
            Select all ({categoryValues.length})
          </span>
        </label>
      </div>

      <div className="filter-category-list">
        {filteredValues.map(({ value, count }) => (
          <label key={value} className="filter-category-item">
            <input
              type="checkbox"
              checked={selectedValues.has(value)}
              onChange={() => toggleValue(value)}
            />
            <span className="filter-category-value">{value || '(empty)'}</span>
            <span className="filter-category-count">{count}</span>
          </label>
        ))}
      </div>

      <div className="filter-actions">
        <button className="filter-btn filter-btn-clear" onClick={handleClear}>
          Clear
        </button>
        <button className="filter-btn filter-btn-apply" onClick={handleApply}>
          Apply
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN DROPDOWN COMPONENT
// ============================================================

export function ColumnFilterDropdown({
  column,
  columnInfo,
  molecules,
  currentFilter,
  onApply,
  onClose,
  anchorRect,
}: ColumnFilterDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filterType = useMemo(
    () => determineFilterType(columnInfo, molecules),
    [columnInfo, molecules]
  );

  // Position the dropdown
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = anchorRect.bottom + 4;
    let left = anchorRect.left;

    // Adjust if overflowing right
    if (left + rect.width > viewportWidth - 16) {
      left = viewportWidth - rect.width - 16;
    }

    // Adjust if overflowing bottom
    if (top + rect.height > viewportHeight - 16) {
      top = anchorRect.top - rect.height - 4;
    }

    setPosition({ top, left: Math.max(16, left) });
  }, [anchorRect]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleApply = useCallback(
    (filter: ColumnFilter | null) => {
      onApply(filter);
      onClose();
    },
    [onApply, onClose]
  );

  return (
    <div
      ref={dropdownRef}
      className="filter-dropdown"
      style={{ top: position.top, left: position.left }}
    >
      {filterType === 'numeric' && (
        <NumericFilterPanel
          column={column}
          molecules={molecules}
          currentFilter={currentFilter as NumericFilter | undefined}
          onApply={handleApply}
        />
      )}
      {filterType === 'text' && (
        <TextFilterPanel
          column={column}
          currentFilter={currentFilter as TextFilter | undefined}
          onApply={handleApply}
        />
      )}
      {filterType === 'category' && (
        <CategoryFilterPanel
          column={column}
          molecules={molecules}
          currentFilter={currentFilter as CategoryFilter | undefined}
          onApply={handleApply}
        />
      )}
    </div>
  );
}
