import type { ColumnFilter } from '../types';
import { getFilterDescription } from '../utils/filterUtils';

interface ActiveFiltersBarProps {
  filters: ColumnFilter[];
  onRemove: (columnName: string) => void;
  onClearAll: () => void;
  filteredCount: number;
  totalCount: number;
}

export function ActiveFiltersBar({
  filters,
  onRemove,
  onClearAll,
  filteredCount,
  totalCount,
}: ActiveFiltersBarProps) {
  if (!filters || filters.length === 0) {
    return null;
  }

  return (
    <div className="active-filters-bar">
      <div className="active-filters-chips">
        {filters.map((filter) => (
          <div key={filter.column} className="active-filter-chip">
            <span className="active-filter-text">
              {getFilterDescription(filter)}
            </span>
            <button
              className="active-filter-remove"
              onClick={() => onRemove(filter.column)}
              title="Remove filter"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="active-filters-actions">
        <span className="active-filters-count">
          {filteredCount} of {totalCount}
        </span>
        <button className="active-filters-clear" onClick={onClearAll}>
          Clear all
        </button>
      </div>
    </div>
  );
}
