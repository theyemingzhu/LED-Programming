export function estimateWiringFrameTiming({ outputs, totalPixels }) {
  // Both supported LED chipsets send 24 bits at 800 kbit/s. The four ESP32-S3
  // transmitters bound the data time even when the renderer adds no delay.
  const longestOutput = Math.max(0, ...outputs.map(output => output.count));
  const idealParallelLoad = totalPixels / 4;
  const minimumFrameDataMs = 0.03 * Math.max(longestOutput, idealParallelLoad);
  return {
    minimumFrameDataMs,
    maximumFps: minimumFrameDataMs > 0 ? 1000 / minimumFrameDataMs : null,
    longestOutputSetsLimit: longestOutput > idealParallelLoad,
  };
}
