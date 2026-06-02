import React from 'react';

const COLORS = [
  { value: '#475569', label: 'Slate' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#0ea5e9', label: 'Ocean' },
  { value: '#8b5cf6', label: 'Amethyst' },
  { value: '#ef4444', label: 'Ruby' },
  { value: '#f59e0b', label: 'Amber' },
];

export default function NoteModal({ isOpen, note, onClose, onSave }) {
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [color, setColor] = React.useState('#475569');

  React.useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(note.content || '');
      setColor(note.color || '#475569');
    } else {
      setTitle('');
      setContent('');
      setColor('#475569');
    }
  }, [note, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: note?.id,
      title: title.trim(),
      content: content.trim(),
      color,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{note ? 'Edit Note' : 'Create Note'}</h2>
          <button 
            type="button" 
            className="btn-close-modal" 
            onClick={onClose} 
            aria-label="Close modal"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="modal-title">Title</label>
            <input 
              type="text" 
              id="modal-title" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required 
              placeholder="Give your note a title..."
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label htmlFor="modal-content">Content (supports Markdown)</label>
            <textarea 
              id="modal-content" 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows="6" 
              placeholder="Start typing your note description... (you can use markdown!)"
            />
          </div>
          
          <div className="form-group color-group">
            <label>Card Highlight Color</label>
            <div className="color-palette edit-palette">
              {COLORS.map((col) => (
                <label key={col.value} className="color-option" style={{ '--color': col.value }} title={col.label}>
                  <input 
                    type="radio" 
                    name="edit-note-color" 
                    value={col.value}
                    checked={color === col.value}
                    onChange={() => setColor(col.value)}
                  />
                  <span className="color-indicator"></span>
                </label>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-save-edit">
              {note ? 'Save Changes' : 'Create Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
