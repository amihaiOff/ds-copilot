// The docked inspector (spec §10): tabs Overview / Data / Code / Assets /
// Decisions for the selected step. Read-only throughout. Data it can show is
// whatever the companion server projects (step frontmatter + goal body, the
// referenced dataset, code_ref provenance) plus any decisions on the wire; asset
// contents and code file bodies are not served yet, so those tabs degrade to an
// explanatory empty state rather than inventing data.
import { useEffect, useState } from "react";
import type { LogicNode, DatasetDag, DatasetNode } from "@shared/dag";
import type { DecisionRecord } from "../state/projection";
import { AssetView, type AssetRef } from "./AssetView";

const TABS = ["overview", "data", "code", "assets", "decisions"] as const;
type Tab = (typeof TABS)[number];

function refToIds(ref: string | string[] | null): string[] {
  if (ref === null) return [];
  return Array.isArray(ref) ? ref : [ref];
}

export interface InspectorProps {
  step: LogicNode | null;
  datasets: DatasetDag;
  /** All decisions; the inspector filters to those touching this step. */
  decisions: DecisionRecord[];
  /** Assets attached to the step (empty until the server serves them). */
  assets?: AssetRef[];
  onSelectStep: (id: string) => void;
  onSelectDecision: (id: string) => void;
}

function EmptyNote({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="empty-note">{children}</div>;
}

export function Inspector({
  step,
  datasets,
  decisions,
  assets = [],
  onSelectStep,
  onSelectDecision,
}: InspectorProps): JSX.Element {
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => setTab("overview"), [step?.id]);

  if (!step) {
    return (
      <aside className="inspector">
        <div className="inspector-empty">
          Select a step in the DAG to inspect its goal, data, code, assets and
          decisions.
        </div>
      </aside>
    );
  }

  const stepDecisions = decisions.filter(
    (d) => d.step_id === step.id || d.supporting_steps.includes(step.id),
  );
  const datasetNodes: DatasetNode[] = refToIds(step.dataset_ref)
    .map((id) => datasets.byId.get(id))
    .filter((d): d is DatasetNode => d !== undefined);
  const counts: Partial<Record<Tab, number>> = {
    assets: assets.length,
    decisions: stepDecisions.length,
  };

  return (
    <aside className="inspector">
      <div className="kind">{step.kind.toUpperCase()}</div>
      <h2 className="inspector-title">{step.title}</h2>
      <div className={`status-line st-${step.status}`}>{step.status}</div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`tab ${tab === t ? "on" : ""}`}
            onClick={() => setTab(t)}
          >
            {t[0]!.toUpperCase() + t.slice(1)}
            {counts[t] ? ` (${counts[t]})` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div>
          <div className="section-h">Goal / brief</div>
          <div className="card">{step.goal || <EmptyNote>No goal recorded.</EmptyNote>}</div>
          {step.builds_on.length > 0 ? (
            <>
              <div className="section-h">Builds on</div>
              <div className="chip-row">
                {step.builds_on.map((p) => (
                  <button
                    key={p}
                    className="chip"
                    onClick={() => onSelectStep(p)}
                  >
                    ▸ {p}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <div className="section-h">Created</div>
          <div className="card">{step.created}</div>
        </div>
      ) : null}

      {tab === "data" ? (
        <div>
          <div className="section-h">Dataset</div>
          {datasetNodes.length === 0 ? (
            <EmptyNote>No dataset referenced by this step.</EmptyNote>
          ) : (
            datasetNodes.map((ds) => (
              <div className="card" key={ds.id}>
                <div className="ds-name">{ds.id}</div>
                <div className="kv">
                  <span>kind</span>
                  <b>{ds.kind}</b>
                </div>
                <div className="kv">
                  <span>grain</span>
                  <b>{ds.grain}</b>
                </div>
                <div className="kv">
                  <span>rows</span>
                  <b>{String(ds.row_count)}</b>
                </div>
                <div className="kv">
                  <span>keys</span>
                  <b>{Array.isArray(ds.keys) ? ds.keys.join(", ") : ds.keys}</b>
                </div>
                {ds.derived_from.length > 0 ? (
                  <div className="kv">
                    <span>derived from</span>
                    <b>{ds.derived_from.join(", ")}</b>
                  </div>
                ) : null}
                {ds.body ? <div className="ds-body">{ds.body}</div> : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "code" ? (
        <div>
          <div className="section-h">Code provenance</div>
          {step.code_ref === null ? (
            <EmptyNote>No code recorded on this step.</EmptyNote>
          ) : (
            <div className="card">
              <div className="kv">
                <span>entrypoint</span>
                <b>{step.code_ref.entrypoint}</b>
              </div>
              <div className="kv">
                <span>git_sha</span>
                <b>{step.code_ref.git_sha}</b>
              </div>
              <div className="kv">
                <span>dslib_sha</span>
                <b>{step.code_ref.dslib_sha}</b>
              </div>
              <div className="kv">
                <span>run_log</span>
                <b>{step.code_ref.run_log}</b>
              </div>
              <EmptyNote>
                File contents are not served by the companion server yet.
              </EmptyNote>
            </div>
          )}
        </div>
      ) : null}

      {tab === "assets" ? (
        <div>
          {assets.length === 0 ? (
            <EmptyNote>
              No assets available. Asset contents are not served by the companion
              server yet.
            </EmptyNote>
          ) : (
            assets.map((a) => <AssetView asset={a} key={a.id} />)
          )}
        </div>
      ) : null}

      {tab === "decisions" ? (
        <div>
          {stepDecisions.length === 0 ? (
            <EmptyNote>No decisions recorded on this step.</EmptyNote>
          ) : (
            stepDecisions.map((d) => (
              <button
                key={d.id}
                className="card decision"
                onClick={() => onSelectDecision(d.id)}
              >
                <div className="stmt">◆ {d.statement}</div>
                {d.rationale ? <div className="rat">{d.rationale}</div> : null}
                <div className="by">
                  {d.made_by ?? "—"}
                  {d.made_at ? ` · ${d.made_at}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </aside>
  );
}
