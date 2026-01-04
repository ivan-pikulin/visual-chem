import { useState } from 'react';
import { useAppStore, DATASET_COLORS } from '../store/useAppStore';
import { FileUpload } from './FileUpload';
import { ColumnManager } from './ColumnManager';

interface DataViewProps {
  onGoToPlot?: () => void;
}

export function DataView({ onGoToPlot }: DataViewProps) {
  const {
    datasets,
    setActiveDataset,
    removeDataset,
    clearAllDatasets,
    setDatasetColor,
  } = useAppStore();

  const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
  const [showAddDataset, setShowAddDataset] = useState(false);

  const editingDataset = datasets.find(d => d.id === editingDatasetId);

  // Calculate summary stats
  const totalMolecules = datasets.reduce((sum, d) => sum + d.molecules.length, 0);
  const totalValid = datasets.reduce(
    (sum, d) => sum + d.molecules.filter((m) => m.isValid).length,
    0
  );

  if (datasets.length === 0 && !showAddDataset) {
    return (
      <div className="data-view">
        <div className="data-view-empty">
          <FileUpload />
        </div>
      </div>
    );
  }

  return (
    <div className="data-view">
      <div className="data-view-content">
        {/* Datasets Section */}
        <section className="data-section">
          <div className="data-section-header">
            <h3>Your Datasets</h3>
            {datasets.length > 0 && (
              <button onClick={clearAllDatasets} className="clear-all-btn">
                Clear All
              </button>
            )}
          </div>

          <div className="data-cards-grid">
            {datasets.map((d, index) => {
              const validCount = d.molecules.filter((m) => m.isValid).length;
              const color = d.color || DATASET_COLORS[index % DATASET_COLORS.length];
              const isEditing = editingDatasetId === d.id;

              return (
                <div
                  key={d.id}
                  className={`data-card ${isEditing ? 'editing' : ''}`}
                  style={{ '--dataset-color': color } as React.CSSProperties}
                >
                  <div className="data-card-header">
                    <span
                      className="data-card-color"
                      style={{ backgroundColor: color }}
                    />
                    <span className="data-card-name" title={d.name}>
                      {d.name}
                    </span>
                    <button
                      className="data-card-btn"
                      onClick={() => removeDataset(d.id)}
                      title="Remove dataset"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="data-card-stats">
                    <span className="data-card-count">{validCount}</span>
                    <span className="data-card-label">molecules</span>
                    {d.totalRows && d.totalRows > d.molecules.length && (
                      <span className="data-card-total">
                        of {d.totalRows}
                      </span>
                    )}
                  </div>

                  <div className="data-card-actions">
                    <button
                      className={`data-card-edit-btn ${isEditing ? 'active' : ''}`}
                      onClick={() => {
                        setActiveDataset(d.id);
                        setEditingDatasetId(isEditing ? null : d.id);
                      }}
                    >
                      {isEditing ? 'Close' : 'Edit'}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add Dataset Card */}
            <div
              className="data-card data-card-add"
              onClick={() => setShowAddDataset(true)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Add Dataset</span>
            </div>
          </div>
        </section>

        {/* Add Dataset Overlay */}
        {showAddDataset && (
          <section className="data-section">
            <div className="data-section-header">
              <h3>Add New Dataset</h3>
              <button
                onClick={() => setShowAddDataset(false)}
                className="close-section-btn"
              >
                Cancel
              </button>
            </div>
            <div className="add-dataset-area">
              <FileUpload
                addToExisting
                onComplete={() => setShowAddDataset(false)}
              />
            </div>
          </section>
        )}

        {/* Edit Dataset Section */}
        {editingDataset && !showAddDataset && (
          <section className="data-section data-section-editor">
            <div className="data-section-header">
              <h3>
                <span
                  className="editor-color-dot"
                  style={{ backgroundColor: editingDataset.color }}
                />
                Editing: {editingDataset.name}
              </h3>
              <button
                onClick={() => setEditingDatasetId(null)}
                className="close-section-btn"
              >
                Close
              </button>
            </div>

            {/* Column Mapping */}
            <div className="editor-subsection">
              <h4>Column Mapping</h4>
              <ColumnManager />
            </div>

            {/* Dataset Color */}
            <div className="editor-subsection">
              <h4>Dataset Color</h4>
              <div className="color-picker-row">
                {DATASET_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`color-picker-btn ${editingDataset.color === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setDatasetColor(editingDataset.id, color)}
                  />
                ))}
              </div>
            </div>

            {/* Dataset Info */}
            <div className="editor-subsection">
              <h4>Info</h4>
              <div className="editor-info-grid">
                <div className="editor-info-item">
                  <span className="editor-info-label">Total rows</span>
                  <span className="editor-info-value">
                    {editingDataset.totalRows || editingDataset.molecules.length}
                  </span>
                </div>
                <div className="editor-info-item">
                  <span className="editor-info-label">Processed</span>
                  <span className="editor-info-value">
                    {editingDataset.molecules.length}
                  </span>
                </div>
                <div className="editor-info-item">
                  <span className="editor-info-label">Valid</span>
                  <span className="editor-info-value success">
                    {editingDataset.molecules.filter(m => m.isValid).length}
                  </span>
                </div>
                <div className="editor-info-item">
                  <span className="editor-info-label">Columns</span>
                  <span className="editor-info-value">
                    {editingDataset.csvHeaders?.length || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="editor-subsection editor-danger">
              <button
                className="delete-dataset-btn"
                onClick={() => {
                  removeDataset(editingDataset.id);
                  setEditingDatasetId(null);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete Dataset
              </button>
            </div>
          </section>
        )}

        {/* Summary Section */}
        {datasets.length > 0 && !showAddDataset && !editingDatasetId && (
          <section className="data-section">
            <div className="data-section-header">
              <h3>Summary</h3>
            </div>
            <div className="summary-stats">
              <div className="summary-stat">
                <span className="summary-stat-value">{datasets.length}</span>
                <span className="summary-stat-label">Datasets</span>
              </div>
              <div className="summary-stat">
                <span className="summary-stat-value">{totalMolecules}</span>
                <span className="summary-stat-label">Total Molecules</span>
              </div>
              <div className="summary-stat">
                <span className="summary-stat-value success">{totalValid}</span>
                <span className="summary-stat-label">Valid</span>
              </div>
              {totalMolecules - totalValid > 0 && (
                <div className="summary-stat">
                  <span className="summary-stat-value error">{totalMolecules - totalValid}</span>
                  <span className="summary-stat-label">Invalid</span>
                </div>
              )}
            </div>

            {/* Go to Plot button */}
            {datasets.length > 0 && onGoToPlot && (
              <button className="go-to-plot-btn" onClick={onGoToPlot}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="7.5" cy="7.5" r="2" />
                  <circle cx="16.5" cy="16.5" r="2" />
                  <circle cx="18" cy="6" r="1.5" />
                  <circle cx="6" cy="18" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                </svg>
                Go to Plot
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
