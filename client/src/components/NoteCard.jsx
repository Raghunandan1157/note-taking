import React from 'react';
import { Marked } from 'marked';

const marked = new Marked({
  gfm: true,
  breaks: true,
});

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) return 'Just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NoteCard({ note, onEdit, onDelete, onTogglePin }) {
  // Use note.color as base and generate glows / borders
  const accentColor = note.color || '#475569';
  const shadowGlow = `${accentColor}26`; // Hex color with 15% opacity

  const parsedContent = React.useMemo(() => {
    try {
      return marked.parse(note.content || '');
    } catch (e) {
      return note.content || '';
    }
  }, [note.content]);

  return (
    <div 
      className="note-card" 
      style={{ 
        '--note-accent': accentColor,
        '--note-accent-glow': shadowGlow
      }}
    >
      <div className="note-card-header">
        <h3>{note.title}</h3>
        <div className="note-card-actions">
          <button 
            type="button" 
            className="card-action-btn" 
            onClick={() => onEdit(note)} 
            title="Edit note"
            aria-label="Edit note"
          >
            <i className="fa-regular fa-pen-to-square"></i>
          </button>
          <button 
            type="button" 
            className="card-action-btn btn-delete-card" 
            onClick={() => onDelete(note.id)} 
            title="Delete note"
            aria-label="Delete note"
          >
            <i className="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </div>
      
      <div 
        className="note-card-content" 
        dangerouslySetInnerHTML={{ __html: parsedContent }}
      />
      
      <div className="note-card-footer">
        <div className="time-badge">
          <i className="fa-regular fa-clock"></i>
          <span>{formatRelativeTime(note.updated_at || note.created_at)}</span>
        </div>
        <i 
          className={`fa-thumbtack ${note.is_pinned ? 'fa-solid pinned-badge' : 'fa-regular Pinned-badge'}`}
          style={{ opacity: note.is_pinned ? 1 : 0.25 }}
          onClick={() => onTogglePin(note)}
          title={note.is_pinned ? 'Unpin note' : 'Pin note'}
        ></i>
      </div>
    </div>
  );
}
