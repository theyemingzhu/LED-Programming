import { useMemo } from 'react';
import { useProject } from '../../../state/ProjectContext.jsx';
import { buildRunSheet, formatAmps, formatMillimetres } from '../../../lib/wireBuildSheet.js';

// The two read-outs somebody actually wires from: the order the data line
// reaches each strip with the pixel addresses it answers to, and the totals
// for the whole run.
//
// The LED strips list above this is for EDITING — select one, hide it, change
// its count. This is for BUILDING, so it is ordered by the solder path rather
// than by when a strip was drawn, and it carries the two facts the list has
// never shown: which addresses land on which strip, and how far apart the
// lights sit once the drawn length is divided by the gaps between them.

function ScheduleRow({ row }) {
  return (
    <tr data-testid={`schedule-row-${row.stripId}`}>
      <td className="lwbs-ix">{String(row.index).padStart(2, '0')}</td>
      <td className="lwbs-nm">
        {row.color && <span className="lwbs-sw" style={{ background: row.color }} aria-hidden="true" />}
        {row.name}
      </td>
      <td className="lwbs-n">{row.leds}</td>
      <td className="lwbs-n">{row.from}–{row.to}</td>
      <td className="lwbs-n">{row.pitchMm === null ? '—' : row.pitchMm.toFixed(1)}</td>
      {/* Which way the strip emits. Rounded to a whole degree because that is
          the resolution somebody can actually mount a strip to; null means the
          strip has never been given a direction, which is not the same as 0°. */}
      <td className="lwbs-n">{row.angleDeg === null ? '—' : `${Math.round(row.angleDeg)}°`}</td>
    </tr>
  );
}

export function WireBuildSheet({ state }) {
  const { strips, pxPerMm } = state;
  const { compiledWiring, standaloneController } = useProject();

  const sheet = useMemo(() => buildRunSheet({
    strips,
    compiledWiring,
    pxPerMm,
    standaloneController,
  }), [strips, compiledWiring, pxPerMm, standaloneController]);

  // Nothing drawn yet: an empty schedule is worse than no schedule, because it
  // reads as a design with no strips rather than a panel with nothing to say.
  if (!sheet.rows.length) return null;

  const { power } = sheet;
  const runOrder = sheet.rows.map(row => row.index).join(' → ');

  return (
    <>
      <section className="lwbs lwbs-schedule" aria-label="Strip schedule" data-testid="strip-schedule">
        <div className="panel-head">
          <span className="ttl">Strip schedule</span>
          {/* The count lives on the sheet's Total line; repeating it here only
              made the bar too long for a 300px column and clipped the words
              that say which order these are in. */}
          <span className="meta">{sheet.planned ? 'wire order' : 'drawing order'}</span>
        </div>
        <table className="lwbs-table">
          <thead>
            <tr>
              <th scope="col" className="lwbs-ix">#</th>
              <th scope="col">Strip</th>
              <th scope="col" className="lwbs-n">LEDs</th>
              <th scope="col" className="lwbs-n">Range</th>
              <th scope="col" className="lwbs-n" title="Centre-to-centre spacing in millimetres">Pitch</th>
              <th scope="col" className="lwbs-n" title="Direction the strip emits, in degrees">Angle</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map(row => <ScheduleRow key={row.stripId} row={row} />)}
          </tbody>
        </table>
        {!sheet.planned && (
          <p className="lwbs-note" data-testid="schedule-unplanned">
            No wire plan yet, so these are listed in the order they were drawn. The
            addresses will follow whatever order you solder in.
          </p>
        )}
      </section>

      <section className="lwbs lwbs-sheet" aria-label="Build sheet" data-testid="build-sheet">
        <div className="panel-head">
          <span className="ttl">Build sheet</span>
          <span className="meta">
            {sheet.continuous ? 'continuous run' : `${sheet.outputs.length} data lines`}
          </span>
        </div>
        <dl className="lwbs-facts">
          <dt>Run</dt>
          <dd data-testid="sheet-run">
            {runOrder}
            {sheet.continuous
              ? `, one data line on GPIO ${sheet.outputs[0].pin ?? '—'}`
              : `, across ${sheet.outputs.length} data lines`}
          </dd>

          <dt>Total</dt>
          <dd data-testid="sheet-total">
            {sheet.totalLeds} LEDs
            {sheet.totalLengthMm === null ? '' : ` · ${formatMillimetres(sheet.totalLengthMm, 0)} of strip`}
          </dd>

          <dt>Draw</dt>
          <dd data-testid="sheet-draw">
            {formatAmps(power.maxAmps)} at full white, {power.milliampsPerPixel} mA a light
          </dd>

          <dt>Supply</dt>
          <dd data-testid="sheet-supply" className={power.status === 'over' ? 'is-over' : undefined}>
            {!power.declared && (
              <>Not set. The draw above is real; the headroom needs your supply size — set it in Wire tools.</>
            )}
            {power.declared && power.status === 'ok' && (
              <>{formatAmps(power.psuAmps)} supply · {formatAmps(power.safeAmps)} usable · {formatAmps(power.headroomAmps)} spare</>
            )}
            {power.declared && power.status === 'over' && (
              <>{formatAmps(power.psuAmps)} supply · {formatAmps(power.safeAmps)} usable · short by {formatAmps(Math.abs(power.headroomAmps))} at full white</>
            )}
          </dd>
        </dl>
      </section>
    </>
  );
}
