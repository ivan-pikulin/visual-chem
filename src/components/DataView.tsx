import { useState, useMemo, useCallback, useRef } from 'react';
import { useAppStore, DATASET_COLORS } from '../store/useAppStore';
import { FileUpload } from './FileUpload';
import type { ColumnInfo } from '../types';

// Column role definitions
const COLUMN_ROLES = [
  { id: 'smiles' as const, label: 'SMILES', color: '#3b82f6', icon: '⬡', multiple: false },
  { id: 'value' as const, label: 'Value', color: '#10b981', icon: '#', multiple: true },
  { id: 'label' as const, label: 'Label', color: '#f59e0b', icon: 'A', multiple: true },
  { id: 'group' as const, label: 'Group', color: '#8b5cf6', icon: '◉', multiple: false },
] as const;

type RoleId = (typeof COLUMN_ROLES)[number]['id'];

const ROWS_PER_PAGE = 5;

interface DataViewProps {
  onGoToAnalysis?: () => void;
}

export function DataView({ onGoToAnalysis }: DataViewProps) {
  const {
    datasets,
    activeDatasetId,
    setActiveDataset,
    removeDataset,
    clearAllDatasets,
    setDatasetColor,
    addValueColumn,
    removeValueColumn,
    addLabelColumn,
    removeLabelColumn,
    setGroupColumn,
    setSmilesColumn,
    setDatasetDisplaySettings,
  } = useAppStore();

  const [currentPage, setCurrentPage] = useState(0);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // Handler for "Add" button - directly opens file picker
  const handleAddDatasetClick = useCallback(() => {
    addFileInputRef.current?.click();
  }, []);

  // Get active dataset
  const activeDataset = useMemo(() => {
    if (activeDatasetId) {
      return datasets.find(d => d.id === activeDatasetId) || datasets[0];
    }
    return datasets[0];
  }, [datasets, activeDatasetId]);

  // Build column to roles mapping
  const columnToRoles = useMemo(() => {
    if (!activeDataset?.columnMapping) return {};

    const result: Record<string, RoleId[]> = {};
    const mapping = activeDataset.columnMapping;

    if (mapping.smiles) {
      result[mapping.smiles] = ['smiles'];
    }
    for (const col of mapping.values) {
      result[col] = [...(result[col] || []), 'value'];
    }
    for (const col of mapping.labels) {
      result[col] = [...(result[col] || []), 'label'];
    }
    if (mapping.group) {
      result[mapping.group] = [...(result[mapping.group] || []), 'group'];
    }

    return result;
  }, [activeDataset?.columnMapping]);

  const hasRole = (columnName: string, roleId: RoleId): boolean => {
    return columnToRoles[columnName]?.includes(roleId) || false;
  };

  const handleRoleToggle = useCallback((columnName: string, roleId: RoleId) => {
    if (!activeDataset) return;

    const currentlyHasRole = hasRole(columnName, roleId);

    if (roleId === 'smiles') {
      // SMILES is exclusive - clicking sets this column as SMILES
      if (!currentlyHasRole) {
        setSmilesColumn(columnName);
      }
      // Can't unset SMILES by clicking again (must select another column)
    } else if (roleId === 'value') {
      if (currentlyHasRole) {
        removeValueColumn(columnName);
      } else {
        addValueColumn(columnName);
      }
    } else if (roleId === 'label') {
      if (currentlyHasRole) {
        removeLabelColumn(columnName);
      } else {
        addLabelColumn(columnName);
      }
    } else if (roleId === 'group') {
      if (currentlyHasRole) {
        setGroupColumn(undefined);
      } else {
        setGroupColumn(columnName);
      }
    }
  }, [activeDataset, hasRole, setSmilesColumn, addValueColumn, removeValueColumn, addLabelColumn, removeLabelColumn, setGroupColumn]);

  // Get column info helper
  const getColumnInfo = useCallback((columnName: string): ColumnInfo | undefined => {
    return activeDataset?.columnInfo?.find(c => c.name === columnName);
  }, [activeDataset?.columnInfo]);

  // Pagination
  const paginatedRows = useMemo(() => {
    if (!activeDataset?.molecules) return [];
    const start = currentPage * ROWS_PER_PAGE;
    return activeDataset.molecules.slice(start, start + ROWS_PER_PAGE);
  }, [activeDataset?.molecules, currentPage]);

  const totalPages = useMemo(() => {
    if (!activeDataset?.molecules) return 0;
    return Math.ceil(activeDataset.molecules.length / ROWS_PER_PAGE);
  }, [activeDataset?.molecules]);

  // Reset page when dataset changes
  const handleDatasetClick = useCallback((id: string) => {
    setActiveDataset(id);
    setCurrentPage(0);
  }, [setActiveDataset]);

  // Calculate summary stats
  const summary = useMemo(() => {
    let total = 0;
    let ready = 0;
    let needsConfig = 0;
    let loading = 0;

    for (const d of datasets) {
      if (d.loadingState?.isLoading) {
        loading++;
        continue;
      }
      total += d.molecules.filter(m => m.isValid).length;
      if (d.columnMapping?.smiles) {
        ready++;
      } else {
        needsConfig++;
      }
    }

    return { total, ready, needsConfig, loading, datasetsCount: datasets.length };
  }, [datasets]);

  // Check if dataset needs configuration
  const datasetNeedsConfig = useCallback((d: typeof datasets[0]) => {
    return !d.columnMapping?.smiles;
  }, []);

  // Handle display settings change
  const handleLabelTemplateChange = useCallback((value: string) => {
    if (activeDataset) {
      setDatasetDisplaySettings(activeDataset.id, { labelTemplate: value });
    }
  }, [activeDataset, setDatasetDisplaySettings]);

  const handleValueExpressionChange = useCallback((value: string) => {
    if (activeDataset) {
      setDatasetDisplaySettings(activeDataset.id, { valueExpression: value });
    }
  }, [activeDataset, setDatasetDisplaySettings]);

  // Empty state
  if (datasets.length === 0) {
    return (
      <div className="data-view">
        <div className="data-view-empty">
          <FileUpload />
        </div>
      </div>
    );
  }

  const columns = activeDataset?.csvHeaders || [];

  return (
    <div className="data-view">
      <div className="data-view-content">
        {/* Datasets Section */}
        <section className="dv-datasets-section">
          <div className="dv-section-header">
            <span className="dv-section-title">DATASETS</span>
            {datasets.length > 0 && (
              <button onClick={clearAllDatasets} className="dv-clear-btn">
                Clear All
              </button>
            )}
          </div>

          <div className="dv-datasets-row">
            {datasets.map((d, index) => {
              const color = d.color || DATASET_COLORS[index % DATASET_COLORS.length];
              const isActive = d.id === (activeDatasetId || datasets[0]?.id);
              const validCount = d.molecules.filter(m => m.isValid).length;
              const needsConfig = datasetNeedsConfig(d);
              const isLoading = d.loadingState?.isLoading;
              const hasError = d.loadingState?.error;

              return (
                <div
                  key={d.id}
                  className={`dv-dataset-card ${isActive ? 'active' : ''} ${needsConfig && !isLoading ? 'needs-config' : ''} ${isLoading ? 'loading' : ''} ${hasError ? 'has-error' : ''}`}
                  onClick={() => !isLoading && handleDatasetClick(d.id)}
                  style={{ '--dataset-color': color, '--loading-progress': `${d.loadingState?.progress || 0}%` } as React.CSSProperties}
                >
                  <div className="dv-dataset-indicator" />
                  {isLoading ? (
                    <div className="dv-dataset-loading">
                      <span className="dv-dataset-name" title={d.name}>{d.name}</span>
                      <div className="dv-loading-progress">
                        <div className="dv-loading-bar" />
                      </div>
                      <span className="dv-loading-message">{d.loadingState?.message || 'Processing...'}</span>
                    </div>
                  ) : hasError ? (
                    <div className="dv-dataset-info">
                      <span className="dv-dataset-name" title={d.name}>{d.name}</span>
                      <span className="dv-dataset-error" title={d.loadingState?.error}>
                        Error
                      </span>
                    </div>
                  ) : (
                    <div className="dv-dataset-info">
                      <span className="dv-dataset-name" title={d.name}>{d.name}</span>
                      <span className="dv-dataset-stats">
                        {validCount} mol {needsConfig ? '⚠' : '✓'}
                      </span>
                    </div>
                  )}
                  <button
                    className="dv-dataset-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeDataset(d.id);
                    }}
                    title={isLoading ? 'Cancel' : 'Remove dataset'}
                  >
                    ×
                  </button>
                </div>
              );
            })}

            {/* Add Dataset Card - directly opens file picker */}
            <div
              className="dv-dataset-card dv-add-card"
              onClick={handleAddDatasetClick}
            >
              <span className="dv-add-icon">+</span>
              <span className="dv-add-text">Add</span>
            </div>

            {/* Hidden FileUpload to handle the actual file processing */}
            <div style={{ display: 'none' }}>
              <FileUpload
                addToExisting
                onComplete={() => {}}
                compact
                inputRef={addFileInputRef}
              />
            </div>
          </div>
        </section>

        {/* Table Section */}
        {activeDataset && (
          <section className="dv-table-section">
            <div className="dv-table-header">
              <div className="dv-table-title">
                <span className="dv-dataset-name-large">{activeDataset.name}</span>
                {!activeDataset.loadingState?.isLoading && (
                  <div className="dv-color-picker">
                    {DATASET_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`dv-color-btn ${activeDataset.color === color ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setDatasetColor(activeDataset.id, color)}
                        title="Set dataset color"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Loading state for active dataset */}
            {activeDataset.loadingState?.isLoading ? (
              <div className="dv-loading-state">
                <div className="dv-loading-spinner" />
                <div className="dv-loading-info">
                  <span className="dv-loading-title">Processing dataset...</span>
                  <div className="dv-loading-progress-large">
                    <div
                      className="dv-loading-bar-large"
                      style={{ width: `${activeDataset.loadingState.progress}%` }}
                    />
                  </div>
                  <span className="dv-loading-status">{activeDataset.loadingState.message}</span>
                </div>
              </div>
            ) : activeDataset.loadingState?.error ? (
              <div className="dv-error-state">
                <span className="dv-error-icon">⚠</span>
                <span className="dv-error-title">Error processing dataset</span>
                <span className="dv-error-message">{activeDataset.loadingState.error}</span>
              </div>
            ) : (
              <>
            {/* Columns Header */}
            <div className="dv-columns-header">
              <span className="dv-columns-title">COLUMNS</span>
              <div className="dv-legend">
                {COLUMN_ROLES.map((role) => (
                  <span
                    key={role.id}
                    className="dv-legend-item"
                    style={{ '--role-color': role.color } as React.CSSProperties}
                  >
                    <span className="dv-legend-icon">{role.icon}</span>
                    <span className="dv-legend-label">{role.label}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="dv-table-wrapper">
              <div className="dv-table-scroll">
                <table className="dv-table">
                  <thead>
                    <tr>
                      <th className="dv-row-num">#</th>
                      {columns.map((header) => {
                        const info = getColumnInfo(header);
                        const roles = columnToRoles[header] || [];

                        return (
                          <th key={header} className="dv-th">
                            <div className={`dv-column-header ${roles.length > 0 ? 'has-role' : ''}`}>
                              <div className="dv-column-info">
                                <span className="dv-column-name" title={header}>
                                  {header}
                                </span>
                                <span
                                  className="dv-column-type"
                                  title={info?.type === 'number' ? 'Numeric column' : 'Text column'}
                                >
                                  {info?.type === 'number' ? 'Σ' : 'Aa'}
                                </span>
                              </div>
                              <div className="dv-role-toggles">
                                {COLUMN_ROLES.map((role) => {
                                  const isActive = hasRole(header, role.id);
                                  return (
                                    <button
                                      key={role.id}
                                      className={`dv-role-toggle ${isActive ? 'active' : ''}`}
                                      style={{ '--role-color': role.color } as React.CSSProperties}
                                      onClick={() => handleRoleToggle(header, role.id)}
                                      title={`${isActive ? 'Remove' : 'Assign'} ${role.label} role`}
                                    >
                                      {role.icon}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((mol, rowIndex) => {
                      const absoluteIndex = currentPage * ROWS_PER_PAGE + rowIndex;
                      return (
                        <tr key={absoluteIndex}>
                          <td className="dv-row-num">{absoluteIndex + 1}</td>
                          {columns.map((header) => {
                            const roles = columnToRoles[header] || [];
                            const value = mol.originalRow
                              ? String(mol.originalRow[header] ?? '')
                              : '';
                            return (
                              <td
                                key={header}
                                className={`dv-td ${roles.length > 0 ? 'has-role' : ''}`}
                                style={
                                  roles.length > 0
                                    ? { '--role-color': COLUMN_ROLES.find(r => r.id === roles[0])?.color } as React.CSSProperties
                                    : undefined
                                }
                              >
                                <span className="dv-cell-value" title={value}>
                                  {value || <span className="dv-empty">—</span>}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="dv-pagination">
                  <button
                    className="dv-page-btn"
                    onClick={() => setCurrentPage(0)}
                    disabled={currentPage === 0}
                  >
                    ««
                  </button>
                  <button
                    className="dv-page-btn"
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                  >
                    ‹
                  </button>
                  <span className="dv-page-info">
                    {currentPage + 1} / {totalPages}
                  </span>
                  <button
                    className="dv-page-btn"
                    onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                  >
                    ›
                  </button>
                  <button
                    className="dv-page-btn"
                    onClick={() => setCurrentPage(totalPages - 1)}
                    disabled={currentPage >= totalPages - 1}
                  >
                    »»
                  </button>
                </div>
              )}
            </div>

            {/* Display Settings */}
            <div className="dv-display-section">
              <span className="dv-section-title">DISPLAY</span>

              <div className="dv-display-row">
                <label className="dv-display-label">Label</label>
                <div className="dv-display-input-wrapper">
                  <input
                    type="text"
                    className="dv-display-input"
                    placeholder="e.g., @name: @pKi"
                    value={activeDataset.displaySettings?.labelTemplate || ''}
                    onChange={(e) => handleLabelTemplateChange(e.target.value)}
                  />
                  <div className="dv-quick-columns">
                    {columns.slice(0, 4).map((col) => (
                      <button
                        key={col}
                        type="button"
                        className="dv-quick-btn"
                        onClick={() => {
                          const current = activeDataset.displaySettings?.labelTemplate || '';
                          const newValue = current ? `${current} @${col}` : `@${col}`;
                          handleLabelTemplateChange(newValue);
                        }}
                      >
                        {col}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="dv-display-row">
                <label className="dv-display-label">Value</label>
                <div className="dv-display-input-wrapper">
                  <input
                    type="text"
                    className="dv-display-input"
                    placeholder="e.g., @pKi or abs(@a - @b)"
                    value={activeDataset.displaySettings?.valueExpression || ''}
                    onChange={(e) => handleValueExpressionChange(e.target.value)}
                  />
                  <span className="dv-display-hint">
                    Supports: @column, +, -, *, /, abs(), log()
                  </span>
                </div>
              </div>
            </div>
              </>
            )}
          </section>
        )}

        {/* Footer Summary */}
        {datasets.length > 0 && (
          <section className="dv-footer">
            <div className="dv-summary">
              <span className="dv-summary-text">
                {summary.total} molecules ready
                {summary.loading > 0 && (
                  <span className="dv-summary-loading">
                    {' '}· {summary.loading} loading
                  </span>
                )}
                {summary.needsConfig > 0 && (
                  <span className="dv-summary-warning">
                    {' '}· {summary.needsConfig} dataset{summary.needsConfig > 1 ? 's' : ''} needs configuration
                  </span>
                )}
              </span>
            </div>
            <button
              className="dv-action-btn"
              onClick={onGoToAnalysis}
              disabled={summary.total === 0}
            >
              → Go to Analysis
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
