'use client';

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { HelpCircle, Check } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import type { GridColumn, GridRow } from './types';
import { isCellEditable } from './types';
import { useIsTabActive } from '@/features/menu-permission/hooks/use-tab-active';

type EditingCell = { key: string; field: string };

export type DataGridHandle = {
  focusFirstEditable: (key: string) => void;
  closeEditing: () => void;
  startEditField: (key: string, field: string) => void;
  scrollToFocused: () => void;
  rememberLayout: () => void;
  resetLayout: () => void;
  rememberMasterLayout: () => void;
  resetMasterLayout: () => void;
  isMaster: boolean;
};

type DataGridProps<T extends Record<string, unknown>> = {
  columns: GridColumn<T>[];
  rows: GridRow<T>[];
  focusedKey?: string | null;
  onFocusedRowChanged?: (key: string | null) => void;
  onCellChange: (key: string, field: keyof T, value: unknown) => void;
  onCancelNewRow?: (key: string) => void;
  onRequestSave?: () => void;
  onRevertRow?: (key: string, snapshot: GridRow<T>) => void;
  onRequestInsertRow?: () => void;
  onRequestDeleteRow?: () => void;
  onOpenHelpPicker?: (row: GridRow<T>, col: GridColumn<T>) => void;
  onCellValidationError?: (field: string, message: string) => void;
  onDateCellEdit?: (rowKey: string, field: string, currentValue: string) => void;
  focusRowColorClass?: string;
  focusBorderColorClass?: string;
  getRowAccentClass?: (row: GridRow<T>) => string | undefined;
  getRowTextClass?: (row: GridRow<T>) => string | undefined;
  isActive?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  selection?: {
    selectedKeys: Set<string>;
    onToggleRow: (key: string) => void;
    onToggleAll: () => void;
    allSelected: boolean;
    someSelected: boolean;
  };
  stickyColumnCount?: number;
  gridId?: string;
  searchFormRef?: React.RefObject<HTMLElement | null>;
  mergeColumns?: (keyof T & string)[];
};

const CELL_HEIGHT = 'h-9';

function alignClass(align?: 'left' | 'center' | 'right') {
  return align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left';
}

function byteLength(str: string): number {
  let len = 0;
  for (const ch of str) {
    len += ch.codePointAt(0)! > 0x7f ? 2 : 1;
  }
  return len;
}

function cellBgClass(
  status: string,
  isFocused: boolean,
  zebra: boolean,
  editable: boolean,
  focusColorClass: string,
  accentClass?: string
): string {
  if (isFocused) return focusColorClass;
  if (status === 'insert') return 'bg-green-50';
  if (status === 'update') return 'bg-amber-50';
  if (accentClass) return accentClass;
  if (editable) return zebra ? 'bg-[#fdfdfe]' : 'bg-card';
  return zebra ? 'bg-[#f9fafc]' : 'bg-[#fcfcfd]';
}

type SortableColumnHeaderProps<T extends Record<string, unknown>> = {
  col: GridColumn<T>;
  displayCaption: string;
  stickyLeft: number | undefined;
  width: number | undefined;
  layoutFixed: boolean;
  isEditableCol: boolean;
  isLastSticky: boolean;
  isVeryLastCol: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent, field: string, currentWidth: number) => void;
};

function SortableColumnHeader<T extends Record<string, unknown>>({
  col,
  displayCaption,
  stickyLeft,
  width,
  layoutFixed,
  isEditableCol,
  isLastSticky,
  isVeryLastCol,
  onContextMenu,
  onResizeStart,
}: SortableColumnHeaderProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.dataField });

  return (
    <th
      ref={setNodeRef}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
      className={`relative text-center px-3 py-2.5 font-semibold sticky top-0 bg-muted border-b border-border touch-none ${
        stickyLeft !== undefined ? 'z-20' : 'z-10'
      } ${col.fixedWidth ? 'truncate' : 'whitespace-nowrap'} ${col.widthClass ?? ''} ${
        isEditableCol ? 'text-foreground' : 'text-muted-foreground'
      }`}
      style={{
        ...(stickyLeft !== undefined ? { left: stickyLeft } : undefined),
        ...(layoutFixed && width ? { width, minWidth: width, maxWidth: width } : undefined),
        ...(isLastSticky || isVeryLastCol ? { boxShadow: '1px 0 0 0 hsl(var(--border))' } : undefined),
        transform: CSS.Translate.toString(transform),
        transition,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      {displayCaption}
      {(col.required || col.requiredOnInsert) ? <span className="text-destructive"> *</span> : null}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => onResizeStart(e, col.dataField, width ?? e.currentTarget.parentElement!.getBoundingClientRect().width)}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 select-none z-10"
      />
    </th>
  );
}

