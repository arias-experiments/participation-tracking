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
