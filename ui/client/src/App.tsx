// The three-pane shell (spec §10 / ticket #5): global decisions RAIL │ DAG
// CANVAS │ docked INSPECTOR. Wires the read-only store (useProjection) to the
// panes and derives the decision-highlight set. No write path anywhere.
import { useMemo } from "react";
import { useProjection } from "./state/useProjection";
import { highlightForDecision } from "./dag/reactFlowMap";
import { DecisionsRail } from "./components/DecisionsRail";
import { DagCanvas } from "./components/DagCanvas";
import { Inspector } from "./components/Inspector";

export function App(): JSX.Element {
  const { state, dispatch } = useProjection();
  const { projection, selectedStepId, activeDecisionId, phase, error } = state;

  const activeDecision = useMemo(
    () => projection.decisions.find((d) => d.id === activeDecisionId) ?? null,
    [projection.decisions, activeDecisionId],
  );

  // Selecting a decision highlights its supporting subtree in the DAG.
  const highlight = useMemo(
    () =>
      activeDecision
        ? highlightForDecision(projection.logic, activeDecision)
        : null,
    [projection.logic, activeDecision],
  );

  const selectedStep = selectedStepId
    ? (projection.logic.byId.get(selectedStepId) ?? null)
    : null;

  // Selecting a decision toggles its highlight (see reducer). We deliberately do
  // NOT also move the inspector selection: clicking a step clears the highlight,
  // so the two stay independent and predictable.
  const onSelectDecision = (id: string): void =>
    dispatch({ type: "select/decision", id });

  return (
    <div className="app">
      {phase === "error" ? (
        <div className="banner error">
          Cannot reach the companion server{error ? `: ${error}` : ""}. Start it
          with <code>npm run server</code>.
        </div>
      ) : null}
      <div className="three-pane">
        <DecisionsRail
          logic={projection.logic}
          decisions={projection.decisions}
          activeDecisionId={activeDecisionId}
          onSelectDecision={onSelectDecision}
        />
        <DagCanvas
          dag={projection.logic}
          selectedId={selectedStepId}
          highlight={highlight}
          onSelect={(id) =>
            dispatch({ type: "select/step", id })
          }
        />
        <Inspector
          step={selectedStep}
          datasets={projection.datasets}
          decisions={projection.decisions}
          onSelectStep={(id) => dispatch({ type: "select/step", id })}
          onSelectDecision={onSelectDecision}
        />
      </div>
    </div>
  );
}
