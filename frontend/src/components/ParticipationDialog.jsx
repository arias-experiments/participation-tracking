import { useEffect, useRef, useState } from 'react';

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

export default function ParticipationDialog({ courseId, onClose }) {
  const [student, setStudent] = useState(null);
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsNext, setNeedsNext] = useState(false);
  const [excludeId, setExcludeId] = useState(null);
  const busyRef = useRef(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();
    function handleKey(event) {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled)')];
      if (!focusable.length) { event.preventDefault(); return; }
      if (document.activeElement === dialogRef.current) { event.preventDefault(); (event.shiftKey ? focusable.at(-1) : focusable[0]).focus(); return; }
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previousFocus?.focus?.(); };
  }, []);

  async function draw(excluded = null) {
    const params = excluded === null ? '' : `?excludeStudentId=${encodeURIComponent(excluded)}`;
    const data = await jsonRequest(`/api/courses/${courseId}/participation/next${params}`);
    setStudent(data.student);
    setScore(0);
    setNeedsNext(false);
    setExcludeId(null);
  }

  async function run(action) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (failure) { setError(failure.message); }
    finally { busyRef.current = false; setBusy(false); }
  }

  useEffect(() => { run(() => draw()); }, [courseId]);

  async function advance(kind) {
    if (!student || needsNext) return;
    await run(async () => {
      if (kind !== 'cancel') {
        await jsonRequest(`/api/courses/${courseId}/participation/${kind}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: student.id, date: localDate(), ...(kind === 'score' ? { score } : {}) }),
        });
      }
      const excluded = kind === 'score' ? null : student.id;
      setExcludeId(excluded);
      setNeedsNext(true);
      await draw(excluded);
    });
  }

  return <div className="dialog-backdrop"><section ref={dialogRef} tabIndex={-1} className="participation-dialog" role="dialog" aria-modal="true" aria-labelledby="participation-title" aria-describedby="participation-description">
    <p className="eyebrow">Classroom participation</p>
    <h2 id="participation-title">Participation</h2>
    <p id="participation-description" className="dialog-intro">Ask a student, then record their response.</p>
    {student && <div className="participation-content">
      <img className="participation-photo" src={student.photoUrl} alt={`Portrait of ${student.name}`} />
      <h3>{student.name}</h3>
      <p className="rating-label">Rate the response</p>
      <div className="star-rating" role="group" aria-label="Response score from 0 to 5 stars">
        {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={value <= score ? 'star selected' : 'star'}
          aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`} aria-pressed={score === value}
          disabled={busy || needsNext} onClick={() => setScore(score === value ? 0 : value)}>★</button>)}
      </div>
      <p className="score-value" aria-live="polite">{score} / 5</p>
      <p className="passes-remaining">{student.passesRemaining === 0 ? 'No passes remaining' : `Passes remaining: ${student.passesRemaining}`}</p>
      {!needsNext && <div className="dialog-actions">
        <div className="dialog-action-row">
          <button type="button" className="secondary" disabled={busy || student.passesRemaining === 0} onClick={() => advance('pass')}>Pass &amp; Next</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => advance('cancel')}>Cancel &amp; Next</button>
        </div>
        <button type="button" className="submit-next" disabled={busy} onClick={() => advance('score')}>Submit &amp; Next</button>
      </div>}
    </div>}
    {busy && <p role="status">{student ? 'Saving and choosing a student…' : 'Choosing a student…'}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!busy && (needsNext || !student) && <button type="button" onClick={() => run(() => draw(excludeId))}>Try choosing a student again</button>}
    <button type="button" className="dialog-finish" disabled={busy} onClick={onClose}>Finish</button>
  </section></div>;
}
