import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnMapping, ParsedCSVData, ImportOptions, RowSelectionMode, ColumnInfo } from '../types';

interface ColumnMappingDialogProps {
  parsedData: ParsedCSVData;
  onConfirm: (mapping: ColumnMapping, importOptions: ImportOptions, columnInfo: ColumnInfo[]) => void;
  onCancel: () => void;
}

// Column role definitions
const COLUMN_ROLES = [
  {
    id: 'smiles' as const,
    label: 'SMILES',
    color: '#3b82f6',
    icon: '⬡',
    required: true,
    multiple: false,
    autoDetect: ['smiles', 'smile', 'mol', 'molecule', 'structure'],
  },
  {
    id: 'value' as const,
    label: 'Value',
    color: '#10b981',
    icon: '#',
    required: false,
    multiple: true, // Can have multiple value columns
    autoDetect: ['value', 'target', 'activity', 'y', 'ic50', 'pki', 'score', 'affinity'],
  },
  {
    id: 'label' as const,
    label: 'Label',
    color: '#f59e0b',
    icon: 'A',
    required: false,
    multiple: true, // Can have multiple label columns
    autoDetect: ['name', 'label', 'id', 'title', 'compound', 'molecule_name', 'mol_name'],
  },
  {
    id: 'group' as const,
    label: 'Group',
    color: '#8b5cf6',
    icon: '◉',
    required: false,
    multiple: false, // Only one group column
    autoDetect: ['group', 'category', 'class', 'type', 'series', 'source', 'dataset'],
  },
] as const;

type RoleId = (typeof COLUMN_ROLES)[number]['id'];

// Detect column type based on sample values
function detectColumnType(rows: Record<string, unknown>[], columnName: string): 'number' | 'string' {
  let numericCount = 0;
  let totalCount = 0;

  for (const row of rows.slice(0, 100)) { // Sample first 100 rows
    const val = row[columnName];
    if (val !== null && val !== undefined && val !== '') {
      totalCount++;
      const num = parseFloat(String(val));
      if (!isNaN(num) && isFinite(num)) {
        numericCount++;
      }
    }
  }

  // If >80% of non-empty values are numeric, consider it a number column
  return totalCount > 0 && numericCount / totalCount > 0.8 ? 'number' : 'string';
}

// Get sample values for a column
function getSampleValues(rows: Record<string, unknown>[], columnName: string, maxSamples = 5): string[] {
  const samples: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const val = row[columnName];
    if (val !== null && val !== undefined && val !== '') {
      const strVal = String(val);
      if (!seen.has(strVal) && strVal.length < 50) {
        seen.add(strVal);
        samples.push(strVal);
        if (samples.length >= maxSamples) break;
      }
    }
  }

  return samples;
}

const ROWS_PER_PAGE = 8;

