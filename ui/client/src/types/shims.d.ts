// Ambient module declarations for deps that ship no bundled TypeScript types.
// We drive Plotly through react-plotly.js's factory so we can pair it with the
// slim `plotly.js-dist-min` build (the full plotly.js is ~3MB and unneeded).
//
// NB: no top-level import — that would make this a module and the `declare
// module` blocks would become augmentations of non-existent modules.

declare module "react-plotly.js/factory" {
  import type { ComponentType, CSSProperties } from "react";
  export interface PlotParams {
    data: unknown[];
    layout?: Record<string, unknown>;
    config?: Record<string, unknown>;
    frames?: unknown[];
    style?: CSSProperties;
    className?: string;
    useResizeHandler?: boolean;
    onInitialized?: (...args: unknown[]) => void;
    onUpdate?: (...args: unknown[]) => void;
  }
  export default function createPlotlyComponent(
    plotly: unknown,
  ): ComponentType<PlotParams>;
}

declare module "plotly.js-dist-min" {
  const Plotly: unknown;
  export default Plotly;
}
