CREATE TABLE IF NOT EXISTS course_rosters (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_number VARCHAR(40) NOT NULL,
  quarter VARCHAR(6) NOT NULL CHECK (quarter IN ('Fall', 'Winter', 'Spring', 'Summer')),
  year INTEGER NOT NULL CHECK (year BETWEEN 1000 AND 9999),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_number, quarter, year)
);
CREATE TABLE IF NOT EXISTS roster_students (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES course_rosters(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  position INTEGER NOT NULL,
  photo BYTEA NOT NULL,
  UNIQUE (course_id, position)
);

CREATE TABLE IF NOT EXISTS participation_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES roster_students(id) ON DELETE CASCADE,
  event_type VARCHAR(5) NOT NULL CHECK (event_type IN ('score', 'pass')),
  score SMALLINT,
  participation_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT participation_event_score CHECK (
    (event_type = 'score' AND score IS NOT NULL AND score BETWEEN 0 AND 5)
    OR (event_type = 'pass' AND score IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS participation_events_student_type_idx
  ON participation_events (student_id, event_type);
CREATE INDEX IF NOT EXISTS participation_events_date_idx
  ON participation_events (participation_date, id) WHERE event_type = 'score';
