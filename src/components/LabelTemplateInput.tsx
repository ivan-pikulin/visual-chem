import { useCallback, useEffect, useState, forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { ColumnInfo } from '../types';

interface LabelTemplateInputProps {
  value: string;
  onChange: (value: string) => void;
  columns: string[];
  /** Column info for type filtering - if provided, will be used for filtering */
  columnInfo?: ColumnInfo[];
  /** Filter columns by type - only works if columnInfo is provided */
  columnTypeFilter?: 'number' | 'string' | 'all';
  placeholder?: string;
}

interface MentionListProps {
  items: string[];
  command: (props: { id: string }) => void;
}

interface MentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

// Mention suggestions dropdown component
const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command({ id: item });
        }
      },
      [items, command]
    );

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return null;
    }

    return (
      <div className="tiptap-mention-dropdown">
        {items.map((item, index) => (
          <button
            key={item}
            className={`tiptap-mention-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => selectItem(index)}
            type="button"
          >
            <span className="tiptap-mention-icon">@</span>
            {item}
          </button>
        ))}
      </div>
    );
  }
);

MentionList.displayName = 'MentionList';

// Convert editor content to plain text with @mentions
function editorToTemplate(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return '';

  const json = editor.getJSON();
  let result = '';

  const processNode = (node: Record<string, unknown>): void => {
    if (node.type === 'text') {
      result += node.text as string;
    } else if (node.type === 'mention') {
      const attrs = node.attrs as { id: string } | undefined;
      result += `@${attrs?.id || ''}`;
    } else if (node.type === 'paragraph') {
      if (result.length > 0 && !result.endsWith('\n')) {
        result += '\n';
      }
      const content = node.content as Record<string, unknown>[] | undefined;
      if (content) {
        content.forEach(processNode);
      }
    } else if (node.type === 'doc') {
      const content = node.content as Record<string, unknown>[] | undefined;
      if (content) {
        content.forEach(processNode);
      }
    }
  };

  processNode(json as Record<string, unknown>);
  return result.trim();
}

// Convert plain text template to editor content
function templateToContent(template: string): string {
  if (!template) return '<p></p>';

  const lines = template.split('\n');
  const paragraphs = lines.map((line) => {
    // Replace @column with mention spans
    const html = line.replace(/@(\w+)/g, '<span data-type="mention" data-id="$1">@$1</span>');
    return `<p>${html || '<br>'}</p>`;
  });

  return paragraphs.join('');
}

export function LabelTemplateInput({
  value,
  onChange,
  columns,
  columnInfo,
  columnTypeFilter = 'all',
  placeholder = 'Type @ to insert column values...',
}: LabelTemplateInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  // Filter columns by type if columnInfo is provided
  const filteredColumns = useMemo(() => {
    if (!columnInfo || columnTypeFilter === 'all') {
      return columns;
    }
    const allowedColumns = new Set(
      columnInfo
        .filter((col) => col.type === columnTypeFilter)
        .map((col) => col.name)
    );
    return columns.filter((col) => allowedColumns.has(col));
  }, [columns, columnInfo, columnTypeFilter]);

  // Use ref to always have access to current filtered columns in suggestion callback
  const filteredColumnsRef = useRef(filteredColumns);
  filteredColumnsRef.current = filteredColumns;

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Placeholder.configure({
        placeholder,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'tiptap-mention',
        },
        renderHTML({ options, node }) {
          return [
            'span',
            options.HTMLAttributes,
            `@${node.attrs.id}`,
          ];
        },
        suggestion: {
          items: ({ query }: { query: string }) => {
            return filteredColumnsRef.current
              .filter((col) => col.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 8);
          },
          render: () => {
            let component: ReactRenderer<MentionListRef> | null = null;
            let popup: HTMLElement | null = null;

            return {
              onStart: (props: SuggestionProps) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                popup = document.createElement('div');
                popup.className = 'tiptap-mention-popup';
                popup.appendChild(component.element);

                const rect = props.clientRect?.();
                if (rect && popup) {
                  popup.style.position = 'fixed';
                  popup.style.left = `${rect.left}px`;
                  popup.style.top = `${rect.bottom + 4}px`;
                }

                document.body.appendChild(popup);
              },
              onUpdate: (props: SuggestionProps) => {
                component?.updateProps(props);

                const rect = props.clientRect?.();
                if (rect && popup) {
                  popup.style.left = `${rect.left}px`;
                  popup.style.top = `${rect.bottom + 4}px`;
                }
              },
              onKeyDown: (props: SuggestionKeyDownProps) => {
                if (props.event.key === 'Escape') {
                  popup?.remove();
                  component?.destroy();
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup?.remove();
                component?.destroy();
              },
            };
          },
        },
      }),
    ],
    content: templateToContent(value),
    onUpdate: ({ editor }) => {
      const newValue = editorToTemplate(editor);
      onChange(newValue);
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentValue = editorToTemplate(editor);
      if (currentValue !== value) {
        editor.commands.setContent(templateToContent(value));
      }
    }
  }, [value, editor]);

  return (
    <div className={`tiptap-container ${isFocused ? 'focused' : ''}`}>
      <EditorContent editor={editor} className="tiptap-editor" />
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
