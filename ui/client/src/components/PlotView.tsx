// Interactive plot assets rendered with Plotly (spec §10). We pair
// react-plotly.js's factory with the slim `plotly.js-dist-min` bundle to keep the
// chunk small. A plot asset's `figure` is Plotly's `{ data, layout }` JSON.
import { useMemo } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";

const Plot = createPlotlyComponent(Plotly);

export interface PlotFigure {
  data: unknown[];
  layout?: Record<string, unknown>;
}

export function PlotView({ figure }: { figure: PlotFigure }): JSX.Element {
  const layout = useMemo(
    () => ({
      autosize: true,
      margin: { l: 44, r: 16, t: 16, b: 40 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      ...(figure.layout ?? {}),
    }),
    [figure.layout],
  );
  return (
    <Plot
      data={figure.data}
      layout={layout}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
    />
  );
}
