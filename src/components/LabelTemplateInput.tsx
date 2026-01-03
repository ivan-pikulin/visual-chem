import { useState, useRef, useEffect, useCallback, KeyboardEvent, useMemo } from 'react';

interface LabelTemplateInputProps {
  value: string;
  onChange: (value: string) => void;
  columns: string[];
  placeholder?: string;
}

interface Token {
  type: 'text' | 'column';
  value: string;
  start: number;
  end: number;
}

// Parse template string into tokens
function parseTemplate(template: string): Token[] {
  const tokens: Token[] = [];
  const regex = /@(\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        value: template.slice(lastIndex, match.index),
        start: lastIndex,
        end: match.index,
      });
    }
    // Add column reference
    tokens.push({
      type: 'column',
      value: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < template.length) {
    tokens.push({
      type: 'text',
      value: template.slice(lastIndex),
      start: lastIndex,
      end: template.length,
    });
  }

  return tokens;
}

export function LabelTemplateInput({
  value,
  onChange,
  columns,
  placeholder = 'Type text and @column to add columns...',
}: LabelTemplateInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on current input after @
  const filteredSuggestions = useMemo(() => {
    if (!suggestionFilter) return columns;
    const filter = suggestionFilter.toLowerCase();
    return columns.filter((col) => col.toLowerCase().includes(filter));
  }, [columns, suggestionFilter]);

  // Detect @ trigger and show suggestions
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      onChange(newValue);
      setCursorPosition(cursorPos);

      // Check if we're typing after @
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@(\w*)$/);

      if (atMatch) {
        setSuggestionFilter(atMatch[1]);
        setShowSuggestions(true);
        setSelectedSuggestionIndex(0);
      } else {
        setShowSuggestions(false);
        setSuggestionFilter('');
      }
    },
    [onChange]
  );

  // Insert column reference
  const insertColumn = useCallback(
    (column: string) => {
      const textBeforeCursor = value.slice(0, cursorPosition);
      const textAfterCursor = value.slice(cursorPosition);

      // Find and replace @partial with @column
      const atMatch = textBeforeCursor.match(/@(\w*)$/);
      if (atMatch) {
        const beforeAt = textBeforeCursor.slice(0, atMatch.index);
        const newValue = beforeAt + '@' + column + textAfterCursor;
        onChange(newValue);

        // Move cursor after inserted column
        const newCursorPos = beforeAt.length + column.length + 1;
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
            inputRef.current.focus();
          }
        }, 0);
      }

      setShowSuggestions(false);
      setSuggestionFilter('');
    },
    [value, cursorPosition, onChange]
  );

  // Handle keyboard navigation in suggestions
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestions) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedSuggestionIndex((prev) =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
        case 'Tab':
          if (filteredSuggestions.length > 0) {
            e.preventDefault();
            insertColumn(filteredSuggestions[selectedSuggestionIndex]);
          }
          break;
        case 'Escape':
          setShowSuggestions(false);
          break;
      }
    },
    [showSuggestions, filteredSuggestions, selectedSuggestionIndex, insertColumn]
  );

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll selected suggestion into view
  useEffect(() => {
    if (showSuggestions && suggestionsRef.current) {
      const selectedEl = suggestionsRef.current.children[selectedSuggestionIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedSuggestionIndex, showSuggestions]);

  // Parse for preview rendering
  const tokens = parseTemplate(value);
  const hasColumns = tokens.some((t) => t.type === 'column');

  return (
    <div className="label-template-input-container">
      {/* Preview with styled column badges */}
      {hasColumns && (
        <div className="label-template-preview">
          {tokens.map((token, i) =>
            token.type === 'column' ? (
              <span
                key={i}
                className={`label-template-column-badge ${
                  columns.includes(token.value) ? '' : 'invalid'
                }`}
                title={columns.includes(token.value) ? token.value : `Column "${token.value}" not found`}
              >
                @{token.value}
              </span>
            ) : (
              <span key={i} className="label-template-text">
                {token.value}
              </span>
            )
          )}
        </div>
      )}

      {/* Input field */}
      <div className="label-template-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="label-template-input"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
        />

        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div ref={suggestionsRef} className="label-template-suggestions">
            {filteredSuggestions.map((col, i) => (
              <div
                key={col}
                className={`label-template-suggestion ${i === selectedSuggestionIndex ? 'selected' : ''}`}
                onClick={() => insertColumn(col)}
              >
                <span className="label-template-suggestion-icon">@</span>
                <span className="label-template-suggestion-text">{col}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick column buttons */}
      <div className="label-template-quick-columns">
        {columns.slice(0, 6).map((col) => (
          <button
            key={col}
            type="button"
            className="label-template-quick-column"
            onClick={() => {
              // Insert @column at cursor or end
              const pos = inputRef.current?.selectionStart ?? value.length;
              const newValue = value.slice(0, pos) + '@' + col + value.slice(pos);
              onChange(newValue);
              setTimeout(() => {
                if (inputRef.current) {
                  const newPos = pos + col.length + 1;
                  inputRef.current.setSelectionRange(newPos, newPos);
                  inputRef.current.focus();
                }
              }, 0);
            }}
          >
            @{col}
          </button>
        ))}
      </div>
    </div>
  );
}

// Utility function to resolve a template with actual values
export function resolveLabelTemplate(
  template: string,
  row: Record<string, unknown>
): string {
  if (!template) return '';

  return template.replace(/@(\w+)/g, (_match, columnName) => {
    const value = row[columnName];
    if (value === null || value === undefined) return '';
    return String(value);
  });
}
