import { Router } from 'express';
import { pool } from './db.js';

export const participation = Router({ mergeParams: true });
const validId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0 && Number(value) <= 2147483647;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return year >= 1 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function courseExists(courseId, client = pool) {
  const result = await client.query('SELECT 1 FROM course_rosters WHERE id = $1', [courseId]);
  return result.rowCount > 0;
}

async function studentInCourse(courseId, studentId, client = pool, lock = false) {
  return client.query(`SELECT id FROM roster_students WHERE id = $1 AND course_id = $2${lock ? ' FOR UPDATE' : ''}`, [studentId, courseId]);
}

function validateEvent(req, res, hasScore) {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'Course not found.' }); return false; }
  if (!validId(req.body?.studentId)) { res.status(400).json({ error: 'Choose a valid student.' }); return false; }
  if (!validDate(req.body?.date)) { res.status(400).json({ error: 'Enter a valid classroom date in YYYY-MM-DD format.' }); return false; }
  if (hasScore && (!Number.isInteger(req.body?.score) || req.body.score < 0 || req.body.score > 5)) {
    res.status(400).json({ error: 'Score must be an integer from 0 through 5.' }); return false;
  }
  return true;
}

export function pickWeightedStudent(students, excludeId, random = Math.random) {
  if (!students.length) return null;
  const candidates = students.length > 1 && excludeId !== undefined && excludeId !== null
    ? students.filter((student) => String(student.id) !== String(excludeId))
    : students;
  const minimum = Math.min(...students.map((student) => student.participation_count));
  const weights = candidates.map((student) => 0.5 ** (student.participation_count - minimum));
  let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < candidates.length; i += 1) {
    draw -= weights[i];
    if (draw < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

participation.get('/next', async (req, res) => {
  const courseId = req.params.id;
  if (!validId(courseId)) return res.status(404).json({ error: 'Course not found.' });
  const excludeId = req.query.excludeStudentId;
  if (excludeId !== undefined && !validId(excludeId)) return res.status(400).json({ error: 'Invalid excluded student.' });
  if (!await courseExists(courseId)) return res.status(404).json({ error: 'Course not found.' });
  const result = await pool.query(`
    SELECT s.id, s.name,
      count(e.id) FILTER (WHERE e.event_type = 'score')::integer AS participation_count,
      count(e.id) FILTER (WHERE e.event_type = 'pass')::integer AS pass_count
    FROM roster_students s LEFT JOIN participation_events e ON e.student_id = s.id
    WHERE s.course_id = $1 GROUP BY s.id ORDER BY s.position`, [courseId]);
  if (!result.rowCount) return res.status(409).json({ error: 'This course has no students to ask.' });
  const selected = pickWeightedStudent(result.rows, excludeId);
  res.json({ student: {
    id: selected.id, name: selected.name,
    photoUrl: `/api/courses/${courseId}/students/${selected.id}/photo`,
    participationCount: selected.participation_count,
    passCount: selected.pass_count,
    passesRemaining: Math.max(0, 2 - selected.pass_count),
  } });
});

participation.post('/score', async (req, res) => {
  if (!validateEvent(req, res, true)) return;
  const { id } = req.params;
  const { studentId, score, date } = req.body;
  if (!await courseExists(id)) return res.status(404).json({ error: 'Course not found.' });
  if (!(await studentInCourse(id, studentId)).rowCount) return res.status(404).json({ error: 'Student not found in this course.' });
  const result = await pool.query(`INSERT INTO participation_events (student_id, event_type, score, participation_date)
    VALUES ($1, 'score', $2, $3) RETURNING id, student_id AS "studentId", event_type AS "eventType", score,
    to_char(participation_date, 'YYYY-MM-DD') AS date`, [studentId, score, date]);
  res.status(201).json(result.rows[0]);
});

participation.post('/pass', async (req, res) => {
  if (!validateEvent(req, res, false)) return;
  const { id } = req.params;
  const { studentId, date } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!await courseExists(id, client)) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Course not found.' }); }
    // Serializing on the student row makes the count and insert atomic for that student.
    if (!(await studentInCourse(id, studentId, client, true)).rowCount) {
      await client.query('ROLLBACK'); return res.status(404).json({ error: 'Student not found in this course.' });
    }
    const count = await client.query(`SELECT count(*)::integer AS used FROM participation_events
      WHERE student_id = $1 AND event_type = 'pass'`, [studentId]);
    if (count.rows[0].used >= 2) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This student has no passes remaining.' }); }
    await client.query(`INSERT INTO participation_events (student_id, event_type, participation_date)
      VALUES ($1, 'pass', $2)`, [studentId, date]);
    await client.query('COMMIT');
    res.status(201).json({ passesUsed: count.rows[0].used + 1, passesRemaining: 1 - count.rows[0].used });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
});

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildParticipationCsv(students, events) {
  const dates = [...new Set(events.map((event) => event.date))];
  const byStudent = new Map(students.map((student) => [student.id, { scores: [], days: new Map() }]));
  for (const event of events) {
    const entry = byStudent.get(event.student_id);
    entry.scores.push(event.score);
    if (!entry.days.has(event.date)) entry.days.set(event.date, []);
    entry.days.get(event.date).push(event.score);
  }
  const rows = [['name', 'average', ...dates]];
  for (const student of students) {
    const entry = byStudent.get(student.id);
    const average = entry.scores.length
      ? String(Math.round((entry.scores.reduce((sum, score) => sum + score, 0) / entry.scores.length + Number.EPSILON) * 100) / 100)
      : '';
    rows.push([student.name, average, ...dates.map((date) => (entry.days.get(date) || []).join(';'))]);
  }
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return csv;
}

participation.get('/export', async (req, res) => {
  const courseId = req.params.id;
  if (!validId(courseId)) return res.status(404).json({ error: 'Course not found.' });
  const course = await pool.query('SELECT course_number, quarter, year FROM course_rosters WHERE id = $1', [courseId]);
  if (!course.rowCount) return res.status(404).json({ error: 'Course not found.' });
  const students = await pool.query('SELECT id, name FROM roster_students WHERE course_id = $1 ORDER BY position', [courseId]);
  const events = await pool.query(`SELECT e.student_id, e.score, to_char(e.participation_date, 'YYYY-MM-DD') AS date
    FROM participation_events e JOIN roster_students s ON s.id = e.student_id
    WHERE s.course_id = $1 AND e.event_type = 'score'
    ORDER BY e.participation_date, e.created_at, e.id`, [courseId]);
  const csv = buildParticipationCsv(students.rows, events.rows);
  const title = course.rows[0];
  const filename = `${title.course_number}-${title.quarter}-${title.year}-participation.csv`
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});
