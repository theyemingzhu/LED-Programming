import '../../styles/lw-board-drawing.css';

// An orientation aid for connector drawings. The profile supplies the actual
// connector positions and pin labels beside this illustration.
export function BoardDrawing({ chip = '', antenna = false }) {
  return (
    <div className="lw-board-art" aria-hidden="true">
      {antenna && (
        <div className="lw-board-art-antenna">
          <span /><span /><span /><span />
        </div>
      )}
      <div className="lw-board-art-module">
        <span className="lw-board-art-chip" />
        {chip && <span className="lw-board-art-mark">{chip}</span>}
      </div>
      <div className="lw-board-art-parts"><span /><span /><span /></div>
      <div className="lw-board-art-ports"><span />{antenna && <span />}</div>
    </div>
  );
}
