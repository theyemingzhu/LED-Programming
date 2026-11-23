import { useEffect, useMemo, useRef, useState } from 'react';
import { createCardFrameStream } from '../../lib/cardFrameStream.js';
import { correctFrameForChannelMap } from '../../lib/stripDiscovery.js';
import { buildFirstCheckColourFrame, buildFirstCheckEndsFrame, colourRowVerdict } from '../../lib/firstInstallCheck.js';
import { useProject } from '../../state/ProjectContext.jsx';
import './strip-discovery.css';

// Way in 1 of Find my strips (todo/plans/find-strips-redesign.md §7): a blank
// card took the whole project in one save. Find my strips is now a check, not
// a gate: one colour question, then every strip's end at once. Frames only;
// nothing is written to the card here. A colour fix changes the project and is
// sent by the next Save to card, which says so.
const COLOUR_ROWS = Object.freeze([
  ['red', 'green', 'blue'], ['green', 'red', 'blue'], ['blue', 'red', 'green'],
  ['red', 'blue', 'green'], ['green', 'blue', 'red'], ['blue', 'green', 'red'],
]);
const HEALTH_POLL_MS = 500;

export function FirstInstallLightCheck({ host, transport, bootId = '', onDone, onOpenLayout }) {
  const { compiledWiring, standaloneController, setStandaloneController } = useProject();
  const outputs = compiledWiring?.outputs || [];
  const outputKey = outputs.map(output => `${output.pin}:${output.start}:${output.count}`).join('|');
  const savedOrder = standaloneController?.led?.colorOrder || 'GRB';
  const [step, setStep] = useState('colour');
  const [colourFix, setColourFix] = useState(null);
  const [lit, setLit] = useState({ sent: 0, failing: false, reason: '' });
  const streamRef = useRef(null);

  const frame = useMemo(() => {
    if (step === 'colour') return buildFirstCheckColourFrame(outputs);
    if (step === 'ends') return correctFrameForChannelMap(buildFirstCheckEndsFrame(outputs), colourFix?.map || null);
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, outputKey, colourFix]);

  // A stream is bound to the boot it started on; the first save restarts the
  // card, so a new boot gets a new stream (and the frame is pushed again).
  useEffect(() => {
    const stream = createCardFrameStream({ host, transport });
    streamRef.current = stream;
    stream.start();
    const timer = setInterval(() => {
      const stats = stream.getStats?.() || {};
      setLit(current => {
        const failing = (Number(stats.consecutiveFailures) || 0) > 0;
        const next = { sent: Number(stats.sentFrames) || 0, failing, reason: failing ? String(stats.lastError?.reason || stats.lastError?.message || '') : '' };
        return next.sent === current.sent && next.failing === current.failing && next.reason === current.reason ? current : next;
      });
    }, HEALTH_POLL_MS);
    return () => {
      clearInterval(timer);
      streamRef.current = null;
      void stream.stop();
    };
  }, [host, transport, bootId]);

  useEffect(() => {
    if (frame && streamRef.current) streamRef.current.push(frame);
  }, [frame, bootId]);

  // Nothing to answer until the strip shows what the question is about.
  const waiting = lit.sent === 0 || lit.failing;

  const answerColour = row => {
    const verdict = colourRowVerdict(row, savedOrder);
    if (!verdict.valid) return;
    if (!verdict.ok && verdict.colorOrder) {
      setColourFix(verdict);
      setStandaloneController(previous => ({
        ...previous,
        led: {
          ...(previous?.led || {}),
          colorOrder: verdict.colorOrder,
          colorOrderConfirmed: true,
          confirmedColorOrder: verdict.colorOrder,
        },
      }), { physicalColorConfirmed: true });
    }
    setStep('ends');
  };

  return (
    <section className="strip-discovery-step" data-testid="first-install-check" data-step={step}>
      {step === 'colour' && (
        <>
          <h3>Tap what you see.</h3>
          <p className="strip-discovery-note" data-testid="first-install-check-hint">Lights 1, 2 and 3 of the first strip.</p>
          <div role="group" aria-label="The colours of lights 1, 2 and 3" className="strip-discovery-colour-rows">
            {COLOUR_ROWS.map(row => (
              <button
                key={row.join('-')}
                type="button"
                className="strip-discovery-colour-row"
                data-testid={`first-install-colour-row-${row.map(name => name[0]).join('')}`}
                aria-label={row.join(', ')}
                disabled={waiting}
                onClick={() => answerColour(row)}
              >
                {row.map(name => <i key={name} className={`is-${name}`} />)}
              </button>
            ))}
          </div>
        </>
      )}
      {step === 'ends' && (
        <>
          <h3>Is purple the last light on every strip?</h3>
          <div className="strip-discovery-actions">
            <button type="button" className="btn primary" data-testid="first-install-ends-yes" disabled={waiting} onClick={() => setStep('done')}>Yes</button>
            <button type="button" className="btn btn-ghost" data-testid="first-install-ends-no" disabled={waiting} onClick={() => setStep('fix')}>One isn&rsquo;t</button>
          </div>
        </>
      )}
      {step === 'fix' && (
        <>
          <h3>Change that strip&rsquo;s count in Layout.</h3>
          <p className="strip-discovery-note">Then save to card again.</p>
          <div className="strip-discovery-actions">
            <button type="button" className="btn primary" data-testid="first-install-open-layout" onClick={() => onOpenLayout?.()}>Open Layout</button>
            <button type="button" className="btn btn-ghost" data-testid="first-install-ends-back" onClick={() => setStep('ends')}>Look again</button>
          </div>
        </>
      )}
      {step === 'done' && (
        <>
          <h3>{colourFix ? 'Colours fixed in your project.' : 'Lights checked.'}</h3>
          {colourFix && <p className="strip-discovery-note" data-testid="first-install-colour-fixed">Save to card to send the fix.</p>}
          <div className="strip-discovery-actions">
            <button type="button" className="btn primary" data-testid="first-install-check-done" onClick={() => onDone?.({ colourFixed: Boolean(colourFix) })}>
              {colourFix ? 'Save to card' : 'Open Patterns'}
            </button>
          </div>
        </>
      )}
      {waiting && step !== 'done' && step !== 'fix' && (
        <p className="strip-discovery-note" role="status" data-testid="first-install-check-wait" data-reason={lit.reason}>
          {lit.failing ? 'Waiting for the card to take the lights. It may still be restarting.' : 'Waiting for the card to light up.'}
        </p>
      )}
    </section>
  );
}

export default FirstInstallLightCheck;
