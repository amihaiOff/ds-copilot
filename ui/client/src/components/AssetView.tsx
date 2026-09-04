// Renders one attached asset (spec §3.3 / §10). Plots go through Plotly, code
// through highlight.js, tables/reports inline. The companion server does not yet
// serve asset contents (see README of this slice / summary), so today these are
// driven only by any assets the wire carries; the component is ready for them.
import { Suspense, lazy } from "react";
import type { PlotFigure } from "./PlotView";
import { CodeView } from "./CodeView";

// Plotly is heavy (~3MB pre-min); lazy-load it so its chunk is fetched only when
// a plot asset actually renders (spec §10: code-split the chunky deps).
const PlotView = lazy(() =>
  import("./PlotView").then((m) => ({ default: m.PlotView })),
);

export type AssetKind = "plot" | "table" | "code" | "report" | "model" | "file";

export interface AssetRef {
  id: string;
  kind: AssetKind;
  caption?: string;
  /** plot */
  figure?: PlotFigure;
  /** table (first row = header) */
  rows?: string[][];
  /** code / report text */
  content?: string;
  /** model key/value summary */
  kv?: Record<string, string>;
  /** relative path under the step's assets/ */
  path?: string;
}

export function AssetView({ asset }: { asset: AssetRef }): JSX.Element {
  return (
    <div className="asset-card">
      <div className="asset-type">
        {asset.kind.toUpperCase()}
        {asset.path ? <span className="asset-path">{asset.path}</span> : null}
      </div>
      {asset.caption ? <div className="asset-cap">{asset.caption}</div> : null}
      <div className="asset-body">
        {asset.kind === "plot" && asset.figure ? (
          <div style={{ height: 220 }}>
            <Suspense fallback={<div className="empty-note">loading plot…</div>}>
              <PlotView figure={asset.figure} />
            </Suspense>
          </div>
        ) : null}
        {asset.kind === "code" && asset.content ? (
          <CodeView content={asset.content} />
        ) : null}
        {asset.kind === "report" && asset.content ? (
          <pre className="report">{asset.content}</pre>
        ) : null}
        {asset.kind === "table" && asset.rows ? (
          <table className="mini">
            <tbody>
              {asset.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) =>
                    i === 0 ? <th key={j}>{cell}</th> : <td key={j}>{cell}</td>,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {asset.kind === "model" && asset.kv ? (
          <div>
            {Object.entries(asset.kv).map(([k, v]) => (
              <div className="kv" key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
