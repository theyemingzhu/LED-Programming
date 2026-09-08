import '../../styles/lw-ui.css';

/**
 * ProgressRail — the one long bar Studio shows while something is running:
 * reading a card's firmware, installing, writing a project. A percentage
 * printed inside a sentence tells an owner a number; a rail lets them watch
 * the work move, which is what "is this stuck?" actually asks.
 *
 * Anatomy: label left, percent right in mono tabular figures so counting
 * never shifts the label, a full-width track underneath, and an optional
 * caption for the real figure behind the percent (bytes, build) — never an
 * invented one.
 *
 * `value` is 0..1. Pass null for work whose size is not known yet: the track
 * sweeps, the percent reads em-dash, and no aria-valuenow is published, so
 * assistive tech is told "indeterminate" rather than "zero".
 */
export function ProgressRail({
  label,
  value,
  state = 'active',
  caption,
  testId,
  labelId,
}) {
  const indeterminate = value == null || !Number.isFinite(value);
  const pct = indeterminate ? 0 : Math.max(0, Math.min(100, Math.round(value * 100)));

  return (
    <div className={`lwui-rail is-${state}`} data-testid={testId}>
      <div className="lwui-rail-head">
        <span className="lwui-rail-label" id={labelId}>{label}</span>
        <span className="lwui-rail-pct">{indeterminate ? '—' : `${pct}%`}</span>
      </div>
      <div
        className={`lwui-rail-track${indeterminate ? ' is-indeterminate' : ''}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(indeterminate ? {} : { 'aria-valuenow': pct })}
      >
        <div className="lwui-rail-fill" style={indeterminate ? undefined : { width: `${pct}%` }} />
      </div>
      {caption && <p className="lwui-rail-caption">{caption}</p>}
    </div>
  );
}

export default ProgressRail;
