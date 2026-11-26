import './installer-setup-progress.css';

const steps = [
  ['connect', 'Connect'],
  ['board', 'Choose board'],
  ['strips', 'Connect strips'],
  ['test', 'Test lights'],
];

export function InstallerSetupProgress({ step, compact = false }) {
  const current = step === 'done' ? steps.length : steps.findIndex(([id]) => id === step);
  if (compact) {
    return (
      <span className="installer-setup-current" data-testid="installer-setup-progress">
        <span aria-current={step === 'done' ? undefined : 'step'}>
          <small>{step === 'done' ? 'Setup complete' : `Step ${current + 1} of ${steps.length}`}</small>
          <strong>{step === 'done' ? 'Wiring ready' : steps[current][1]}</strong>
        </span>
      </span>
    );
  }
  return (
    <ol className="installer-setup-progress" aria-label="Card setup progress" data-testid="installer-setup-progress">
      {steps.map(([id, label], index) => (
        <li key={id} data-state={index < current ? 'done' : index === current ? 'current' : 'upcoming'}
          aria-label={index < current ? `${label} complete` : undefined}
          aria-current={id === step ? 'step' : undefined}>
          <span aria-hidden="true">{index < current ? '✓' : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
