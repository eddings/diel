import * as React from "react";
import * as d3 from "d3";
import { ChartSpec } from "../../../runtime/runtimeTypes";
import { VizLayout, DefaultVizLayout, BrushBoxOneDim, BrushBoxType, FilterValueType } from "../../vizSpec/vizSpec";

// we are going to over load categorical data with some order metrics
// note: might change if we ned to accept multiple selections in the future.
interface BarChartProp {
  spec: ChartSpec;
  selectedDataRange?: {min: FilterValueType; max: FilterValueType};
  layout?: VizLayout;
  colorSpec?: {
    selected?: string,
    default: string
  };
  brushHandler?: (box: BrushBoxOneDim) => void;
  svgClickHandler?: () => void;
}

/**
 * going to hardcode this to categorical for now (cast numbers to strings)
 * @param p props
 */
export const BarChart: React.StatelessComponent<BarChartProp> = (p) => {
  const data = p.spec.data;
  if ((!data) || (data.length < 1)) {
    return <p>no result</p>;
  }
  console.log("props", p);
  const color = p.colorSpec ? p.colorSpec.default : "steelblue";
  const selectedColor = (p.colorSpec && p.colorSpec.selected) ? p.colorSpec.selected : "orange";
  const layout = p.layout ? p.layout : DefaultVizLayout;
  const {chartWidth, chartHeight} = layout;
  const yDomain = d3.extent(p.spec.data.map(d => d[p.spec.yAttribute] as number));
  let y = d3.scaleLinear().rangeRound([layout.chartHeight, 0]).domain(yDomain);
  // const xDomain = p.spec.data.map(d => d[p.spec.xAttribute].toString());
  // const x = d3.scaleBand().rangeRound([0, layout.chartWidth]).padding(0.4).domain(xDomain);
  // const xDomain = p.spec.data.map((_, i) => i);
  const x = d3.scaleLinear().rangeRound([0, chartWidth]).domain([0, p.spec.data.length]);
  // const barWidth = x.bandwidth();
  const barWidth = Math.round(chartWidth * 0.8 / data.length);
  const bars =  data.map((d, idx) => {
    const yPos = y(d[p.spec.yAttribute] as number);
    const barColor = p.selectedDataRange
      ? ((d[p.spec.xAttribute] <= p.selectedDataRange.max) && (d[p.spec.xAttribute] >= p.selectedDataRange.min))
        ? selectedColor
        : color
      : color;
    return <rect
      className={"select-bars"}
      x={x(idx)}
      y={yPos}
      width={barWidth}
      height={layout.chartHeight - yPos}
      fill={barColor}
    ></rect>;
  });
  // weird as any cast...
  // const xTickValues = data.map(v => v[p.spec.xAttribute] as any);
  const xFormatter = (t: any) => {
    const idx = parseInt(t);
    const tickVal = data[idx] ? data[idx][p.spec.xAttribute] : "";
    return tickVal;
  };
  // not sure why we need to subtract 1 but we do...
  let xAxis = d3.axisBottom(x).tickValues(data.map((_, i) => i)).tickFormat(xFormatter as any);
  let yAxis = d3.axisLeft(y).ticks(Math.min(yDomain[1], 20)).tickSizeOuter(0);
  let brushDiv = null;
  if (p.brushHandler) {
    const brush = d3.brushX()
    .extent([[0, 0], [chartWidth, chartHeight]])
    .on("start", function() {
      // TODO
      // console.log("brush started");
    })
    .on("end", function() {
      // see https://github.com/d3/d3-brush/issues/10
      if (!d3.event.sourceEvent) return; // Only transition after input.
      if (!d3.event.selection) return; // Ignore empty selections.
      const s = d3.brushSelection(this) as [number, number];
      if (s !== null) {
        const box = {
          brushBoxType: BrushBoxType.OneDim,
          min: data[Math.floor(x.invert(Math.min(s[0], s[1])))][p.spec.xAttribute] as number,
          max: data[Math.floor(x.invert(Math.max(s[0], s[1])))][p.spec.xAttribute] as number
        };
        p.brushHandler(box);
      }
      // FIXME: thing
      d3.select(this).call(brush.move, null);
    });
    brushDiv = <g ref={ g => d3.select(g).call(brush as any) }></g>;
  }
  // transform={`translate(${layout.chartWidth}, 0)`}
  const ticks = <>
      <g
        ref={(g) => {d3.select(g).call(yAxis as any); }}
      ></g>
      <g
        ref={(g) => {d3.select(g).call(xAxis as any); }}
        transform={`translate(0,` + layout.chartHeight + ")"}
      ></g>
    </>;
  return <svg
      onClick={p.svgClickHandler}
      width={layout.chartWidth + layout.marginLeft + layout.marginRight}
      height={layout.chartHeight + layout.marginTop + layout.marginBottom}
    >
     <g transform={`translate(${layout.marginLeft}, ${layout.marginTop})`} >
      {bars}
      {ticks}
      {brushDiv}
     </g>
  </svg>;
};