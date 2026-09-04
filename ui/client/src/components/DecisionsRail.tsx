// The global decisions RAIL (spec §10 / ticket #5): every Decision across the
// whole tree, enumerable in one place. Clicking a decision highlights its
// supporting steps in the DAG (handled by the parent via highlightForDecision).
// Read-only.
import type { LogicDag } from "@shared/dag";
import type { DecisionRecord } from "../state/projection";
import { countByStatus } from "../dag/reactFlowMap";

export interface DecisionsRailProps {
  logic: LogicDag;
  decisions: DecisionRecord[];
  activeDecisionId: string | null;
  onSelectDecision: (id: string) => void;
}

export function DecisionsRail({
  logic,
  decisions,
  activeDecisionId,
  onSelectDecision,
}: DecisionsRailProps): JSX.Element {
  const counts = countByStatus(logic);
  return (
    <nav className="rail">
      <h1 className="rail-title">DS co-pilot</h1>
      <div className="rail-sub">{logic.nodes.length} steps · logic DAG</div>

      <div className="rail-stats">
        <div className="stat">
          <b>{counts.done}</b>
          <span>done</span>
        </div>
        <div className="stat">
          <b>{counts.running}</b>
          <span>running</span>
        </div>
        <div className="stat">
          <b>{counts.proposed}</b>
          <span>proposed</span>
        </div>
      </div>

      <div className="section-h">All decisions ({decisions.length})</div>
      {decisions.length === 0 ? (
        <div className="empty-note">
          No decisions yet. Decisions are recorded during the conversation and
          projected here once the companion server serves them.
        </div>
      ) : (
        decisions.map((d) => (
          <button
            key={d.id}
            className={`rail-item ${activeDecisionId === d.id ? "on" : ""}`}
            onClick={() => onSelectDecision(d.id)}
          >
            <div className="stmt">◆ {d.statement}</div>
            <div className="by">
              {d.made_by ?? "—"}
              {d.made_at ? ` · ${d.made_at}` : ""} · {d.supporting_steps.length}{" "}
              step(s)
            </div>
          </button>
        ))
      )}
      {activeDecisionId ? (
        <div className="empty-note">
          Highlighting supporting steps in the DAG — click again to clear.
        </div>
      ) : null}
    </nav>
  );
}
