import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { ColumnInfo } from '../types';

// Role definitions matching ColumnMappingDialog
const COLUMN_ROLES = [
  { id: 'smiles' as const, label: 'SMILES', color: '#3b82f6', icon: '⬡', multiple: false },
  { id: 'value' as const, label: 'Value', color: '#10b981', icon: '#', multiple: true },
  { id: 'label' as const, label: 'Label', color: '#f59e0b', icon: 'A', multiple: true },
  { id: 'group' as const, label: 'Group', color: '#8b5cf6', icon: '◉', multiple: false },
] as const;

type RoleId = (typeof COLUMN_ROLES)[number]['id'];

export function ColumnManager() {
  const {
    dataset,
    visualization,
    addValueColumn,
    removeValueColumn,
    addLabelColumn,
    removeLabelColumn,
    setGroupColumn,
    setActiveColumns,
  } = useAppStore();

  const columnMapping = dataset?.columnMapping;
  const columnInfo = dataset?.columnInfo || [];
  const activeColumns = visualization.activeColumns;

  // Build reverse mapping: column name -> roles
  const columnToRoles = useMemo(() => {
    if (!columnMapping) return {};

    const result: Record<string, RoleId[]> = {};

    if (columnMapping.smiles) {
      result[columnMapping.smiles] = ['smiles'];
    }
    for (const col of columnMapping.values) {
      result[col] = [...(result[col] || []), 'value'];
    }
    for (const col of columnMapping.labels) {
      result[col] = [...(result[col] || []), 'label'];
    }
    if (columnMapping.group) {
      result[columnMapping.group] = [...(result[columnMapping.group] || []), 'group'];
    }

    return result;
  }, [columnMapping]);

  const hasRole = (columnName: string, roleId: RoleId): boolean => {
    return columnToRoles[columnName]?.includes(roleId) || false;
  };

  const isActiveColumn = (columnName: string, roleId: RoleId): boolean => {
    if (roleId === 'value') return activeColumns.value === columnName;
    if (roleId === 'label') return activeColumns.label === columnName;
    return false;
  };

  const handleRoleToggle = (columnName: string, roleId: RoleId) => {
    if (roleId === 'smiles') {
      // SMILES cannot be changed after import
      return;
    }

    const currentlyHasRole = hasRole(columnName, roleId);

    if (roleId === 'value') {
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
  };

  const handleSetActive = (columnName: string, roleId: 'value' | 'label') => {
    setActiveColumns({ [roleId]: columnName });
  };

  if (!dataset || !columnMapping) {
    return (
      <div className="colmgr-empty">
        <p>No dataset loaded</p>
      </div>
    );
  }

  // Get all columns from CSV headers
  const columns = dataset.csvHeaders || [];

  return (
    <div className="colmgr">
      <div className="colmgr-header">
        <span className="colmgr-title">Column Roles</span>
        <span className="colmgr-subtitle">
          Assign columns to visualization roles
        </span>
      </div>

      <div className="colmgr-list">
        {columns.map((columnName) => {
          const info = columnInfo.find((c: ColumnInfo) => c.name === columnName);
          const roles = columnToRoles[columnName] || [];
          const isSmilesColumn = columnName === columnMapping.smiles;

          return (
            <div
              key={columnName}
              className={`colmgr-card ${roles.length > 0 ? 'has-roles' : ''} ${isSmilesColumn ? 'is-smiles' : ''}`}
            >
              {/* Column header */}
              <div className="colmgr-card-header">
                <div className="colmgr-card-info">
                  <span className="colmgr-card-name" title={columnName}>
                    {columnName}
                  </span>
                  <span
                    className="colmgr-card-type"
                    title={info?.type === 'number' ? 'Numeric column' : 'Text column'}
                  >
                    {info?.type === 'number' ? 'Σ' : 'Aa'}
                  </span>
                </div>

                {/* Active role badges */}
                {roles.length > 0 && (
                  <div className="colmgr-badges">
                    {roles.map((roleId) => {
                      const role = COLUMN_ROLES.find((r) => r.id === roleId)!;
                      const isActive = isActiveColumn(columnName, roleId);
                      return (
                        <div
                          key={roleId}
                          className={`colmgr-badge ${isActive ? 'active' : ''}`}
                          style={{ '--role-color': role.color } as React.CSSProperties}
                          onClick={() => {
                            if (role.multiple && hasRole(columnName, roleId)) {
                              handleSetActive(columnName, roleId as 'value' | 'label');
                            }
                          }}
                          title={
                            role.multiple && hasRole(columnName, roleId)
                              ? `Click to use this column for ${role.label.toLowerCase()}`
                              : role.label
                          }
                        >
                          <span className="colmgr-badge-icon">{role.icon}</span>
                          {isActive && <span className="colmgr-badge-active-dot" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sample values */}
              {info?.sampleValues && info.sampleValues.length > 0 && (
                <div className="colmgr-samples">
                  {info.sampleValues.slice(0, 3).join(', ')}
                  {info.sampleValues.length > 3 && '...'}
                </div>
              )}

              {/* Role toggles */}
              {!isSmilesColumn && (
                <div className="colmgr-roles">
                  {COLUMN_ROLES.filter((r) => r.id !== 'smiles').map((role) => {
                    const isActive = hasRole(columnName, role.id);
                    const isCurrentlyActive = isActiveColumn(columnName, role.id);

                    return (
                      <button
                        key={role.id}
                        className={`colmgr-role-btn ${isActive ? 'active' : ''} ${isCurrentlyActive ? 'current' : ''}`}
                        style={{ '--role-color': role.color } as React.CSSProperties}
                        onClick={() => handleRoleToggle(columnName, role.id)}
                        title={`${isActive ? 'Remove' : 'Add'} ${role.label} role`}
                      >
                        <span className="colmgr-role-icon">{role.icon}</span>
                        <span className="colmgr-role-label">{role.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* SMILES locked indicator */}
              {isSmilesColumn && (
                <div className="colmgr-locked">
                  <span className="colmgr-locked-icon">⬡</span>
                  <span className="colmgr-locked-text">SMILES (locked)</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="colmgr-legend">
        <div className="colmgr-legend-title">Legend</div>
        <div className="colmgr-legend-items">
          {COLUMN_ROLES.map((role) => (
            <div
              key={role.id}
              className="colmgr-legend-item"
              style={{ '--role-color': role.color } as React.CSSProperties}
            >
              <span className="colmgr-legend-icon">{role.icon}</span>
              <span className="colmgr-legend-name">{role.label}</span>
              {role.multiple && <span className="colmgr-legend-multi">multi</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
