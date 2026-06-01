require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Neon PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon secure connection
  }
});

// Test connection and initialize table
async function initDatabase() {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to Neon PostgreSQL database.');
    
    // Create notes table if it does not exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        color VARCHAR(50) DEFAULT '#2c3e50',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database initialization complete (notes table ensured).');
    client.release();
  } catch (err) {
    console.error('Error connecting to database or initializing tables:', err.message);
    throw err;
  }
}

let databaseReady = null;

function ensureDatabase() {
  if (!databaseReady) {
    databaseReady = initDatabase().catch((err) => {
      databaseReady = null;
      throw err;
    });
  }
  return databaseReady;
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// REST API Endpoints

// GET all notes
app.get('/api/notes', async (req, res) => {
  try {
    await ensureDatabase();
    const result = await pool.query('SELECT * FROM notes ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching notes:', err.message);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// POST a new note
app.post('/api/notes', async (req, res) => {
  const { title, content, color } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    await ensureDatabase();
    const query = 'INSERT INTO notes (title, content, color) VALUES ($1, $2, $3) RETURNING *';
    const values = [title, content || '', color || '#2c3e50'];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating note:', err.message);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// PUT (update) an existing note
app.put('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, color } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    await ensureDatabase();
    const query = 'UPDATE notes SET title = $1, content = $2, color = $3 WHERE id = $4 RETURNING *';
    const values = [title, content || '', color || '#2c3e50', id];
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating note:', err.message);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// DELETE a note
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await ensureDatabase();
    const result = await pool.query('DELETE FROM notes WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json({ message: 'Note deleted successfully', deletedNote: result.rows[0] });
  } catch (err) {
    console.error('Error deleting note:', err.message);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Vercel runs this file as a serverless function, so it needs the Express
// app exported instead of starting a long-lived listener.
if (!process.env.VERCEL) {
  ensureDatabase().catch(() => process.exit(1));

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
