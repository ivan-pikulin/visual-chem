import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnMapping, ParsedCSVData } from '../types';

interface ColumnMappingDialogProps {
  parsedData: ParsedCSVData;
  onConfirm: (mapping: ColumnMapping) => void;
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
    autoDetect: ['smiles', 'smile', 'mol', 'molecule', 'structure'],
  },
  {
    id: 'value' as const,
    label: 'Value',
    color: '#10b981',
    icon: '#',
    required: false,
    autoDetect: ['value', 'target', 'activity', 'y', 'ic50', 'pki', 'score', 'affinity'],
  },
  {
    id: 'label' as const,
    label: 'Label',
    color: '#f59e0b',
    icon: 'A',
    required: false,
    autoDetect: ['name', 'label', 'id', 'title', 'compound', 'molecule_name', 'mol_name'],
  },
  {
    id: 'group' as const,
    label: 'Group',
    color: '#8b5cf6',
    icon: '◉',
    required: false,
    autoDetect: ['group', 'category', 'class', 'type', 'series', 'source', 'dataset'],
  },
] as const;

type RoleId = (typeof COLUMN_ROLES)[number]['id'];

const ROWS_PER_PAGE = 8;

export function ColumnMappingDialog({
  parsedData,
  onConfirm,
  onCancel,
}: ColumnMappingDialogProps) {
  const [currentPage, setCurrentPage] = useState(0);

  // Auto-detect columns based on header names
  const autoDetectedMapping = useMemo(() => {
    const mapping: Partial<Record<RoleId, string>> = {};
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
          mapping[role.id] = header;
          usedColumns.add(header);
          break;
        }
      }
    }

    return mapping;
  }, [parsedData.headers]);

  const [mapping, setMapping] = useState<Partial<Record<RoleId, string>>>(autoDetectedMapping);

  // Reverse mapping: column name -> role
  const columnToRole = useMemo(() => {
    const result: Record<string, RoleId> = {};
    for (const [roleId, colName] of Object.entries(mapping)) {
      if (colName) {
        result[colName] = roleId as RoleId;
      }
    }
    return result;
  }, [mapping]);

  const handleColumnRoleChange = (columnName: string, roleId: RoleId | '') => {
    setMapping((prev) => {
      const next = { ...prev };

      // Remove this column from any existing role
      for (const key of Object.keys(next) as RoleId[]) {
        if (next[key] === columnName) {
          delete next[key];
        }
      }

      // If selecting a role (not "none"), also remove any other column from that role
      if (roleId !== '') {
        // Assign new role
        next[roleId] = columnName;
      }

      return next;
    });
  };

  const isValid = mapping.smiles !== undefined && mapping.smiles !== '';

  const handleConfirm = () => {
    if (!isValid) return;

    const columnMapping: ColumnMapping = {
      smiles: mapping.smiles!,
      value: mapping.value,
      label: mapping.label,
      group: mapping.group,
    };

    onConfirm(columnMapping);
  };

  // Pagination
  const totalPages = Math.ceil(parsedData.rows.length / ROWS_PER_PAGE);
  const paginatedRows = parsedData.rows.slice(
    currentPage * ROWS_PER_PAGE,
    (currentPage + 1) * ROWS_PER_PAGE
  );

  const getRoleForColumn = (columnName: string) => {
    const roleId = columnToRole[columnName];
    return roleId ? COLUMN_ROLES.find(r => r.id === roleId) : null;
  };

  // Count mapped columns
  const mappedCount = Object.keys(mapping).length;

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
            {COLUMN_ROLES.map((role) => (
              <div
                key={role.id}
                className={`cmapper-legend-item ${mapping[role.id] ? 'active' : ''}`}
                style={{ '--role-color': role.color } as React.CSSProperties}
              >
                <span className="cmapper-legend-icon">{role.icon}</span>
                <span className="cmapper-legend-name">{role.label}</span>
                {role.required && <span className="cmapper-legend-required">*</span>}
                {mapping[role.id] && (
                  <span className="cmapper-legend-check">✓</span>
                )}
              </div>
            ))}
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
                    const role = getRoleForColumn(header);
                    return (
                      <th key={header} className="cmapper-th">
                        <div
                          className={`cmapper-column-header ${role ? 'has-role' : ''}`}
                          style={role ? { '--role-color': role.color } as React.CSSProperties : undefined}
                        >
                          {/* Role selector dropdown */}
                          <div className="cmapper-role-selector">
                            <select
                              value={columnToRole[header] || ''}
                              onChange={(e) => handleColumnRoleChange(header, e.target.value as RoleId | '')}
                              className="cmapper-role-select"
                            >
                              <option value="">— Select role —</option>
                              {COLUMN_ROLES.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.icon} {r.label}{r.required ? ' *' : ''}
                                </option>
                              ))}
                            </select>
                            {role && (
                              <div
                                className="cmapper-role-badge"
                                style={{ backgroundColor: role.color }}
                              >
                                <span className="cmapper-role-badge-icon">{role.icon}</span>
                                <span className="cmapper-role-badge-label">{role.label}</span>
                              </div>
                            )}
                          </div>
                          {/* Column name */}
                          <span className="cmapper-column-name" title={header}>
                            {header}
                          </span>
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
                        const role = getRoleForColumn(header);
                        const value = String(row[header] ?? '');
                        return (
                          <td
                            key={header}
                            className={`cmapper-td ${role ? 'has-role' : ''}`}
                            style={role ? { '--role-color': role.color } as React.CSSProperties : undefined}
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
                <span>Ready to import {parsedData.rows.length} molecules</span>
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
