import { Router } from 'express';
import multer from 'multer';
import { pool } from './db.js';
import { participation } from './participation.js';
import { parseRoster, RosterError } from './roster-parser.js';

export const courses = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 3, parts: 4 } });
const quarters = ['Fall', 'Winter', 'Spring', 'Summer'];
const validId = (value) => /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 2147483647;
let importing = false;

courses.use('/:id/participation', participation);

courses.get('/', async (req, res) => {
  const course = String(req.query.course || '').trim().toUpperCase();
  const year = String(req.query.year || '').trim();
  if (year && !/^[1-9]\d{3}$/.test(year)) return res.status(400).json({ error: 'Enter a four-digit year.' });
  const result = await pool.query(`
    SELECT c.*, count(s.id)::integer AS student_count
    FROM course_rosters c LEFT JOIN roster_students s ON s.course_id = c.id
    WHERE ($1 = '' OR strpos(c.course_number, $1) > 0) AND ($2::integer IS NULL OR c.year = $2::integer)
    GROUP BY c.id ORDER BY c.year DESC,
    CASE c.quarter WHEN 'Fall' THEN 4 WHEN 'Summer' THEN 3 WHEN 'Spring' THEN 2 ELSE 1 END DESC,
    c.course_number`, [course, year || null]);
  res.json(result.rows);
});

courses.post('/', (req, res, next) => {
  if (importing) return res.status(409).json({ error: 'Another roster is being imported. Please try again shortly.' });
  importing = true;
  res.once('finish', () => { importing = false; });
  res.once('close', () => { importing = false; });
  next();
}, upload.single('file'), async (req, res) => {
  const course = String(req.body.courseNumber || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const quarter = req.body.quarter;
  const year = String(req.body.year || '');
  if (!/^[A-Z0-9][A-Z0-9 -]{1,39}$/.test(course) || !/[A-Z]/.test(course) || !/\d/.test(course)) {
    return res.status(400).json({ error: 'Enter a course number such as CSC 3310 (up to 40 characters).' });
  }
  if (!quarters.includes(quarter) || !/^[1-9]\d{3}$/.test(year)) return res.status(400).json({ error: 'Choose a quarter and enter a four-digit year.' });
  if (!req.file) return res.status(400).json({ error: 'Choose a roster PDF to upload.' });
  const existing = await pool.query('SELECT id FROM course_rosters WHERE course_number=$1 AND quarter=$2 AND year=$3', [course, quarter, year]);
  if (existing.rowCount) return res.status(409).json({ error: 'This course already has a roster for that quarter and year. Open it from Courses.', courseId: existing.rows[0].id });
  const students = await parseRoster(req.file.buffer);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('INSERT INTO course_rosters (course_number, quarter, year) VALUES ($1, $2, $3) RETURNING *', [course, quarter, year]);
    const roster = result.rows[0];
    for (const [position, student] of students.entries()) {
      await client.query('INSERT INTO roster_students (course_id, name, position, photo) VALUES ($1, $2, $3, $4)', [roster.id, student.name, position, student.photo]);
    }
    await client.query('COMMIT');
    res.status(201).json({ ...roster, student_count: students.length });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'This course already has a roster for that quarter and year.' });
    throw error;
  } finally { client.release(); }
});

courses.get('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Course not found.' });
  const course = await pool.query('SELECT * FROM course_rosters WHERE id=$1', [req.params.id]);
  if (!course.rowCount) return res.status(404).json({ error: 'Course not found.' });
  const students = await pool.query('SELECT id, name FROM roster_students WHERE course_id=$1 ORDER BY position', [req.params.id]);
  res.json({ ...course.rows[0], students: students.rows.map((student) => ({ ...student, photoUrl: `/api/courses/${req.params.id}/students/${student.id}/photo` })) });
});

courses.get('/:id/students/:studentId/photo', async (req, res) => {
  if (!validId(req.params.id) || !validId(req.params.studentId)) return res.sendStatus(404);
  const result = await pool.query('SELECT photo FROM roster_students WHERE course_id=$1 AND id=$2', [req.params.id, req.params.studentId]);
  if (!result.rowCount) return res.sendStatus(404);
  res.type('png').set('Cache-Control', 'no-store').send(result.rows[0].photo);
});

export function apiError(error, _req, res, _next) {
  if (error instanceof RosterError) return res.status(422).json({ error: error.message });
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'The PDF must be 20 MB or smaller.' : 'Upload one PDF with the three course fields.' });
  console.error('Request failed:', error.code || error.name);
  res.status(500).json({ error: 'Unable to complete the request. Please check the database connection and try again.' });
}
