import React from 'react';
import SyncIndicator from './components/SyncIndicator';
import Toast from './components/Toast';
import NoteCard from './components/NoteCard';
import NoteModal from './components/NoteModal';
import ChatPanel from './components/ChatPanel';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: '#475569', label: 'Slate' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#0ea5e9', label: 'Ocean' },
  { value: '#8b5cf6', label: 'Amethyst' },
  { value: '#ef4444', label: 'Ruby' },
  { value: '#f59e0b', label: 'Amber' },
];

export default function App() {
  const [notes, setNotes] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeColorFilter, setActiveColorFilter] = React.useState('all');
  const [pinnedNoteIds, setPinnedNoteIds] = React.useState(() => {
    try {
      const saved = localStorage.getItem('pinnedNoteIds');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [isSyncing, setIsSyncing] = React.useState(false);
  const [toasts, setToasts] = React.useState([]);
  
  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingNote, setEditingNote] = React.useState(null);

  // Fetch initial notes
  React.useEffect(() => {
    fetchNotes();

    // Listen to notifications from other panels to reload notes
    const handleReload = () => fetchNotes();
    window.addEventListener('reload-notes', handleReload);
    return () => window.removeEventListener('reload-notes', handleReload);
  }, []);

  // Save pinned notes in localStorage when changed
  React.useEffect(() => {
    localStorage.setItem('pinnedNoteIds', JSON.stringify(pinnedNoteIds));
  }, [pinnedNoteIds]);

  const addToast = (type, message) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    setToasts((prev) => [...prev, { id, type, message }]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchNotes = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/notes');
      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      } else {
        addToast('error', 'Failed to retrieve notes');
      }
    } catch (err) {
      addToast('error', 'Cannot connect to database server');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveNote = async (noteData) => {
    setIsSyncing(true);
    setIsModalOpen(false);
    
    const isEditing = !!noteData.id;
    const url = isEditing ? `/api/notes/${noteData.id}` : '/api/notes';
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: noteData.title,
          content: noteData.content,
          color: noteData.color
        })
      });

      if (res.ok) {
        addToast('success', isEditing ? 'Note saved successfully' : 'Note created successfully');
        fetchNotes();
      } else {
        addToast('error', 'Failed to save note');
      }
    } catch (err) {
      addToast('error', 'Database sync encountered an error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteNote = async (id) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    setIsSyncing(true);

    try {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('success', 'Note deleted successfully');
        
        // clean local storage pins
        if (pinnedNoteIds[id]) {
          setPinnedNoteIds((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }

        fetchNotes();
      } else {
        addToast('error', 'Failed to delete note');
      }
    } catch (err) {
      addToast('error', 'Database sync encountered an error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTogglePin = (note) => {
    setPinnedNoteIds((prev) => ({
      ...prev,
      [note.id]: !prev[note.id]
    }));
    addToast('info', pinnedNoteIds[note.id] ? 'Note unpinned' : 'Note pinned to top');
  };

  const handleOpenCreateModal = () => {
    setEditingNote(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (note) => {
    setEditingNote(note);
    setIsModalOpen(true);
  };

  // Processing, filtering, and sorting notes
  const processedNotes = React.useMemo(() => {
    // 1. Add transient pinned attribute from local storage
    const notesWithPins = notes.map((n) => ({
      ...n,
      is_pinned: !!pinnedNoteIds[n.id],
    }));

    // 2. Perform search filtering
    let filtered = notesWithPins;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          (n.title && n.title.toLowerCase().includes(q)) ||
          (n.content && n.content.toLowerCase().includes(q))
      );
    }

    // 3. Perform color filtering
    if (activeColorFilter !== 'all') {
      filtered = filtered.filter((n) => n.color === activeColorFilter);
    }

    // 4. Sort notes: Pinned first, then by updated_at / created_at descending
    return [...filtered].sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;

      const dateA = new Date(a.updated_at || a.created_at);
      const dateB = new Date(b.updated_at || b.created_at);
      return dateB - dateA;
    });
  }, [notes, searchQuery, activeColorFilter, pinnedNoteIds]);

  return (
    <div className="app-container">
      {/* Mobile Sidebar Toggle Button */}
      <button 
        type="button" 
        className="sidebar-toggle-btn"
        style={{ position: 'fixed', top: '16px', left: '16px', zIndex: 110 }}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >
        <i className={`fa-solid ${isSidebarOpen ? 'fa-xmark' : 'fa-bars'}`}></i>
      </button>

      {/* Navigation Drawer / Panel */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo-icon">
            <i className="fa-solid fa-feather-pointed"></i>
          </div>
          <div>
            <h1>Notes</h1>
            <span className="brand-kicker">Personal workspace</span>
          </div>
        </div>

        <div className="search-box">
          <i className="fa-solid fa-magnifying-glass search-icon"></i>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search notes..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="stats-panel">
          <div className="stat-card">
            <i className="fa-regular fa-note-sticky"></i>
            <span className="stat-num">{notes.length}</span>
            <span className="stat-label">Total Notes</span>
          </div>
        </div>

        <button 
          type="button" 
          className="sidebar-nav-btn"
          onClick={() => { setIsChatOpen(true); setIsSidebarOpen(false); }}
        >
          <span className="nav-btn-icon"><i className="fa-solid fa-robot"></i></span>
          <span className="nav-btn-text">
            <span className="nav-btn-title">AI Assistant</span>
            <span className="nav-btn-sub">Ask about notes</span>
          </span>
          <i className="fa-solid fa-chevron-right nav-btn-chevron"></i>
        </button>

        <footer className="sidebar-footer">
          <p>Synced with <span className="neon-badge"><i className="fa-solid fa-database"></i> Neon DB</span></p>
        </footer>
      </aside>

      {/* Main Workspace */}
      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Personal Workspace</p>
            <h2 className="workspace-title">My Notes</h2>
          </div>
          <SyncIndicator isSyncing={isSyncing} />
        </header>

        {/* Note Creator Form Trigger */}
        <section className="creator-section">
          <div className="note-creator-card" onClick={handleOpenCreateModal} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center', padding: '20px 24px', borderStyle: 'dashed' }}>
            <i className="fa-solid fa-plus-circle" style={{ fontSize: '20px', color: 'var(--primary)' }}></i>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>Click to create a new note...</span>
          </div>
        </section>

        {/* Notes Grid & Filters */}
        <section className="notes-section">
          <div className="section-bar">
            <h2>All notes</h2>
            <span className="visible-notes-count">
              {processedNotes.length} shown of {notes.length}
            </span>
          </div>

          <div className="color-filters">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`color-filter-chip ${activeColorFilter === filter.value ? 'active' : ''}`}
                onClick={() => setActiveColorFilter(filter.value)}
                title={`Filter by ${filter.label}`}
              >
                {filter.value !== 'all' && (
                  <div className="color-dot" style={{ backgroundColor: filter.value }} />
                )}
                <span>{filter.label}</span>
              </button>
            ))}
          </div>

          <div className="notes-grid">
            {processedNotes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <i className="fa-regular fa-folder-open"></i>
                </div>
                <h3>No notes found</h3>
                <p>Add notes or adjust your query/color filters to find them</p>
              </div>
            ) : (
              processedNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onEdit={handleOpenEditModal}
                  onDelete={handleDeleteNote}
                  onTogglePin={handleTogglePin}
                />
              ))
            )}
          </div>
        </section>
      </main>

      {/* Floating Chat Panel Toggle */}
      {!isChatOpen && (
        <button 
          id="chat-toggle" 
          className="chat-toggle" 
          onClick={() => setIsChatOpen(true)}
          title="Open AI Chat" 
          aria-label="Open AI Chat"
        >
          <i className="fa-solid fa-robot"></i>
        </button>
      )}

      {/* Modals and Overlays */}
      <NoteModal
        isOpen={isModalOpen}
        note={editingNote}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveNote}
      />

      <ChatPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onAddToast={addToast}
      />

      <Toast toasts={toasts} onClose={removeToast} />
    </div>
  );
}