export function ColumnMappingDialog({
  parsedData,
  onConfirm,
  onCancel,
}: ColumnMappingDialogProps) {
  const [currentPage, setCurrentPage] = useState(0);

  // Import options state
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    limitEnabled: false,
    limitCount: 1000,
    selectionMode: 'first',
  });

  // Detect column info (types and samples)
  const columnInfo = useMemo((): ColumnInfo[] => {
    return parsedData.headers.map((header) => ({
      name: header,
      type: detectColumnType(parsedData.rows, header),
      sampleValues: getSampleValues(parsedData.rows, header),
    }));
  }, [parsedData.headers, parsedData.rows]);

  // New mapping structure supporting multiple columns
  interface MappingState {
    smiles?: string;
    values: string[];
    labels: string[];
    group?: string;
  }

  // Auto-detect columns based on header names
  const autoDetectedMapping = useMemo((): MappingState => {
    const mapping: MappingState = { values: [], labels: [] };
    const usedColumns = new Set<string>();

    for (const role of COLUMN_ROLES) {
      for (const header of parsedData.headers) {
        const normalizedHeader = header.toLowerCase().trim();
        if (
          role.autoDetect.some((pattern) =>
            normalizedHeader === pattern || normalizedHeader.includes(pattern)
          ) &&
          !usedColumns.has(header)
        ) {
          if (role.id === 'smiles') {
            mapping.smiles = header;
          } else if (role.id === 'value') {
            mapping.values.push(header);
          } else if (role.id === 'label') {
            mapping.labels.push(header);
          } else if (role.id === 'group') {
            mapping.group = header;
          }
          usedColumns.add(header);
          // For non-multiple roles, break after first match
          if (!role.multiple) break;
        }
      }
    }

    return mapping;
  }, [parsedData.headers]);

  const [mapping, setMapping] = useState<MappingState>(autoDetectedMapping);

  // Reverse mapping: column name -> role(s)
  const columnToRoles = useMemo(() => {
    const result: Record<string, RoleId[]> = {};

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
  }, [mapping]);

  const handleColumnRoleToggle = (columnName: string, roleId: RoleId) => {
    setMapping((prev) => {
      const next = { ...prev, values: [...prev.values], labels: [...prev.labels] };

      if (roleId === 'smiles') {
        // SMILES is exclusive - only one column
        next.smiles = next.smiles === columnName ? undefined : columnName;
      } else if (roleId === 'value') {
        // Toggle value column
        if (next.values.includes(columnName)) {
          next.values = next.values.filter((v) => v !== columnName);
        } else {
          next.values.push(columnName);
        }
      } else if (roleId === 'label') {
        // Toggle label column
        if (next.labels.includes(columnName)) {
          next.labels = next.labels.filter((l) => l !== columnName);
        } else {
          next.labels.push(columnName);
        }
      } else if (roleId === 'group') {
        // Group is exclusive - only one column
        next.group = next.group === columnName ? undefined : columnName;
      }

      return next;
    });
  };

  // Check if column has a specific role
  const hasRole = (columnName: string, roleId: RoleId): boolean => {
    const roles = columnToRoles[columnName];
    return roles?.includes(roleId) || false;
  };

  const isValid = mapping.smiles !== undefined && mapping.smiles !== '';

  // Calculate effective row count after limit
  const effectiveRowCount = useMemo(() => {
    if (!importOptions.limitEnabled) return parsedData.rows.length;
    return Math.min(importOptions.limitCount, parsedData.rows.length);
  }, [importOptions.limitEnabled, importOptions.limitCount, parsedData.rows.length]);

  const handleConfirm = () => {
    if (!isValid) return;

    const columnMapping: ColumnMapping = {
      smiles: mapping.smiles!,
      values: mapping.values,
      labels: mapping.labels,
      group: mapping.group,
    };

    onConfirm(columnMapping, importOptions, columnInfo);
  };

  // Pagination
  const totalPages = Math.ceil(parsedData.rows.length / ROWS_PER_PAGE);
  const paginatedRows = parsedData.rows.slice(
    currentPage * ROWS_PER_PAGE,
    (currentPage + 1) * ROWS_PER_PAGE
  );

  // Get all roles for a column
  const getRolesForColumn = (columnName: string) => {
    const roleIds = columnToRoles[columnName] || [];
    return roleIds.map((id) => COLUMN_ROLES.find((r) => r.id === id)!);
  };

  // Get column info by name
  const getColumnInfo = (columnName: string) => {
    return columnInfo.find((c) => c.name === columnName);
  };

  // Count mapped columns
  const mappedCount =
    (mapping.smiles ? 1 : 0) +
    mapping.values.length +
    mapping.labels.length +
    (mapping.group ? 1 : 0);

  return createPortal(
    <div className="cmapper-overlay">
      <div className="cmapper-container">
        {/* Header */}
        <header className="cmapper-header">
          <div className="cmapper-header-content">
            <div className="cmapper-title-group">
              <h1 className="cmapper-title">Configure Data Import</h1>
              <span className="cmapper-filename">{parsedData.fileName}</span>
            </div>
            <div className="cmapper-stats">
              <div className="cmapper-stat">
                <span className="cmapper-stat-value">{parsedData.rows.length}</span>
                <span className="cmapper-stat-label">rows</span>
              </div>
              <div className="cmapper-stat-divider" />
              <div className="cmapper-stat">
                <span className="cmapper-stat-value">{parsedData.headers.length}</span>
                <span className="cmapper-stat-label">columns</span>
              </div>
              <div className="cmapper-stat-divider" />
              <div className="cmapper-stat">
                <span className="cmapper-stat-value">{mappedCount}</span>
                <span className="cmapper-stat-label">mapped</span>
              </div>
            </div>
          </div>

          {/* Role Legend */}
          <div className="cmapper-legend">
            <span className="cmapper-legend-label">Assign roles:</span>
            {COLUMN_ROLES.map((role) => {
              const count =
                role.id === 'smiles'
                  ? mapping.smiles
                    ? 1
                    : 0
                  : role.id === 'value'
                    ? mapping.values.length
                    : role.id === 'label'
                      ? mapping.labels.length
                      : mapping.group
                        ? 1
                        : 0;
              const isActive = count > 0;

              return (
                <div
                  key={role.id}
                  className={`cmapper-legend-item ${isActive ? 'active' : ''}`}
                  style={{ '--role-color': role.color } as React.CSSProperties}
                >
                  <span className="cmapper-legend-icon">{role.icon}</span>
                  <span className="cmapper-legend-name">{role.label}</span>
                  {role.required && <span className="cmapper-legend-required">*</span>}
                  {role.multiple && count > 1 && (
                    <span className="cmapper-legend-count">{count}</span>
                  )}
                  {isActive && !role.multiple && <span className="cmapper-legend-check">✓</span>}
                  {isActive && role.multiple && count === 1 && (
                    <span className="cmapper-legend-check">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </header>

        {/* Table Container */}
        <div className="cmapper-table-wrapper">
          <div className="cmapper-table-scroll">
            <table className="cmapper-table">
              <thead>
                <tr>
                  <th className="cmapper-row-num">#</th>
                  {parsedData.headers.map((header) => {
                    const roles = getRolesForColumn(header);
                    const colInfo = getColumnInfo(header);
                    const hasAnyRole = roles.length > 0;

                    return (
                      <th key={header} className="cmapper-th">
                        <div
                          className={`cmapper-column-header ${hasAnyRole ? 'has-role' : ''}`}
                          style={
                            roles.length > 0
                              ? ({ '--role-color': roles[0].color } as React.CSSProperties)
                              : undefined
                          }
                        >
                          {/* Column name and type */}
                          <div className="cmapper-column-info">
                            <span className="cmapper-column-name" title={header}>
                              {header}
                            </span>
                            <span
                              className="cmapper-column-type"
                              title={colInfo?.type === 'number' ? 'Numeric column' : 'Text column'}
                            >
                              {colInfo?.type === 'number' ? 'Σ' : 'Aa'}
                            </span>
                          </div>

                          {/* Role toggles */}
                          <div className="cmapper-role-toggles">
                            {COLUMN_ROLES.map((role) => {
                              const isActive = hasRole(header, role.id);
                              return (
                                <button
                                  key={role.id}
                                  className={`cmapper-role-toggle ${isActive ? 'active' : ''}`}
                                  style={{ '--role-color': role.color } as React.CSSProperties}
                                  onClick={() => handleColumnRoleToggle(header, role.id)}
                                  title={`${isActive ? 'Remove' : 'Assign'} ${role.label} role`}
                                >
                                  <span className="cmapper-role-toggle-icon">{role.icon}</span>
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
                {paginatedRows.map((row, rowIndex) => {
                  const absoluteIndex = currentPage * ROWS_PER_PAGE + rowIndex;
                  return (
                    <tr key={absoluteIndex}>
                      <td className="cmapper-row-num">{absoluteIndex + 1}</td>
                      {parsedData.headers.map((header) => {
                        const roles = getRolesForColumn(header);
                        const value = String(row[header] ?? '');
                        return (
                          <td
                            key={header}
                            className={`cmapper-td ${roles.length > 0 ? 'has-role' : ''}`}
                            style={
                              roles.length > 0
                                ? ({ '--role-color': roles[0].color } as React.CSSProperties)
                                : undefined
                            }
                          >
                            <span className="cmapper-cell-value" title={value}>
                              {value || <span className="cmapper-empty">—</span>}
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
        </div>

        {/* Footer */}
        <footer className="cmapper-footer">
          {/* Row Limit Options */}
          <div className="cmapper-row-limit">
            <label className="cmapper-limit-toggle">
              <input
                type="checkbox"
                checked={importOptions.limitEnabled}
                onChange={(e) =>
                  setImportOptions((prev) => ({ ...prev, limitEnabled: e.target.checked }))
                }
              />
              <span className="cmapper-limit-toggle-label">Limit rows</span>
            </label>

            {importOptions.limitEnabled && (
              <div className="cmapper-limit-controls">
                <select
                  value={importOptions.selectionMode}
                  onChange={(e) =>
                    setImportOptions((prev) => ({
                      ...prev,
                      selectionMode: e.target.value as RowSelectionMode,
                    }))
                  }
                  className="cmapper-limit-mode"
                >
                  <option value="first">First</option>
                  <option value="last">Last</option>
                  <option value="random">Random</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={parsedData.rows.length}
                  value={importOptions.limitCount}
                  onChange={(e) =>
                    setImportOptions((prev) => ({
                      ...prev,
                      limitCount: Math.max(1, parseInt(e.target.value) || 1),
                    }))
                  }
                  className="cmapper-limit-input"
                />
                <span className="cmapper-limit-suffix">rows</span>
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="cmapper-pagination">
            <button
              className="cmapper-page-btn"
              onClick={() => setCurrentPage(0)}
              disabled={currentPage === 0}
            >
              ««
            </button>
            <button
              className="cmapper-page-btn"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              ‹
            </button>
            <span className="cmapper-page-info">
              <span className="cmapper-page-current">{currentPage + 1}</span>
              <span className="cmapper-page-sep">/</span>
              <span className="cmapper-page-total">{totalPages}</span>
            </span>
            <button
              className="cmapper-page-btn"
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              ›
            </button>
            <button
              className="cmapper-page-btn"
              onClick={() => setCurrentPage(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
            >
              »»
            </button>
          </div>

          {/* Warning or Status */}
          <div className="cmapper-status">
            {!isValid ? (
              <div className="cmapper-warning">
                <span className="cmapper-warning-icon">⚠</span>
                <span>Select a SMILES column to continue</span>
              </div>
            ) : (
              <div className="cmapper-ready">
                <span className="cmapper-ready-icon">✓</span>
                <span>
                  Ready to import {effectiveRowCount} molecule{effectiveRowCount !== 1 ? 's' : ''}
                  {importOptions.limitEnabled && effectiveRowCount < parsedData.rows.length && (
                    <span className="cmapper-limit-note"> (of {parsedData.rows.length})</span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="cmapper-actions">
            <button onClick={onCancel} className="cmapper-btn cmapper-btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className="cmapper-btn cmapper-btn-primary"
            >
              Import Data
              <span className="cmapper-btn-arrow">→</span>
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
