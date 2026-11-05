/** Keep mapper's chain timing/context and leaf identity in native argument order. */
export function mapperFrameInputs(points, contexts, palette, beat, beatSin) {
  return points.map((point,index) => {
    const context = contexts.get(point.chainRootId ?? point.stripId) ?? contexts.get(point.stripId);
    return {fn:context?.fn,args:[point.chainIndex ?? point.index ?? index,point.nx,point.ny,
      context?.st.t,context?.st.time,point.chainTotal ?? points.length,palette,beat,beatSin,context?.params,
      point.stripId,point.stripIndex / Math.max((point.stripTotal || 1)-1,1)]};
  });
}
