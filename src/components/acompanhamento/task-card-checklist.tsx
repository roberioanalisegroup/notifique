"use client";

import type { AlvaraTaskChecklistRow } from "@/types";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  MessageSquare,
  Paperclip,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/* ── Completion Popover ── */
function ChecklistCompletionPopover({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: (comment: string, attachmentUrl: string) => void;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [showAttachment, setShowAttachment] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="mt-1.5 rounded-xl border border-blue-200 bg-white p-3 shadow-lg shadow-blue-100/40 animate-in fade-in slide-in-from-top-1 duration-150 dark:border-blue-800 dark:bg-slate-900 dark:shadow-blue-950/30"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-[0.7rem] font-semibold text-slate-700 dark:text-slate-300">
        Concluir: <span className="text-blue-600">{label}</span>
      </p>

      <textarea
        ref={inputRef}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[0.75rem] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
        rows={2}
        placeholder="Comentário (opcional)..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
      />

      {!showAttachment ? (
        <button
          type="button"
          className="mt-1.5 flex items-center gap-1 text-[0.65rem] text-slate-400 hover:text-blue-500 transition-colors dark:text-slate-500 dark:hover:text-blue-400"
          onClick={() => setShowAttachment(true)}
        >
          <Paperclip className="h-3 w-3" />
          Adicionar link de anexo
        </button>
      ) : (
        <div className="mt-1.5">
          <input
            type="url"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[0.7rem] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
            placeholder="https://drive.google.com/..."
            value={attachmentUrl}
            onChange={(e) => setAttachmentUrl(e.target.value)}
          />
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-lg px-2.5 py-1 text-[0.7rem] font-medium text-slate-500 hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-3 py-1 text-[0.7rem] font-medium text-white shadow-sm hover:bg-blue-500 transition-colors"
          onClick={() => onConfirm(comment.trim(), attachmentUrl.trim())}
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}

/* ── Detail Popover (show comment/attachment on completed items) ── */
function ChecklistDetailBadge({
  row,
}: {
  row: AlvaraTaskChecklistRow;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasComment = Boolean(row.comment);
  const hasAttach = Boolean(row.attachment_url);
  if (!row.completed || (!hasComment && !hasAttach && !row.completed_at)) return null;

  const completedDate = row.completed_at
    ? new Date(row.completed_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="ml-6 mt-0.5">
      <button
        type="button"
        className="flex items-center gap-1 text-[0.6rem] text-slate-400 hover:text-slate-600 transition-colors dark:hover:text-slate-300"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
      >
        {completedDate && (
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {completedDate}
          </span>
        )}
        {hasComment && <MessageSquare className="h-2.5 w-2.5" />}
        {hasAttach && <Paperclip className="h-2.5 w-2.5" />}
        {(hasComment || hasAttach) && (
          expanded
            ? <ChevronUp className="h-2.5 w-2.5" />
            : <ChevronDown className="h-2.5 w-2.5" />
        )}
      </button>

      {expanded && (hasComment || hasAttach) && (
        <div className="mt-1 space-y-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[0.65rem] text-slate-600 animate-in fade-in duration-150 dark:bg-slate-800/80 dark:text-slate-300">
          {hasComment && (
            <p className="flex items-start gap-1">
              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-blue-400" />
              <span>{row.comment}</span>
            </p>
          )}
          {hasAttach && (
            <p className="flex items-start gap-1">
              <Paperclip className="mt-0.5 h-3 w-3 shrink-0 text-blue-400" />
              <a
                href={row.attachment_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-700 break-all dark:text-blue-400 dark:hover:text-blue-300"
                onClick={(e) => e.stopPropagation()}
              >
                Ver anexo
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */
export function TaskCardChecklist({
  idPrefix,
  items,
  readOnly,
  onToggle,
}: {
  /** Evita ids duplicados no DOM quando vários cartões partilham os mesmos item_id. */
  idPrefix: string;
  items: AlvaraTaskChecklistRow[];
  readOnly: boolean;
  onToggle: (itemId: string, completed: boolean, comment?: string, attachmentUrl?: string) => void;
}) {
  if (!items.length) return null;

  const done = items.filter((i) => i.completed).length;
  const pct = Math.round((done / items.length) * 100);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  const handleCheck = useCallback(
    (itemId: string, currentlyCompleted: boolean) => {
      if (currentlyCompleted) {
        // Unchecking: no popover needed
        onToggle(itemId, false);
      } else {
        // Checking: show popover for comment/attachment
        setPendingItemId(itemId);
      }
    },
    [onToggle]
  );

  const handleConfirm = useCallback(
    (itemId: string, comment: string, attachmentUrl: string) => {
      onToggle(itemId, true, comment || undefined, attachmentUrl || undefined);
      setPendingItemId(null);
    },
    [onToggle]
  );

  return (
    <div
      className="mt-2.5 rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50/80 to-white px-3 py-2.5 dark:border-slate-600/80 dark:from-slate-800/60 dark:to-slate-900/80"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with progress */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Etapas
        </p>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold tabular-nums",
              done === items.length
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            )}
          >
            {done}/{items.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={cn(
            "h-1 rounded-full transition-all duration-500 ease-out",
            done === items.length
              ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
              : "bg-gradient-to-r from-blue-400 to-blue-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Items */}
      <ul className="space-y-1">
        {items.map((row) => (
          <li key={row.item_id}>
            <div className="group flex items-start gap-2">
              <button
                type="button"
                id={`chk-${idPrefix}-${row.item_id}`}
                disabled={readOnly}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCheck(row.item_id, row.completed);
                }}
                className={cn(
                  "mt-0.5 shrink-0 transition-colors duration-200",
                  readOnly && "cursor-not-allowed opacity-60",
                  !readOnly && "cursor-pointer"
                )}
                aria-label={row.completed ? "Desmarcar etapa" : "Marcar etapa como concluída"}
              >
                {row.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors dark:text-slate-600" />
                )}
              </button>
              <label
                htmlFor={`chk-${idPrefix}-${row.item_id}`}
                className={cn(
                  "min-w-0 flex-1 text-[0.7rem] leading-snug transition-all duration-200",
                  row.completed
                    ? "text-slate-400 line-through decoration-slate-300 dark:text-slate-500 dark:decoration-slate-600"
                    : "text-slate-700 dark:text-slate-200",
                  readOnly ? "cursor-default" : "cursor-pointer"
                )}
              >
                {row.label}
              </label>
            </div>

            {/* Detail badges for completed items */}
            <ChecklistDetailBadge row={row} />

            {/* Completion popover */}
            {pendingItemId === row.item_id && !readOnly && (
              <ChecklistCompletionPopover
                label={row.label}
                onConfirm={(comment, attachmentUrl) =>
                  handleConfirm(row.item_id, comment, attachmentUrl)
                }
                onCancel={() => setPendingItemId(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
