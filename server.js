require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

// Initialize Neon PostgreSQL pool
const pool = new Pool({
  connectionString,
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

    // Create chat_messages table for chatbot history
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database initialization complete (notes and chat_messages tables ensured).');
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

// CHATBOT endpoints

// GET chat history
app.get('/api/chat/history', async (req, res) => {
  try {
    await ensureDatabase();
    const result = await pool.query('SELECT * FROM chat_messages ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching chat history:', err.message);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// POST chat message (calls DeepSeek and saves exchange)
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    await ensureDatabase();

    // Save user message
    await pool.query(
      'INSERT INTO chat_messages (role, content) VALUES ($1, $2)',
      ['user', message.trim()]
    );

    // Fetch recent history for context (last 20 messages)
    const historyResult = await pool.query(
      'SELECT role, content FROM chat_messages ORDER BY created_at DESC LIMIT 20'
    );
    const history = historyResult.rows.reverse();

    const messages = history.map(h => ({ role: h.role, content: h.content }));

    // Call DeepSeek API
    const deepseekKey = process.env.DEEPSEEK_KEY;
    const deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!deepseekKey) {
      return res.status(500).json({ error: 'DeepSeek API key not configured' });
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekKey}`
      },
      body: JSON.stringify({
        model: deepseekModel,
        messages,
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API error:', errorText);
      return res.status(502).json({ error: 'AI service error', detail: errorText });
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || 'No response from AI.';

    // Save assistant message
    await pool.query(
      'INSERT INTO chat_messages (role, content) VALUES ($1, $2)',
      ['assistant', aiContent]
    );

    res.json({ role: 'assistant', content: aiContent });
  } catch (err) {
    console.error('Error in chat:', err.message);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// DELETE chat history
app.delete('/api/chat/clear', async (req, res) => {
  try {
    await ensureDatabase();
    await pool.query('DELETE FROM chat_messages');
    res.json({ message: 'Chat history cleared' });
  } catch (err) {
    console.error('Error clearing chat history:', err.message);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

// POST save chat as note
app.post('/api/chat/save-note', async (req, res) => {
  const { title } = req.body;
  try {
    await ensureDatabase();
    const result = await pool.query(
      'SELECT role, content FROM chat_messages ORDER BY created_at ASC'
    );
    const history = result.rows;
    if (history.length === 0) {
      return res.status(400).json({ error: 'No chat history to save' });
    }

    const content = history
      .map(m => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`)
      .join('\n\n');

    const noteTitle = title && title.trim() ? title.trim() : 'Chat Summary';
    const insertResult = await pool.query(
      'INSERT INTO notes (title, content, color) VALUES ($1, $2, $3) RETURNING *',
      [noteTitle, content, '#0284c7']
    );
    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    console.error('Error saving chat as note:', err.message);
    res.status(500).json({ error: 'Failed to save chat as note' });
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
