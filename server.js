require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const rateLimit = require('express-rate-limit');

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add updated_at column if it doesn't exist (migration)
    await client.query(`
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
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

    // Create config table to store app settings (avoids Vercel env-var limits)
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default config from env if rows are missing
    const configRes = await client.query("SELECT COUNT(*)::int AS cnt FROM app_config WHERE key IN ('DEEPSEEK_KEY','DEEPSEEK_MODEL')");
    if (configRes.rows[0].cnt < 2) {
      const key = process.env.DEEPSEEK_KEY || '';
      const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
      if (key) {
        await client.query(`
          INSERT INTO app_config (key, value) VALUES ('DEEPSEEK_KEY', $1)
          ON CONFLICT (key) DO NOTHING;
        `, [key]);
      }
      await client.query(`
        INSERT INTO app_config (key, value) VALUES ('DEEPSEEK_MODEL', $1)
        ON CONFLICT (key) DO NOTHING;
      `, [model]);
      console.log('App config seeded into database.');
    }

    console.log('Database initialization complete (notes, chat_messages, and app_config tables ensured).');
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

// Read a config value from the database
async function getConfig(key) {
  const result = await pool.query('SELECT value FROM app_config WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for chat endpoint to protect against API credit draining
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: 'Too many chat requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// REST API Endpoints

// GET all notes
app.get('/api/notes', async (req, res) => {
  try {
    await ensureDatabase();
    // Safety cap of 500 notes to prevent unbounded growth. Pagination can be added later.
    const result = await pool.query('SELECT * FROM notes ORDER BY created_at DESC LIMIT 500');
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
    const query = 'UPDATE notes SET title = $1, content = $2, color = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *';
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
app.post('/api/chat', chatLimiter, async (req, res) => {
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

    // Fetch the user's notes from the database so the assistant can answer
    // questions about them (e.g. "what was I doing today?").
    const notesResult = await pool.query(
      'SELECT title, content, created_at FROM notes ORDER BY created_at DESC LIMIT 100'
    );
    const notesContext = notesResult.rows.length
      ? notesResult.rows
          .map((n, i) => {
            const date = new Date(n.created_at).toISOString().slice(0, 10);
            const body = (n.content || '').slice(0, 1000);
            return `Note ${i + 1} [${date}] "${n.title}": ${body}`;
          })
          .join('\n\n')
      : 'The user has no notes yet.';

    const today = new Date().toISOString().slice(0, 10);
    const systemMessage = {
      role: 'system',
      content:
        `You are a helpful AI assistant built into the user's personal note-taking app. ` +
        `You can read the user's saved notes, which are provided below, and you should use them to answer ` +
        `questions about what they have written, their tasks, and what they have been working on ` +
        `(e.g. "what was I doing today?"). When relevant, reference note titles and dates. ` +
        `If a question is unrelated to their notes, just answer it normally. ` +
        `Today's date is ${today}.\n\n` +
        `=== USER'S NOTES ===\n${notesContext}`
    };

    // Fetch recent history for context (last 20 messages)
    const historyResult = await pool.query(
      'SELECT role, content FROM chat_messages ORDER BY created_at DESC LIMIT 20'
    );
    const history = historyResult.rows.reverse();

    const messages = [systemMessage, ...history.map(h => ({ role: h.role, content: h.content }))];

    // Call DeepSeek API (read config from database instead of env)
    const deepseekKey = await getConfig('DEEPSEEK_KEY');
    const deepseekModel = await getConfig('DEEPSEEK_MODEL') || 'deepseek-chat';

    if (!deepseekKey) {
      return res.status(503).json({ error: 'DeepSeek API key not configured. Set it via POST /api/config { "key": "DEEPSEEK_KEY", "value": "sk-..." }.' });
    }

    if (typeof fetch === 'undefined') {
      return res.status(500).json({ error: 'fetch is not available. Node >=18 required.' });
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
    console.error('Error in chat:', err);
    res.status(500).json({ error: 'Failed to process chat message', detail: err.message });
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

// CONFIG endpoints (store API keys in database instead of Vercel env vars)

// GET config value (returns existence, not the value for security)
app.get('/api/config/:key', async (req, res) => {
  try {
    await ensureDatabase();
    const val = await getConfig(req.params.key);
    if (val === null) return res.status(404).json({ error: 'Config key not found' });
    res.json({ key: req.params.key, exists: true });
  } catch (err) {
    console.error('Error reading config:', err.message);
    res.status(500).json({ error: 'Failed to read config' });
  }
});

// POST set config value
app.post('/api/config', async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'key and value are required' });
  }
  try {
    await ensureDatabase();
    await pool.query(`
      INSERT INTO app_config (key, value) VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
    `, [key, value]);
    res.json({ message: 'Config saved', key, value });
  } catch (err) {
    console.error('Error saving config:', err.message);
    res.status(500).json({ error: 'Failed to save config' });
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
