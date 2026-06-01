document.addEventListener('DOMContentLoaded', () => {
    // Form & Input Elements
    const noteForm = document.getElementById('note-form');
    const noteTitle = document.getElementById('note-title');
    const noteContent = document.getElementById('note-content');
    const notesGrid = document.getElementById('notes-grid');
    const searchInput = document.getElementById('search-input');
    const totalNotesCount = document.getElementById('total-notes-count');
    const emptyState = document.getElementById('empty-state');

    // Edit Modal Elements
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const editNoteId = document.getElementById('edit-note-id');
    const editTitle = document.getElementById('edit-title');
    const editContent = document.getElementById('edit-content');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');

    let allNotes = [];

    // Fetch and display existing notes
    async function fetchNotes() {
        try {
            const res = await fetch('/api/notes');
            if (!res.ok) throw new Error('Network response was not ok');
            
            allNotes = await res.json();
            renderNotes(allNotes);
        } catch (err) {
            console.error('Error fetching notes:', err);
            notesGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon" style="color: #ef4444;">
                        <i class="fa-solid fa-circle-exclamation"></i>
                    </div>
                    <h3>Error loading notes</h3>
                    <p>Failed to connect to the database. Make sure the server is running.</p>
                </div>
            `;
        }
    }

    // Render notes array to the grid
    function renderNotes(notesToRender) {
        // Clear notes except empty-state template
        const cards = notesGrid.querySelectorAll('.note-card');
        cards.forEach(card => card.remove());

        // Update stats
        totalNotesCount.textContent = allNotes.length;

        if (notesToRender.length === 0) {
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';

        notesToRender.forEach(note => {
            const noteCard = document.createElement('div');
            noteCard.className = 'note-card';
            noteCard.style.setProperty('--note-accent', note.color || '#1e293b');
            noteCard.setAttribute('data-id', note.id);

            const formattedDate = formatDate(note.created_at);

            noteCard.innerHTML = `
                <div class="note-header">
                    <h3 class="note-title">${escapeHTML(note.title)}</h3>
                    <div class="note-actions">
                        <button class="btn-edit" title="Edit note">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button class="btn-delete" title="Delete note">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                <p class="note-body">${escapeHTML(note.content || '')}</p>
                <div class="note-footer">
                    <span class="note-date">
                        <i class="fa-regular fa-calendar"></i> ${formattedDate}
                    </span>
                </div>
            `;

            // Edit event handler
            const editBtn = noteCard.querySelector('.btn-edit');
            editBtn.addEventListener('click', () => openEditModal(note));

            // Delete event handler
            const deleteBtn = noteCard.querySelector('.btn-delete');
            deleteBtn.addEventListener('click', () => deleteNote(note.id, noteCard));

            notesGrid.appendChild(noteCard);
        });
    }

    // Add note
    noteForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = noteTitle.value.trim();
        const content = noteContent.value.trim();
        
        // Find checked color
        const checkedColorInput = document.querySelector('input[name="note-color"]:checked');
        const color = checkedColorInput ? checkedColorInput.value : '#1e293b';

        if (!title) return;

        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, content, color })
            });

            if (!res.ok) throw new Error('Failed to create note');

            const newNote = await res.json();
            allNotes.unshift(newNote); // Add to the beginning of the local cache
            
            // Reset fields
            noteTitle.value = '';
            noteContent.value = '';
            
            // Reset checked color to slate (first option)
            const defaultColorInput = document.querySelector('input[name="note-color"][value="#1e293b"]');
            if (defaultColorInput) defaultColorInput.checked = true;

            // Trigger search filter refresh
            filterNotes();
        } catch (err) {
            console.error('Error creating note:', err);
            alert('Failed to save note. Please check server connection.');
        }
    });

    // Delete note
    async function deleteNote(id, noteCard) {
        if (!confirm('Are you sure you want to delete this note?')) return;

        try {
            const res = await fetch(`/api/notes/${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Failed to delete note');

            // Apply exit animation and remove from DOM
            noteCard.style.opacity = '0';
            noteCard.style.transform = 'scale(0.9)';
            
            setTimeout(() => {
                allNotes = allNotes.filter(note => note.id !== id);
                renderNotes(allNotes);
            }, 300);

        } catch (err) {
            console.error('Error deleting note:', err);
            alert('Failed to delete note.');
        }
    }

    // --- Edit Modal Handlers ---

    function openEditModal(note) {
        editNoteId.value = note.id;
        editTitle.value = note.title;
        editContent.value = note.content || '';

        // Select correct color input in edit modal palette
        const targetColorInput = document.querySelector(`input[name="edit-note-color"][value="${note.color || '#1e293b'}"]`);
        if (targetColorInput) {
            targetColorInput.checked = true;
        } else {
            const defaultColorInput = document.querySelector('input[name="edit-note-color"][value="#1e293b"]');
            if (defaultColorInput) defaultColorInput.checked = true;
        }

        // Show modal
        editModal.classList.add('active');
    }

    function closeEditModal() {
        editModal.classList.remove('active');
    }

    // Event listeners to close modal
    btnCloseModal.addEventListener('click', closeEditModal);
    btnCancelEdit.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });

    // Handle Edit Form Submission
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = editNoteId.value;
        const title = editTitle.value.trim();
        const content = editContent.value.trim();
        
        const checkedColorInput = document.querySelector('input[name="edit-note-color"]:checked');
        const color = checkedColorInput ? checkedColorInput.value : '#1e293b';

        if (!title) return;

        try {
            const res = await fetch(`/api/notes/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, content, color })
            });

            if (!res.ok) throw new Error('Failed to update note');

            const updatedNote = await res.json();
            
            // Update local state array
            allNotes = allNotes.map(note => note.id === updatedNote.id ? updatedNote : note);
            
            // Close modal and refresh UI
            closeEditModal();
            filterNotes();

        } catch (err) {
            console.error('Error updating note:', err);
            alert('Failed to update note. Please try again.');
        }
    });

    // Real-time search filter
    function filterNotes() {
        const query = searchInput.value.toLowerCase().trim();
        
        if (!query) {
            renderNotes(allNotes);
            return;
        }

        const filtered = allNotes.filter(note => {
            const matchTitle = note.title.toLowerCase().includes(query);
            const matchContent = (note.content || '').toLowerCase().includes(query);
            return matchTitle || matchContent;
        });

        renderNotes(filtered);
    }

    searchInput.addEventListener('input', filterNotes);

    // Helpers
    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Initial fetch
    fetchNotes();
});
