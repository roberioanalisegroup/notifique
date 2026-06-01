"use client";

import { AccessibleModal } from "@/components/ui/accessible-modal";
import { apiJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AlvaraChecklistTemplate } from "@/types";
import { BookmarkPlus, Copy, FileStack, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Props = {
  alvaraId: string;
  alvaraLabel: string;
  currentItemCount: number;
  onApplied: () => void;
};

export function ChecklistTemplatesPanel({
  alvaraId,
  alvaraLabel,
  currentItemCount,
  onApplied,
}: Props) {
  const [templates, setTemplates] = useState<AlvaraChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyTemplate, setApplyTemplate] = useState<AlvaraChecklistTemplate | null>(null);
  const [applyMode, setApplyMode] = useState<"append" | "replace">("append");
  const [applying, setApplying] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTemplate, setDeleteTemplate] = useState<AlvaraChecklistTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiJson<{ templates: AlvaraChecklistTemplate[] }>("/api/checklist-templates");
      setTemplates(d.templates ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar templates");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  async function saveFromCurrent() {
    const name = saveName.trim();
    if (!name || !alvaraId) return;
    if (currentItemCount === 0) {
      toast.error("Este tipo ainda não tem etapas para guardar");
      return;
    }
    setSaving(true);
    try {
      await apiJson("/api/checklist-templates", {
        method: "POST",
        body: JSON.stringify({ name, alvara_id: alvaraId }),
      });
      toast.success("Template guardado");
      setSaveOpen(false);
      setSaveName("");
      void loadTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  }

  async function confirmApply() {
    if (!applyTemplate || !alvaraId) return;
    setApplying(true);
    try {
      const d = await apiJson<{ created_count: number }>(
        "/api/alvaras/" + alvaraId + "/checklist/apply-template",
        {
          method: "POST",
          body: JSON.stringify({
            template_id: applyTemplate.id,
            mode: applyMode,
          }),
        }
      );
      toast.success(
        applyMode === "replace"
          ? `Checklist substituída (${d.created_count} etapas)`
          : `${d.created_count} etapa(s) adicionada(s)`
      );
      setApplyOpen(false);
      setApplyTemplate(null);
      onApplied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aplicar");
    } finally {
      setApplying(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTemplate) return;
    setDeleting(true);
    try {
      await apiJson("/api/checklist-templates/" + deleteTemplate.id, { method: "DELETE" });
      toast.success("Template removido");
      setDeleteOpen(false);
      setDeleteTemplate(null);
      void loadTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="card-portal overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <FileStack className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Templates de checklist</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Guarde modelos seus e aplique noutros tipos de alvará
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary shrink-0 gap-2 text-sm"
              disabled={!alvaraId || currentItemCount === 0}
              title={
                currentItemCount === 0
                  ? "Adicione etapas antes de guardar um template"
                  : "Guardar etapas atuais como template"
              }
              onClick={() => {
                setSaveName(alvaraLabel ? `Checklist — ${alvaraLabel.split(" · ")[0]}` : "");
                setSaveOpen(true);
              }}
            >
              <BookmarkPlus className="h-4 w-4" />
              Guardar atual
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              A carregar templates…
            </div>
          ) : templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Ainda não tem templates. Defina etapas num tipo e use &quot;Guardar atual&quot;, ou crie
              etapas noutro tipo e guarde o modelo.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{t.name}</p>
                    <p className="text-xs text-slate-500">
                      {t.item_count ?? 0} {(t.item_count ?? 0) === 1 ? "etapa" : "etapas"}
                      {t.description ? ` · ${t.description}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="btn-primary gap-1.5 !px-3 !py-1.5 text-xs"
                      disabled={!alvaraId}
                      onClick={() => {
                        setApplyTemplate(t);
                        setApplyMode(currentItemCount > 0 ? "append" : "replace");
                        setApplyOpen(true);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Aplicar
                    </button>
                    <button
                      type="button"
                      title="Remover template"
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => {
                        setDeleteTemplate(t);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AccessibleModal
        open={saveOpen}
        onClose={() => !saving && setSaveOpen(false)}
        labelledBy="save-template-title"
        panelClassName="modal-panel w-full max-w-md p-0"
      >
        <div className="p-6">
          <h3 id="save-template-title" className="text-lg font-semibold text-slate-900">
            Guardar checklist como template
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Serão guardadas as {currentItemCount} etapa(s) de <strong>{alvaraLabel}</strong>.
          </p>
          <label className="form-label mt-4 block" htmlFor="template-name">
            Nome do template
          </label>
          <input
            id="template-name"
            className="input-field mt-1.5 w-full"
            value={saveName}
            maxLength={200}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveFromCurrent();
            }}
            autoFocus
          />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => setSaveOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saving || !saveName.trim()}
              onClick={() => void saveFromCurrent()}
            >
              {saving ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </div>
      </AccessibleModal>

      <AccessibleModal
        open={applyOpen}
        onClose={() => !applying && setApplyOpen(false)}
        labelledBy="apply-template-title"
        panelClassName="modal-panel w-full max-w-md p-0"
      >
        <div className="p-6">
          <h3 id="apply-template-title" className="text-lg font-semibold text-slate-900">
            Aplicar template
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            <strong>{applyTemplate?.name}</strong> → {alvaraLabel}
          </p>

          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">Modo de aplicação</legend>
            <label
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                applyMode === "append"
                  ? "border-blue-300 bg-blue-50/60"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              <input
                type="radio"
                name="apply-mode"
                className="mt-1"
                checked={applyMode === "append"}
                onChange={() => setApplyMode("append")}
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Acrescentar</span>
                <span className="text-xs text-slate-500">
                  Mantém as {currentItemCount} etapa(s) atuais e adiciona as do template no fim.
                </span>
              </span>
            </label>
            <label
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                applyMode === "replace"
                  ? "border-amber-300 bg-amber-50/60"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              <input
                type="radio"
                name="apply-mode"
                className="mt-1"
                checked={applyMode === "replace"}
                onChange={() => setApplyMode("replace")}
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Substituir tudo</span>
                <span className="text-xs text-slate-500">
                  Remove todas as etapas atuais e o progresso nas tarefas deixa de contar essas
                  linhas.
                </span>
              </span>
            </label>
          </fieldset>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" disabled={applying} onClick={() => setApplyOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" disabled={applying} onClick={() => void confirmApply()}>
              {applying ? "A aplicar…" : "Aplicar"}
            </button>
          </div>
        </div>
      </AccessibleModal>

      <AccessibleModal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        labelledBy="delete-template-title"
        panelClassName="modal-panel w-full max-w-md p-0"
      >
        <div className="p-6">
          <h3 id="delete-template-title" className="text-lg font-semibold text-slate-900">
            Remover template?
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            O template <strong>{deleteTemplate?.name}</strong> será eliminado. Os tipos de alvará já
            configurados não são alterados.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "A remover…" : "Remover"}
            </button>
          </div>
        </div>
      </AccessibleModal>
    </>
  );
}