function DataGridInner<T extends Record<string, unknown>>(
  {
    columns,
    rows,
    focusedKey,
    onFocusedRowChanged,
    onCellChange,
    onCancelNewRow,
    onRequestSave,
    onRevertRow,
    onRequestInsertRow,
    onRequestDeleteRow,
    onOpenHelpPicker,
    onCellValidationError,
    onDateCellEdit,
    focusRowColorClass = 'bg-blue-100',
    focusBorderColorClass = 'ring-blue-200',
    getRowAccentClass,
    getRowTextClass,
    isActive = true,
    loading,
    emptyMessage = '데이터가 없습니다',
    selection,
    stickyColumnCount,
    gridId,
    searchFormRef,
    mergeColumns,
  }: DataGridProps<T>,
  ref: React.ForwardedRef<DataGridHandle>
) {
  const isTabActive = useIsTabActive();
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const [order, setOrder] = useState<string[] | null>(null);
  const orderedColumns = useMemo(() => {
    if (!order) return columns;
    const byField = new Map(columns.map((c) => [c.dataField, c] as const));
    const result: GridColumn<T>[] = order.map((f) => byField.get(f)).filter((c): c is GridColumn<T> => !!c);
    const missing = columns.filter((c) => !order.includes(c.dataField));
    for (const col of missing) {
      const codeIdx = columns.indexOf(col);
      let insertAfter = -1;
      for (let i = codeIdx - 1; i >= 0; i--) {
        const pos = result.findIndex((r) => r.dataField === columns[i].dataField);
        if (pos !== -1) { insertAfter = pos; break; }
      }
      result.splice(insertAfter + 1, 0, col);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, order]);

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const visibleColumns = useMemo(
    () => orderedColumns.filter((c) => !hiddenColumns.has(c.dataField)),
    [orderedColumns, hiddenColumns]
  );

  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const [stickyLefts, setStickyLefts] = useState<Record<string, number>>({});
  const [stickyCount, setStickyCount] = useState<number>(stickyColumnCount ?? 0);
  const stickyUntilIndex = stickyCount > 0 ? Math.min(stickyCount, visibleColumns.length) - 1 : -1;

  const [widths, setWidths] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    if (stickyUntilIndex === -1 || !headerRowRef.current) {
      setStickyLefts({});
      return;
    }
    const cells = Array.from(headerRowRef.current.children) as HTMLElement[];
    const dataCellStart = selection ? 1 : 0;
    let acc = selection ? cells[0].offsetWidth : 0;
    const next: Record<string, number> = {};
    for (let i = 0; i <= stickyUntilIndex; i++) {
      next[visibleColumns[i].dataField] = acc;
      acc += cells[dataCellStart + i]?.offsetWidth ?? 0;
    }
    setStickyLefts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickyUntilIndex, !!selection, visibleColumns, rows.length, widths]);

  const [layoutFixed, setLayoutFixed] = useState(false);
  const defaultWidthsRef = useRef<Record<string, number>>({});
  const resizingRef = useRef<{ field: string; startX: number; startWidth: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; colIndex: number; dataField: string } | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const [renamingField, setRenamingField] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [columnAlignOverride, setColumnAlignOverride] = useState<Record<string, 'left' | 'center' | 'right'>>({});

  const hasSeededRef = useRef(false);
  useEffect(() => {
    if (layoutFixed || loading || hasSeededRef.current || !headerRowRef.current) return;
    hasSeededRef.current = true;
    const cells = Array.from(headerRowRef.current.children) as HTMLElement[];
    const dataCellStart = selection ? 1 : 0;
    const next: Record<string, number> = {};
    visibleColumns.forEach((col, i) => {
      next[col.dataField] = cells[dataCellStart + i]?.offsetWidth ?? 100;
    });
    defaultWidthsRef.current = next;
    setWidths((prev) => ({ ...next, ...prev }));
    setLayoutFixed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const pathname = usePathname();
  const menuId = pathname?.split('/').filter(Boolean).pop() ?? '';
  const gridIdKey = gridId ?? 'default';

  async function fetchLayout() {
    if (!menuId) return;
    try {
      const res = await fetch(`/api/grid-layout?menuId=${encodeURIComponent(menuId)}&gridId=${encodeURIComponent(gridIdKey)}`);
      const data = await res.json();
      if (!data?.ok) return;
      if (data.widths) setWidths((prev) => ({ ...prev, ...data.widths }));
      setOrder(Array.isArray(data.order) && data.order.length > 0 ? data.order : null);
      if (typeof data.stickyColumnCount === 'number') setStickyCount(data.stickyColumnCount);
      if (Array.isArray(data.hiddenColumns)) setHiddenColumns(new Set(data.hiddenColumns));
      setIsMaster(!!data.isMaster);
      setColumnLabels(data.columnLabels && typeof data.columnLabels === 'object' ? data.columnLabels : {});
      setColumnAlignOverride(data.columnAlign && typeof data.columnAlign === 'object' ? data.columnAlign : {});
    } catch {
      // 무시 — 코드 기본값 그대로 유지
    }
  }
  useEffect(() => {
    fetchLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuId, gridIdKey]);

  function startResize(e: React.MouseEvent, field: string, currentWidth: number) {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { field, startX: e.clientX, startWidth: currentWidth };
    function onMouseMove(ev: MouseEvent) {
      const r = resizingRef.current;
      if (!r) return;
      const next = Math.max(40, r.startWidth + (ev.clientX - r.startX));
      setWidths((prev) => ({ ...prev, [r.field]: next }));
    }
    function onMouseUp() {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  async function rememberLayout() {
    setContextMenu(null);
    if (!menuId) return;
    await fetch('/api/grid-layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menuId,
        gridId: gridIdKey,
        widths,
        order: orderedColumns.map((c) => c.dataField),
        stickyColumnCount: stickyCount,
        hiddenColumns: Array.from(hiddenColumns),
        columnAlign: columnAlignOverride,
      }),
    }).catch(() => {});
  }

  async function rememberMasterLayout() {
    setContextMenu(null);
    if (!menuId) return;
    await fetch('/api/grid-layout/master', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menuId,
        gridId: gridIdKey,
        widths,
        order: orderedColumns.map((c) => c.dataField),
        stickyColumnCount: stickyCount,
        hiddenColumns: Array.from(hiddenColumns),
        columnAlign: columnAlignOverride,
      }),
    }).catch(() => {});
  }

  async function resetLayout() {
    setContextMenu(null);
    if (!menuId) return;
    await fetch(`/api/grid-layout?menuId=${encodeURIComponent(menuId)}&gridId=${encodeURIComponent(gridIdKey)}`, {
      method: 'DELETE',
    }).catch(() => {});
    setWidths(defaultWidthsRef.current);
    setOrder(null);
    setStickyCount(stickyColumnCount ?? 0);
    setHiddenColumns(new Set());
    await fetchLayout();
  }

  async function resetMasterLayout() {
    setContextMenu(null);
    if (!menuId) return;
    await fetch(`/api/grid-layout/master?menuId=${encodeURIComponent(menuId)}&gridId=${encodeURIComponent(gridIdKey)}`, {
      method: 'DELETE',
    }).catch(() => {});
    setWidths(defaultWidthsRef.current);
    setOrder(null);
    setStickyCount(stickyColumnCount ?? 0);
    setHiddenColumns(new Set());
    await fetchLayout();
  }

  function startRenameColumn() {
    if (!contextMenu || !menuId) return;
    const current = columnLabels[contextMenu.dataField] ?? visibleColumns[contextMenu.colIndex]?.caption ?? '';
    setRenamingField(contextMenu.dataField);
    setRenameValue(current);
  }

  async function commitRenameColumn() {
    if (!renamingField || !menuId) return;
    const dataField = renamingField;
    const label = renameValue.trim();
    setRenamingField(null);
    setContextMenu(null);
    if (!label) return;
    setColumnLabels((prev) => ({ ...prev, [dataField]: label }));
    await fetch('/api/grid-layout/column-label', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuId, gridId: gridIdKey, dataField, label }),
    }).catch(() => {});
  }

  async function resetColumnLabelToDefault() {
    if (!contextMenu || !menuId) return;
    const dataField = contextMenu.dataField;
    setContextMenu(null);
    setColumnLabels((prev) => {
      const next = { ...prev };
      delete next[dataField];
      return next;
    });
    await fetch(
      `/api/grid-layout/column-label?menuId=${encodeURIComponent(menuId)}&gridId=${encodeURIComponent(gridIdKey)}&dataField=${encodeURIComponent(dataField)}`,
      { method: 'DELETE' }
    ).catch(() => {});
  }

  function setColumnAlign(align: 'left' | 'center' | 'right') {
    if (!contextMenu) return;
    setColumnAlignOverride((prev) => ({ ...prev, [contextMenu.dataField]: align }));
    setContextMenu(null);
  }

  function setStickyUntilHere() {
    if (!contextMenu) return;
    setStickyCount(contextMenu.colIndex + 1);
    setContextMenu(null);
  }

  function hideCurrentColumn() {
    if (!contextMenu || visibleColumns.length <= 1) return;
    setHiddenColumns((prev) => new Set(prev).add(contextMenu.dataField));
    setContextMenu(null);
  }

  function handleGridContextMenu(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, colIndex: -1, dataField: '' });
  }

  function showColumn(field: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
    setContextMenu(null);
  }

  function clearStickyColumns() {
    setStickyCount(0);
    setContextMenu(null);
  }

  function handleColumnDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const currentOrder = orderedColumns.map((c) => c.dataField);
    const oldIndex = currentOrder.indexOf(String(active.id));
    const newIndex = currentOrder.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setOrder(arrayMove(currentOrder, oldIndex, newIndex));
  }

  const columnSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!contextMenu) return;
    function onDocClick() {
      setContextMenu(null);
    }
    window.addEventListener('click', onDocClick);
    window.addEventListener('scroll', onDocClick, true);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', onDocClick, true);
    };
  }, [contextMenu]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const focusedKeyRef = useRef(focusedKey);
  focusedKeyRef.current = focusedKey;
  const rowElsRef = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [rowSnapshot, setRowSnapshot] = useState<GridRow<T> | null>(null);
  const [fieldSnapshot, setFieldSnapshot] = useState<{ key: string; field: string; value: unknown } | null>(null);

  const mergeSpans = useMemo(() => {
    const spans = new Map<string, number>();
    const covered = new Set<string>();
    if (mergeColumns && mergeColumns.length > 0) {
      for (const field of mergeColumns) {
        const isFieldEditing = (row: GridRow<T>) => editing?.key === row.__key && editing.field === field;
        let anchorIdx = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowEligible = row.__status !== 'insert' && !isFieldEditing(row);
          const anchor = anchorIdx !== -1 ? rows[anchorIdx] : null;
          const anchorEligible = !!anchor && anchor.__status !== 'insert' && !isFieldEditing(anchor);
          const sameAsAnchor = anchor && anchorEligible && rowEligible && String(row[field] ?? '') === String(anchor[field] ?? '');
          if (sameAsAnchor) {
            covered.add(`${field}:${row.__key}`);
            const anchorKey = `${field}:${anchor!.__key}`;
            spans.set(anchorKey, (spans.get(anchorKey) ?? 1) + 1);
          } else {
            anchorIdx = i;
            spans.set(`${field}:${row.__key}`, 1);
          }
        }
      }
    }
    return { spans, covered };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mergeColumns, editing]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isActive || !isTabActive) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (!focusedKey) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const idx = rows.findIndex((r) => r.__key === focusedKey);
        if (idx === -1) return;
        const nextRow = rows[e.key === 'ArrowDown' ? idx + 1 : idx - 1];
        if (nextRow) {
          e.preventDefault();
          onFocusedRowChanged?.(nextRow.__key);
          rowElsRef.current.get(nextRow.__key)?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Insert') {
        e.preventDefault();
        onRequestInsertRow?.();
      } else if (e.key === 'Delete') {
        e.preventDefault();
        onRequestDeleteRow?.();
      } else if (e.key === 'Escape') {
        if (editingRowKey) {
          e.preventDefault();
          abandonEditingRow();
        } else if (searchFormRef?.current) {
          e.preventDefault();
          onFocusedRowChanged?.(null);
          searchFormRef.current.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, focusedKey, isActive, isTabActive, onFocusedRowChanged, onRequestInsertRow, onRequestDeleteRow, editingRowKey, searchFormRef]);

  const editableCols = visibleColumns.filter((c) => !!c.cellType);

  function abandonEditingRow() {
    if (!editingRowKey) return;
    const row = rows.find((r) => r.__key === editingRowKey);
    if (row?.__status === 'insert') {
      onCancelNewRow?.(editingRowKey);
    } else if (rowSnapshot) {
      onRevertRow?.(editingRowKey, rowSnapshot);
    }
    setEditing(null);
    setFieldSnapshot(null);
    setEditingRowKey(null);
    setRowSnapshot(null);
  }

  function startEdit(row: GridRow<T>, col: GridColumn<T>) {
    if (!isCellEditable(col, row)) return;
    if (editingRowKey && editingRowKey !== row.__key) {
      abandonEditingRow();
    }
    const alreadyEditingThisCell = editing?.key === row.__key && editing.field === col.dataField;
    if (editing && !alreadyEditingThisCell) {
      const prevCol = columns.find((c) => c.dataField === editing.field);
      if (prevCol?.cellType !== 'check') {
        const prevRow = rows.find((r) => r.__key === editing.key);
        if (prevRow) onCellChange(prevRow.__key, editing.field as keyof T, editValue);
      }
    }
    if (editingRowKey !== row.__key) {
      setEditingRowKey(row.__key);
      setRowSnapshot(row);
    }
    if (!alreadyEditingThisCell) {
      setFieldSnapshot({ key: row.__key, field: col.dataField, value: row[col.dataField] });
    }
    setEditing({ key: row.__key, field: col.dataField });
    setEditValue(String(row[col.dataField] ?? ''));
  }

  useImperativeHandle(ref, () => ({
    focusFirstEditable: (key: string) => {
      if (editingRowKey && editingRowKey !== key) abandonEditingRow();
      const row = rows.find((r) => r.__key === key);
      if (!row) return;
      const firstEditable = visibleColumns.find((c) => c.cellType !== 'check' && isCellEditable(c, row));
      if (firstEditable) requestAnimationFrame(() => startEdit(row, firstEditable));
    },
    startEditField: (key: string, field: string) => {
      if (editingRowKey && editingRowKey !== key) abandonEditingRow();
      requestAnimationFrame(() => {
        const row = rowsRef.current.find((r) => r.__key === key);
        const col = columns.find((c) => c.dataField === field);
        if (!row || !col) return;
        startEdit(row, col);
      });
    },
    closeEditing: () => {
      setEditing(null);
      setEditingRowKey(null);
      setRowSnapshot(null);
      setFieldSnapshot(null);
    },
    scrollToFocused: () => {
      requestAnimationFrame(() => {
        const key = focusedKeyRef.current;
        if (!key) return;
        rowElsRef.current.get(key)?.scrollIntoView({ block: 'center' });
      });
    },
    rememberLayout,
    resetLayout,
    rememberMasterLayout,
    resetMasterLayout,
    isMaster,
  }));

  function moveFocus(row: GridRow<T>, col: GridColumn<T>, moveTo: 'next' | 'prev' | null) {
    setEditing(null);
    if (!moveTo) return;
    const colIdx = editableCols.findIndex((c) => c.dataField === col.dataField);
    if (colIdx === -1) return;

    if (moveTo === 'next') {
      const nextCol = editableCols[colIdx + 1];
      if (nextCol) startEdit(row, nextCol);
      return;
    }

    if (moveTo === 'prev') {
      const prevCol = editableCols[colIdx - 1];
      if (prevCol) startEdit(row, prevCol);
    }
  }

  function commitAndMove(row: GridRow<T>, col: GridColumn<T>, value: unknown, moveTo: 'next' | 'prev' | null) {
    onCellChange(row.__key, col.dataField, value);
    moveFocus(row, col, moveTo);
  }

  function handleEscape(row: GridRow<T>, col: GridColumn<T>) {
    if (row.__status === 'insert') {
      setEditing(null);
      setFieldSnapshot(null);
      setEditingRowKey(null);
      setRowSnapshot(null);
      onCancelNewRow?.(row.__key);
      return;
    }
    if (fieldSnapshot && fieldSnapshot.key === row.__key && fieldSnapshot.field === col.dataField) {
      onCellChange(row.__key, col.dataField, fieldSnapshot.value);
    }
    setEditing(null);
    setFieldSnapshot(null);
    setEditingRowKey(null);
    setRowSnapshot(null);
  }

  function handleEnterKey(row: GridRow<T>, col: GridColumn<T>) {
    const colIdx = editableCols.findIndex((c) => c.dataField === col.dataField);
    const nextCol = editableCols[colIdx + 1];
    if (nextCol) {
      commitAndMove(row, col, editValue, 'next');
    } else {
      onCellChange(row.__key, col.dataField, editValue);
      setEditing(null);
      requestAnimationFrame(() => onRequestSave?.());
    }
  }

  function handleCheckEnterKey(row: GridRow<T>, col: GridColumn<T>) {
    const colIdx = editableCols.findIndex((c) => c.dataField === col.dataField);
    const nextCol = editableCols[colIdx + 1];
    if (nextCol) {
      moveFocus(row, col, 'next');
    } else {
      setEditing(null);
      requestAnimationFrame(() => onRequestSave?.());
    }
  }

  function handleF2Key(row: GridRow<T>, col: GridColumn<T>) {
    const rowIdx = rows.findIndex((r) => r.__key === row.__key);
    if (rowIdx <= 0) return;
    const aboveValue = rows[rowIdx - 1][col.dataField];
    setEditValue(String(aboveValue ?? ''));
    onCellChange(row.__key, col.dataField, aboveValue);
  }

  const editorClass = 'w-full h-full min-w-0 bg-transparent text-xs outline-none ring-2 ring-inset ring-primary rounded-sm px-2';

  function renderCell(row: GridRow<T>, col: GridColumn<T>) {
    const value = row[col.dataField];
    const isEditing = editing?.key === row.__key && editing.field === col.dataField;

    if (isEditing && col.cellType === 'select') {
      return (
        <select
          autoFocus
          value={editValue}
          onChange={(e) => {
            const next = e.target.value;
            setEditValue(next);
            onCellChange(row.__key, col.dataField, next);
          }}
          onBlur={() => commitAndMove(row, col, editValue, null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleEnterKey(row, col);
            } else if (e.key === 'Tab') {
              e.preventDefault();
              commitAndMove(row, col, editValue, e.shiftKey ? 'prev' : 'next');
            } else if (e.key === 'Escape') {
              handleEscape(row, col);
            } else if (e.key === 'F2') {
              e.preventDefault();
              handleF2Key(row, col);
            }
          }}
          className={editorClass}
        >
          <option value="">(없음)</option>
          {col.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    if (isEditing && col.cellType === 'check') {
      const onValue = col.checkValues?.on ?? 'Y';
      const offValue = col.checkValues?.off ?? 'N';
      const checked = value === onValue;
      const toggle = () => onCellChange(row.__key, col.dataField, checked ? offValue : onValue);
      const display =
        col.checkDisplay === 'checkbox' ? (
          <input
            type="checkbox"
            readOnly
            tabIndex={-1}
            checked={checked}
            className="w-3.5 h-3.5 rounded accent-primary pointer-events-none ring-2 ring-inset ring-gray-400"
          />
        ) : (
          <span
            className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium select-none ring-2 ring-inset ring-gray-400 ${
              checked ? col.checkColorClass ?? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {checked ? (col.checkLabels?.on ?? '사용함') : (col.checkLabels?.off ?? '미사용')}
          </span>
        );
      return (
        <div
          ref={(el) => el?.focus()}
          tabIndex={0}
          role="switch"
          aria-checked={checked}
          className="w-full h-full flex items-center outline-none cursor-pointer"
          onBlur={() => setEditing(null)}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.preventDefault();
              e.stopPropagation();
              toggle();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              handleCheckEnterKey(row, col);
            } else if (e.key === 'Tab') {
              e.preventDefault();
              moveFocus(row, col, e.shiftKey ? 'prev' : 'next');
            } else if (e.key === 'Escape') {
              handleEscape(row, col);
            } else if (e.key === 'F2') {
              e.preventDefault();
              handleF2Key(row, col);
            }
          }}
        >
          {display}
        </div>
      );
    }

    if (isEditing && (col.cellType === 'date' || col.cellType === 'time')) {
      const inputValue = col.cellType === 'date'
        ? editValue.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
        : editValue;
      return (
        <input
          autoFocus
          type={col.cellType}
          value={inputValue}
          onChange={(e) => {
            const raw = e.target.value;
            const stored = col.cellType === 'date' ? raw.replace(/-/g, '') : raw;
            setEditValue(stored);
            onCellChange(row.__key, col.dataField, stored);
          }}
          onBlur={() => commitAndMove(row, col, editValue, null)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') { e.preventDefault(); commitAndMove(row, col, editValue, e.shiftKey ? 'prev' : 'next'); }
            else if (e.key === 'Escape') handleEscape(row, col);
            else if (e.key === 'Enter') { e.preventDefault(); handleEnterKey(row, col); }
          }}
          className={editorClass}
        />
      );
    }

    if (isEditing) {
      const input = (
        <input
          autoFocus
          type={col.cellType === 'password' ? 'password' : 'text'}
          placeholder={col.placeholder}
          value={editValue}
          onChange={(e) => {
            const raw = e.target.value;
            if (col.maxLength && byteLength(raw) > col.maxLength) return;
            if (col.maxChars && [...raw].length > col.maxChars) {
              onCellValidationError?.(col.dataField, `'${col.caption}'은(는) ${col.maxChars}글자 이내로 작성해주세요.`);
              return;
            }
            const next = col.transform ? col.transform(raw) : raw;
            setEditValue(next);
            onCellChange(row.__key, col.dataField, next);
          }}
          onFocus={(e) => e.target.select()}
          onBlur={() => commitAndMove(row, col, editValue, null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleEnterKey(row, col);
            } else if (e.key === 'Tab') {
              e.preventDefault();
              commitAndMove(row, col, editValue, e.shiftKey ? 'prev' : 'next');
            } else if (e.key === 'Escape') {
              handleEscape(row, col);
            } else if (e.key === 'F2') {
              e.preventDefault();
              handleF2Key(row, col);
            } else if (e.key === ' ' && col.cellType === 'help') {
              e.preventDefault();
              onOpenHelpPicker?.(row, col);
            }
          }}
          className={col.cellType === 'help' ? `${editorClass} pr-7` : editorClass}
        />
      );
      if (col.cellType !== 'help') return input;
      return (
        <div className="relative w-full h-full">
          {input}
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onOpenHelpPicker?.(row, col)}
            title="찾아보기"
            className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    if (col.render) return col.render(value as T[keyof T], row);
    if (col.cellType === 'date') {
      const s = String(value ?? '');
      const d = s.replace(/-/g, '');
      return <span>{d.length === 8 ? `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}` : s}</span>;
    }
    if (col.cellType === 'check') {
      const onValue = col.checkValues?.on ?? 'Y';
      const checked = value === onValue;
      if (col.checkDisplay === 'checkbox') {
        return (
          <input
            type="checkbox"
            readOnly
            checked={checked}
            disabled={!isCellEditable(col, row)}
            className="w-3.5 h-3.5 rounded accent-primary pointer-events-none disabled:opacity-50"
          />
        );
      }
      const onLabel = col.checkLabels?.on ?? '사용함';
      const offLabel = col.checkLabels?.off ?? '미사용';
      return (
        <span
          className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium select-none ${
            checked ? col.checkColorClass ?? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {checked ? onLabel : offLabel}
        </span>
      );
    }
    if (col.cellType === 'select' && col.options) {
      const opt = col.options.find((o) => o.value === value);
      return <span className="whitespace-nowrap">{opt?.label ?? String(value ?? '')}</span>;
    }
    if (col.cellType === 'password') {
      if (value) {
        return (
          <input
            type="password"
            readOnly
            tabIndex={-1}
            value={String(value)}
            className="w-24 bg-transparent border-none text-muted-foreground pointer-events-none focus:outline-none"
          />
        );
      }
      if (row.__status !== 'insert') {
        return <span className="text-muted-foreground tracking-widest select-none">••••••••</span>;
      }
      return <span />;
    }
    return <span className="whitespace-nowrap">{value === null || value === undefined ? '' : String(value)}</span>;
  }

  const hiddenColumnList = orderedColumns.filter((c) => hiddenColumns.has(c.dataField));

  return (
    <div className="border border-border rounded overflow-auto flex-1 min-h-0" onContextMenu={handleGridContextMenu}>
      <DndContext sensors={columnSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd} modifiers={[restrictToHorizontalAxis]}>
        <table
          className={`text-xs border-separate ${layoutFixed ? '' : 'w-full'}`}
          style={{
            borderSpacing: 0,
            tableLayout: layoutFixed ? 'fixed' : 'auto',
            ...(layoutFixed ? { width: 'auto' } : undefined),
          }}
        >
          <thead>
            <tr ref={headerRowRef} className="bg-muted divide-x divide-border">
              {selection && (
                <th className="w-8 px-3 py-2.5 sticky top-0 left-0 bg-muted z-20 border-b border-border">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                    checked={selection.allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !selection.allSelected && selection.someSelected;
                    }}
                    onChange={selection.onToggleAll}
                  />
                </th>
              )}
              <SortableContext items={visibleColumns.map((c) => c.dataField)} strategy={horizontalListSortingStrategy}>
                {visibleColumns.map((col, colIndex) => {
                  const isEditableCol = !!col.cellType;
                  const stickyLeft = stickyLefts[col.dataField];
                  const width = widths[col.dataField];
                  const isLastSticky = colIndex === stickyUntilIndex;
                  const isVeryLastCol = colIndex === visibleColumns.length - 1;
                  return (
                    <SortableColumnHeader
                      key={col.dataField}
                      col={col}
                      displayCaption={columnLabels[col.dataField] ?? col.caption}
                      stickyLeft={stickyLeft}
                      width={width}
                      layoutFixed={layoutFixed}
                      isEditableCol={isEditableCol}
                      isLastSticky={isLastSticky}
                      isVeryLastCol={isVeryLastCol}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, colIndex, dataField: col.dataField });
                      }}
                      onResizeStart={startResize}
                    />
                  );
                })}
              </SortableContext>
            </tr>
          </thead>
          <tbody>
          {loading && (
            <tr>
              <td colSpan={visibleColumns.length + (selection ? 1 : 0)} className="text-center py-10 text-muted-foreground">
                불러오는 중...
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={visibleColumns.length + (selection ? 1 : 0)} className="text-center py-10 text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row, idx) => {
              const isFocused = focusedKey === row.__key;
              const zebra = idx % 2 === 1;
              return (
                <tr
                  key={row.__key}
                  ref={(el) => {
                    if (el) rowElsRef.current.set(row.__key, el);
                    else rowElsRef.current.delete(row.__key);
                  }}
                  onClick={() => onFocusedRowChanged?.(row.__key)}
                  className="cursor-pointer divide-x divide-border scroll-mt-10"
                >
                  {selection && (
                    <td
                      className={`px-3 py-2 sticky left-0 z-10 border-b border-border ${cellBgClass(row.__status, isFocused, zebra, false, focusRowColorClass, getRowAccentClass?.(row))}`}
                      style={{ willChange: 'transform' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        selection.onToggleRow(row.__key);
                      }}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                        checked={selection.selectedKeys.has(row.__key)}
                      />
                    </td>
                  )}
                  {visibleColumns.map((col, colIndex) => {
                    const isMergeCol = !!mergeColumns?.includes(col.dataField);
                    if (isMergeCol && mergeSpans.covered.has(`${col.dataField}:${row.__key}`)) {
                      return null;
                    }
                    const mergeRowSpan = isMergeCol ? mergeSpans.spans.get(`${col.dataField}:${row.__key}`) : undefined;
                    const editable = isCellEditable(col, row);
                    const isEditing = editing?.key === row.__key && editing.field === col.dataField;
                    const stickyLeft = stickyLefts[col.dataField];
                    const width = widths[col.dataField];
                    const isLastSticky = colIndex === stickyUntilIndex;
                    const isVeryLastCol = colIndex === visibleColumns.length - 1;
                    return (
                      <td
                        key={col.dataField}
                        rowSpan={mergeRowSpan && mergeRowSpan > 1 ? mergeRowSpan : undefined}
                        style={{
                          ...(mergeRowSpan && mergeRowSpan > 1 ? { verticalAlign: 'middle' } : undefined),
                          ...(stickyLeft !== undefined ? { left: stickyLeft, willChange: 'transform' } : undefined),
                          ...(layoutFixed && width ? { width, minWidth: width, maxWidth: width } : undefined),
                          ...(isLastSticky || isVeryLastCol ? { boxShadow: '1px 0 0 0 hsl(var(--border))' } : undefined),
                        }}
                        onClick={(e) => {
                          if (editingRowKey && editingRowKey !== row.__key) abandonEditingRow();
                          onFocusedRowChanged?.(row.__key);
                          if (!editable) return;
                          e.stopPropagation();
                          if (col.cellType === 'date' && onDateCellEdit) {
                            if (editing && editing.key === row.__key && editing.field !== col.dataField) {
                              const prevCol = columns.find((pc) => pc.dataField === editing.field);
                              if (prevCol?.cellType !== 'check') {
                                const prevRow = rows.find((pr) => pr.__key === editing.key);
                                if (prevRow) onCellChange(prevRow.__key, editing.field as keyof T, editValue);
                              }
                              setEditing(null);
                              setEditingRowKey(null);
                            }
                            onDateCellEdit(row.__key, col.dataField, String(row[col.dataField] ?? ''));
                          }
                        }}
                        onDoubleClick={(e) => {
                          if (!editable) return;
                          e.stopPropagation();
                          if (col.cellType === 'date' && onDateCellEdit) {
                            onDateCellEdit(row.__key, col.dataField, String(row[col.dataField] ?? ''));
                            return;
                          }
                          startEdit(row, col);
                        }}
                        className={`p-0 border-b border-border ${
                          editable ? (col.cellType === 'check' ? 'cursor-pointer' : 'cursor-text') : 'text-muted-foreground'
                        } ${
                          stickyLeft !== undefined ? 'sticky z-10' : ''
                        } ${
                          isMergeCol
                            ? cellBgClass('unchanged', false, zebra, false, focusRowColorClass, getRowAccentClass?.(row))
                            : cellBgClass(
                                row.__status,
                                isFocused,
                                zebra,
                                editable,
                                focusRowColorClass,
                                getRowAccentClass?.(row)
                              )
                        } ${
                          isFocused && !isMergeCol ? `ring-2 ring-inset ${focusBorderColorClass}` : ''
                        }`}
                      >
                        <div
                          className={`${CELL_HEIGHT} flex items-center min-w-0 ${
                            layoutFixed || col.fixedWidth
                              ? `truncate ${!layoutFixed ? col.widthClass ?? 'max-w-xs' : ''}`
                              : 'whitespace-nowrap'
                          } ${alignClass(columnAlignOverride[col.dataField] ?? col.align)} ${
                            isEditing && col.cellType !== 'check'
                              ? ''
                              : `px-3 ${editable && col.cellType !== 'check' ? 'hover:ring-2 hover:ring-inset hover:ring-ring/40' : ''}`
                          } ${getRowTextClass?.(row) ?? ''}`}
                          title={
                            (layoutFixed || col.fixedWidth) && !isEditing && typeof row[col.dataField] === 'string'
                              ? (row[col.dataField] as string)
                              : undefined
                          }
                        >
                          {renderCell(row, col)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </DndContext>
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded shadow-md py-1 text-xs min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={rememberLayout} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors">
            형태 기억
          </button>
          <button onClick={resetLayout} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors">
            원래 형태로
          </button>
          {isMaster && (
            <button onClick={rememberMasterLayout} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors">
              (마스터)형태 기억
            </button>
          )}
          {isMaster && (
            <button onClick={resetMasterLayout} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors">
              (마스터)원래 형태로
            </button>
          )}
          {contextMenu.dataField && isMaster && (
            <>
              <div className="my-1 border-t border-border" />
              {renamingField === contextMenu.dataField ? (
                <div className="px-3 py-1.5 flex items-center gap-1">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitRenameColumn(); }
                      else if (e.key === 'Escape') { e.preventDefault(); setRenamingField(null); }
                    }}
                    className="w-28 px-1.5 py-0.5 text-xs border border-border rounded bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button onClick={commitRenameColumn} className="p-1 text-primary hover:bg-accent rounded shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button onClick={startRenameColumn} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors">
                  헤더 이름 바꾸기
                </button>
              )}
              {columnLabels[contextMenu.dataField] && (
                <button onClick={resetColumnLabelToDefault} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors">
                  헤더 이름 원래대로
                </button>
              )}
            </>
          )}
          {contextMenu.dataField && (
            <>
              <div className="my-1 border-t border-border" />
              <button onClick={setStickyUntilHere} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors">
                여기까지 스크롤 고정
              </button>
              <button onClick={clearStickyColumns} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors">
                스크롤 고정 해제
              </button>
              <div className="my-1 border-t border-border" />
              <button onClick={() => setColumnAlign('left')} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center justify-between">
                왼쪽 정렬
                {(columnAlignOverride[contextMenu.dataField] ?? visibleColumns[contextMenu.colIndex]?.align ?? 'left') === 'left' && <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setColumnAlign('center')} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center justify-between">
                가운데 정렬
                {(columnAlignOverride[contextMenu.dataField] ?? visibleColumns[contextMenu.colIndex]?.align ?? 'left') === 'center' && <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setColumnAlign('right')} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center justify-between">
                오른쪽 정렬
                {(columnAlignOverride[contextMenu.dataField] ?? visibleColumns[contextMenu.colIndex]?.align ?? 'left') === 'right' && <Check className="w-3.5 h-3.5" />}
              </button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={hideCurrentColumn}
                disabled={visibleColumns.length <= 1}
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                이 열 숨기기
              </button>
            </>
          )}
          {hiddenColumnList.length > 0 && (
            <>
              <div className="my-1 border-t border-border" />
              {hiddenColumnList.map((col) => (
                <button key={col.dataField} onClick={() => showColumn(col.dataField)} className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors">
                  {col.caption} 표시
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const DataGrid = forwardRef(DataGridInner) as <T extends Record<string, unknown>>(
  props: DataGridProps<T> & { ref?: React.ForwardedRef<DataGridHandle> }
) => ReturnType<typeof DataGridInner>;
