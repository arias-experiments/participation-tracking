import { useEffect, useState } from 'react';
import ParticipationDialog from './components/ParticipationDialog.jsx';

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function Roster({ id, participationEnabled = false }) {
  const [asking, setAsking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState('');
  async function exportCsv() {
    if (exporting) return;
    setExporting(true); setActionError('');
    try {
      const response = await fetch(`/api/courses/${id}/participation/export`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Unable to export participation.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'participation.csv';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setActionError(error.message); }
    finally { setExporting(false); }
  }
  const [course, setCourse] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setCourse(null); setError('');
    request(`/api/courses/${id}`, { signal: controller.signal }).then(setCourse).catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [id]);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!course) return <p role="status">Loading roster…</p>;
  return <section className="roster" aria-labelledby="roster-title">
    <div className="section-heading"><div><p className="eyebrow">{course.quarter} {course.year}</p><h2 id="roster-title">{course.course_number}</h2></div><div className="course-heading-actions">{participationEnabled && <><button type="button" onClick={() => { setActionError(''); setAsking(true); }}>Ask</button><button type="button" className="secondary" disabled={exporting} onClick={exportCsv}>{exporting ? 'Exporting…' : 'Export'}</button></>}<span className="badge">{course.students.length} students</span></div></div>
    {actionError && <p role="alert" className="error">{actionError}</p>}
    {asking && <ParticipationDialog courseId={id} onClose={() => setAsking(false)} />}
    <div className="student-grid">{course.students.map((student) => <article className="student" key={student.id}>
      <img src={student.photoUrl} alt={`Portrait of ${student.name}`} loading="lazy" />
      <h3>{student.name}</h3>
    </article>)}</div>
  </section>;
}

function UploadPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get('file').size > 20 * 1024 * 1024) { setError('The PDF must be 20 MB or smaller.'); return; }
    setBusy(true); setError(''); setSaved(null);
    try { setSaved(await request('/api/courses', { method: 'POST', body: data })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><p className="eyebrow">Start a class</p><h1>Upload a roster</h1><p>Add the course details and upload the photo roster from your school system.</p></div>
    <section className="panel"><form onSubmit={submit}>
      <fieldset disabled={busy}><legend className="sr-only">Course details and roster PDF</legend>
        <div className="form-grid">
          <label>Course number<input name="courseNumber" placeholder="CSC 3310" maxLength={40} required autoComplete="off" /></label>
          <label>Quarter<select name="quarter" defaultValue="" required><option value="" disabled>Select quarter</option>{['Fall', 'Winter', 'Spring', 'Summer'].map((q) => <option key={q}>{q}</option>)}</select></label>
          <label>Year<input name="year" type="text" inputMode="numeric" pattern="[1-9][0-9]{3}" maxLength={4} defaultValue={new Date().getFullYear()} required title="Enter a four-digit year" /></label>
        </div>
        <label className="file-field">Roster PDF<input name="file" type="file" accept=".pdf,application/pdf" required /><span className="hint">Photo roster PDF · Up to 20 pages / 20 MB · Processed locally</span></label>
        <button type="submit">{busy ? 'Importing roster…' : 'Upload roster'}</button>
      </fieldset>
      {busy && <p role="status">Reading student names and photos. This may take a moment.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </form></section>
    {saved && <><p role="status" className="success">Roster saved. {saved.student_count} students imported.</p><Roster id={saved.id} /></>}
  </>;
}

function CoursesPage() {
  const [filters, setFilters] = useState({ course: '', year: '' });
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    request(`/api/courses?${new URLSearchParams(filters)}`, { signal: controller.signal })
      .then(setCourses).catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters]);
  function filter(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFilters({ course: data.get('course').trim(), year: data.get('year').trim() });
  }
  return <>
    <div className="page-heading"><p className="eyebrow">Your classroom</p><h1>Courses</h1><p>Find an uploaded roster and open it to see your students.</p></div>
    <section className="panel"><form onSubmit={filter} onReset={() => setFilters({ course: '', year: '' })} className="filters">
      <label>Course number<input name="course" placeholder="All courses" maxLength={40} /></label>
      <label>Year<input name="year" inputMode="numeric" pattern="[1-9][0-9]{3}" maxLength={4} placeholder="All years" /></label>
      <button type="submit">Apply filters</button><button type="reset" className="secondary">Clear</button>
    </form></section>
    {loading ? <p role="status">Loading courses…</p> : error ? <p className="error" role="alert">{error}</p> : courses.length === 0 ?
      <section className="empty"><h2>{filters.course || filters.year ? 'No matching courses' : 'No rosters yet'}</h2><p>{filters.course || filters.year ? 'Try a different course number or year.' : 'Upload your first roster to start building your classroom.'}</p><a className="button" href="#/upload">Upload a roster</a></section> :
      <><p className="hint" role="status">{courses.length} {courses.length === 1 ? 'course' : 'courses'}</p><div className="course-grid">{courses.map((course) => <a className="course-card" key={course.id} href={`#/courses/${course.id}`}>
        <span className="eyebrow">{course.quarter} {course.year}</span><h2>{course.course_number}</h2><p>{course.student_count} students</p><span className="open-link">View roster →</span>
      </a>)}</div></>}
  </>;
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash || '#/upload');
  useEffect(() => { const change = () => setRoute(window.location.hash || '#/upload'); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  const detail = route.match(/^#\/courses\/(\d+)$/);
  return <><header><a className="brand" href="#/courses">Participation<span>Tracking</span></a><nav aria-label="Main navigation">
    <a href="#/courses" aria-current={route.startsWith('#/courses') ? 'page' : undefined}>Courses</a>
    <a href="#/upload" aria-current={route === '#/upload' ? 'page' : undefined}>Upload roster</a>
  </nav></header><main>
    {detail ? <><a className="back" href="#/courses">← All courses</a><Roster id={detail[1]} participationEnabled /></> : route === '#/courses' ? <CoursesPage /> : <UploadPage />}
  </main><footer>Participation Tracking · Local classroom workspace</footer></>;
}
