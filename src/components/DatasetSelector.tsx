import { useCallback, useRef } from 'react';
import { useAppStore, DATASET_COLORS } from '../store/useAppStore';

export function DatasetSelector() {
  const {
    datasets,
    setDatasetVisible,
    setAllDatasetsVisible,
  } = useAppStore();

  // Track last clicked index for shift+click range selection
  const lastClickedRef = useRef<number | null>(null);

  // Get currently visible dataset IDs
  const visibleIds = new Set(
    datasets.filter(d => d.visible !== false).map(d => d.id)
  );

  const handleItemClick = useCallback((index: number, e: React.MouseEvent) => {
    const clickedDataset = datasets[index];
    if (!clickedDataset) return;

    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+Click: Toggle individual item
      setDatasetVisible(clickedDataset.id, !visibleIds.has(clickedDataset.id));
      lastClickedRef.current = index;
    } else if (e.shiftKey && lastClickedRef.current !== null) {
      // Shift+Click: Select range
      const start = Math.min(lastClickedRef.current, index);
      const end = Math.max(lastClickedRef.current, index);

      // First hide all, then show range
      setAllDatasetsVisible(false);
      for (let i = start; i <= end; i++) {
        setDatasetVisible(datasets[i].id, true);
      }
    } else {
      // Normal click: Select only this one
      setAllDatasetsVisible(false);
      setDatasetVisible(clickedDataset.id, true);
      lastClickedRef.current = index;
    }
  }, [datasets, visibleIds, setDatasetVisible, setAllDatasetsVisible]);

  if (datasets.length === 0) {
    return (
      <div className="dataset-selector-empty">
        <p>No datasets loaded</p>
      </div>
    );
  }

  const visibleCount = visibleIds.size;

  return (
    <div className="dataset-selector">
      {/* Simple list */}
      <div className="dataset-list">
        {datasets.map((dataset, index) => {
          const color = dataset.color || DATASET_COLORS[index % DATASET_COLORS.length];
          const isSelected = visibleIds.has(dataset.id);
          const validCount = dataset.molecules.filter(m => m.isValid).length;

          return (
            <div
              key={dataset.id}
              className={`dataset-list-item ${isSelected ? 'selected' : ''}`}
              onClick={(e) => handleItemClick(index, e)}
              style={{ '--dataset-color': color } as React.CSSProperties}
            >
              <span className="dataset-list-color" style={{ backgroundColor: color }} />
              <span className="dataset-list-name" title={dataset.name}>
                {dataset.name}
              </span>
              <span className="dataset-list-count">{validCount}</span>
            </div>
          );
        })}
      </div>

      {/* Footer with count and shortcuts hint */}
      <div className="dataset-selector-footer">
        <span className="dataset-selector-count">
          {visibleCount} of {datasets.length} selected
        </span>
        {datasets.length > 1 && (
          <span className="dataset-selector-hint">
            ⌘+click to add, ⇧+click for range
          </span>
        )}
      </div>
    </div>
  );
}
