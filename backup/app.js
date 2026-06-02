document.addEventListener('DOMContentLoaded', () => {
    // Form & Input Elements
    const noteForm = document.getElementById('note-form');
    const noteTitle = document.getElementById('note-title');
    const noteContent = document.getElementById('note-content');
    const notesGrid = document.getElementById('notes-grid');
    const searchInput = document.getElementById('search-input');
    const totalNotesCount = document.getElementById('total-notes-count');
    const visibleNotesCount = document.getElementById('visible-notes-count');
    const lastSync = document.getElementById('last-sync');
    const emptyState = document.getElementById('empty-state');

    // Edit Modal Elements
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const editNoteId = document.getElementById('edit-note-id');
    const editTitle = document.getElementById('edit-title');
    const editContent = document.getElementById('edit-content');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');

    // Toast & Dialog Elements
    const toastEl = document.getElementById('toast');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmOk = document.getElementById('confirm-ok');
    const confirmCancel = document.getElementById('confirm-cancel');
    const promptModal = document.getElementById('prompt-modal');
    const promptMessage = document.getElementById('prompt-message');
    const promptInput = document.getElementById('prompt-input');
    const promptOk = document.getElementById('prompt-ok');
    const promptCancel = document.getElementById('prompt-cancel');

    let allNotes = [];
    let isFirstLoad = true;
    let currentColorFilter = 'all';

    // Toast notification helper
    function showToast(message, type = 'success') {
        toastEl.textContent = message;
        toastEl.className = `toast show ${type}`;
        setTimeout(() => {
            toastEl.classList.remove('show');
        }, 4000);
    }

    // Confirm dialog helper (returns promise)
    function showConfirm(message) {
        return new Promise((resolve) => {
            confirmMessage.textContent = message;
            confirmModal.style.display = 'flex';

            const cleanup = () => {
                confirmModal.style.display = 'none';
                confirmOk.removeEventListener('click', handleOk);
                confirmCancel.removeEventListener('click', handleCancel);
            };

            const handleOk = () => {
                cleanup();
                resolve(true);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            confirmOk.addEventListener('click', handleOk);
            confirmCancel.addEventListener('click', handleCancel);
        });
    }

    // Prompt dialog helper (returns promise)
    function showPrompt(message, defaultValue = '') {
        return new Promise((resolve) => {
            promptMessage.textContent = message;
            promptInput.value = defaultValue;
            promptModal.style.display = 'flex';
            promptInput.focus();

            const cleanup = () => {
                promptModal.style.display = 'none';
                promptOk.removeEventListener('click', handleOk);
                promptCancel.removeEventListener('click', handleCancel);
                promptInput.removeEventListener('keypress', handleEnter);
            };

            const handleOk = () => {
                const value = promptInput.value.trim();
                cleanup();
                resolve(value || null);
            };

            const handleCancel = () => {
                cleanup();
                resolve(null);
            };

            const handleEnter = (e) => {
                if (e.key === 'Enter') handleOk();
            };

            promptOk.addEventListener('click', handleOk);
            promptCancel.addEventListener('click', handleCancel);
            promptInput.addEventListener('keypress', handleEnter);
        });
    }

    // Fetch and display notes (used for initial load and real-time polling)
    async function fetchNotes() {
        try {
            updateSyncStatus('syncing');
            const res = await fetch('/api/notes');
            if (!res.ok) throw new Error('Network response was not ok');
            
            const fetchedNotes = await res.json();
            
            // Perform deep comparison to avoid re-rendering and screen flicker if data is unchanged
            if (JSON.stringify(fetchedNotes) !== JSON.stringify(allNotes)) {
                allNotes = fetchedNotes;
                filterNotes(); // Update UI with current search query applied
            }
            isFirstLoad = false;
            updateSyncStatus('synced');
        } catch (err) {
            console.error('Error fetching notes:', err);
            updateSyncStatus('error');
            
            // Only show major error card on the initial load to prevent disrupting the user
            if (isFirstLoad) {
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
    }

    // Render notes array to the grid
    function renderNotes(notesToRender) {
        // Clear notes except empty-state template
        const cards = notesGrid.querySelectorAll('.note-card');
        cards.forEach(card => card.remove());

        // Update stats
        totalNotesCount.textContent = allNotes.length;
        visibleNotesCount.textContent = `${notesToRender.length} shown`;

        if (notesToRender.length === 0) {
            emptyState.style.display = 'flex';
            const hasSearch = searchInput.value.trim().length > 0;
            emptyState.querySelector('h3').textContent = hasSearch ? 'No matching notes' : 'No notes found';
            emptyState.querySelector('p').textContent = hasSearch ? 'Try a different search term' : 'Create a note to start your workspace';
            return;
        }

        emptyState.style.display = 'none';

        notesToRender.forEach(note => {
            const noteCard = document.createElement('div');
            noteCard.className = 'note-card';
            noteCard.style.setProperty('--note-accent', note.color || '#1e293b');
            noteCard.setAttribute('data-id', note.id);

            const formattedDate = formatDate(note.created_at);
            const isEdited = note.updated_at && new Date(note.updated_at) > new Date(note.created_at);

            noteCard.innerHTML = `
                <div class="note-header">
                    <h3 class="note-title">${escapeHTML(note.title)}</h3>
                    <div class="note-actions">
                        <button class="btn-edit" title="Edit note" aria-label="Edit note">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button class="btn-delete" title="Delete note" aria-label="Delete note">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                <p class="note-body">${escapeHTML(note.content || '')}</p>
                <div class="note-footer">
                    <span class="note-date">
                        <i class="fa-regular fa-calendar"></i> ${formattedDate}
                    </span>
                    ${isEdited ? '<span class="note-edited-badge">Edited</span>' : ''}
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
            allNotes.unshift(newNote); // Add to local cache instantly
            
            // Reset fields
            noteTitle.value = '';
            noteContent.value = '';
            
            // Reset checked color to slate
            const defaultColorInput = document.querySelector('input[name="note-color"][value="#1e293b"]');
            if (defaultColorInput) defaultColorInput.checked = true;

            // Trigger search filter refresh and background sync
            filterNotes();
        } catch (err) {
            console.error('Error creating note:', err);
            showToast('Failed to save note. Please check server connection.', 'error');
        }
    });

    // Delete note
    async function deleteNote(id, noteCard) {
        const confirmed = await showConfirm('Are you sure you want to delete this note?');
        if (!confirmed) return;

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
                filterNotes();
            }, 300);

        } catch (err) {
            console.error('Error deleting note:', err);
            showToast('Failed to delete note.', 'error');
        }
    }

    // --- Edit Modal Handlers ---

    let previouslyFocusedElement = null;

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

        // Show modal and move focus to first input
        editModal.classList.add('active');
        previouslyFocusedElement = document.activeElement;
        editTitle.focus();
    }

    function closeEditModal() {
        editModal.classList.remove('active');
        if (previouslyFocusedElement) {
            previouslyFocusedElement.focus();
        }
    }

    // Event listeners to close modal
    btnCloseModal.addEventListener('click', closeEditModal);
    btnCancelEdit.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });

    // Escape key handler for edit modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editModal.classList.contains('active')) {
            closeEditModal();
        }
    });

    // Focus trap for edit modal - get all focusable elements within the modal
    function getModalFocusableElements() {
        const focusableElements = editModal.querySelectorAll(
            'input, textarea, button, [tabindex]:not([tabindex="-1"])'
        );
        return Array.from(focusableElements);
    }

    // Tab key handler for focus trap in edit modal
    editModal.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && editModal.classList.contains('active')) {
            const focusableElements = getModalFocusableElements();
            if (focusableElements.length === 0) return;

            const activeElement = document.activeElement;
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            // Shift+Tab on first element - focus last
            if (e.shiftKey && activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
            // Tab on last element - focus first
            else if (!e.shiftKey && activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
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
            showToast('Failed to update note. Please try again.', 'error');
        }
    });

    // Real-time search filter with color filter
    function filterNotes() {
        const query = searchInput.value.toLowerCase().trim();

        let filtered = allNotes;

        // Apply color filter
        if (currentColorFilter !== 'all') {
            filtered = filtered.filter(note => (note.color || '#1e293b') === currentColorFilter);
        }

        // Apply search query filter
        if (query) {
            filtered = filtered.filter(note => {
                const matchTitle = note.title.toLowerCase().includes(query);
                const matchContent = (note.content || '').toLowerCase().includes(query);
                return matchTitle || matchContent;
            });
        }

        renderNotes(filtered);
    }

    searchInput.addEventListener('input', filterNotes);

    // Color filter chip handlers
    const colorFiltersContainer = document.getElementById('color-filters');
    const colorFilterChips = colorFiltersContainer.querySelectorAll('.color-filter-chip');

    colorFilterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const color = chip.getAttribute('data-color');
            currentColorFilter = color;

            // Update active state
            colorFilterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            // Apply filter
            filterNotes();
        });
    });

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

    function updateSyncStatus(state) {
        if (!lastSync) return;

        const icon = lastSync.querySelector('i');
        const label = lastSync.querySelector('span');

        if (state === 'syncing') {
            icon.className = 'fa-solid fa-rotate';
            label.textContent = 'Syncing';
            return;
        }

        if (state === 'error') {
            icon.className = 'fa-solid fa-triangle-exclamation';
            label.textContent = 'Offline';
            return;
        }

        icon.className = 'fa-solid fa-check';
        label.textContent = 'Synced';
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

    // Start background polling loop for real-time DB synchronization (every 3 seconds)
    setInterval(() => {
        if (document.hidden) return;  // skip polling when tab is not visible
        fetchNotes();
    }, 3000);

    // ---------- Chatbot ----------
    const chatToggle = document.getElementById('chat-toggle');
    const chatPanel = document.getElementById('chat-panel');
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const btnCloseChat = document.getElementById('btn-close-chat');
    const btnClearChat = document.getElementById('btn-clear-chat');
    const btnSaveChat = document.getElementById('btn-save-chat');
    const chatConfigForm = document.getElementById('chat-config-form');
    const chatApiKey = document.getElementById('chat-api-key');

    let chatHistory = [];
    let apiKeyConfigured = false;
    let previousChatFocusedElement = null;

    function toggleChat() {
        chatPanel.classList.toggle('open');
        chatToggle.classList.toggle('hidden');
        if (chatPanel.classList.contains('open')) {
            previousChatFocusedElement = document.activeElement;
            chatInput.focus();
            scrollChatToBottom();
        } else {
            if (previousChatFocusedElement) {
                previousChatFocusedElement.focus();
            }
        }
    }

    const sidebarChatBtn = document.getElementById('sidebar-chat-btn');

    function openChat() {
        if (!chatPanel.classList.contains('open')) {
            toggleChat();
        } else {
            chatInput.focus();
        }
    }

    chatToggle.addEventListener('click', toggleChat);
    btnCloseChat.addEventListener('click', toggleChat);
    if (sidebarChatBtn) sidebarChatBtn.addEventListener('click', openChat);

    // Escape key handler for chat panel
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatPanel.classList.contains('open')) {
            toggleChat();
        }
    });

    function scrollChatToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function appendChatBubble(role, text) {
        const div = document.createElement('div');
        div.className = `chat-bubble ${role}`;

        if (role === 'assistant') {
            // Parse markdown and render as HTML
            const renderedHTML = marked.parse(text);
            const contentDiv = document.createElement('div');
            contentDiv.className = 'chat-message-rendered';
            contentDiv.innerHTML = renderedHTML;

            // Create copy button
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'chat-copy-btn';
            copyBtn.title = 'Copy message';
            copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    const originalHTML = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                    copyBtn.style.opacity = '1';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalHTML;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });

            contentDiv.appendChild(copyBtn);
            div.appendChild(contentDiv);
        } else {
            // User message - escape HTML, don't parse markdown
            const safeText = escapeHTML(text).replace(/\n/g, '<br>');
            div.innerHTML = `
                <div class="chat-bubble-inner">${safeText}</div>
            `;
        }

        const timeSpan = document.createElement('span');
        timeSpan.className = 'chat-time';
        timeSpan.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        div.appendChild(timeSpan);

        chatMessages.appendChild(div);
        scrollChatToBottom();
    }

    function appendTypingIndicator() {
        const div = document.createElement('div');
        div.className = 'chat-bubble assistant typing-indicator';
        div.id = 'typing-indicator';
        div.innerHTML = `
            <div class="chat-bubble-inner">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
            </div>
        `;
        chatMessages.appendChild(div);
        scrollChatToBottom();
    }

    function removeTypingIndicator() {
        const el = document.getElementById('typing-indicator');
        if (el) el.remove();
    }

    async function checkApiKey() {
        try {
            const res = await fetch('/api/config/DEEPSEEK_KEY');
            apiKeyConfigured = res.ok;
            updateChatInputVisibility();
        } catch (err) {
            apiKeyConfigured = false;
            updateChatInputVisibility();
        }
    }

    function updateChatInputVisibility() {
        if (apiKeyConfigured) {
            chatConfigForm.style.display = 'none';
            chatForm.style.display = 'flex';
        } else {
            chatConfigForm.style.display = 'block';
            chatForm.style.display = 'none';
        }
    }

    chatConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = chatApiKey.value.trim();
        if (!key) return;
        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'DEEPSEEK_KEY', value: key })
            });
            if (!res.ok) throw new Error('Failed to save API key');
            chatApiKey.value = '';
            apiKeyConfigured = true;
            updateChatInputVisibility();
            appendChatBubble('assistant', 'API key saved! You can now start chatting.');
        } catch (err) {
            console.error('Error saving API key:', err);
            appendChatBubble('assistant', 'Failed to save API key. Please try again.');
        }
    });

    async function loadChatHistory() {
        try {
            const res = await fetch('/api/chat/history');
            if (!res.ok) throw new Error('Failed to load chat history');
            chatHistory = await res.json();
            chatMessages.innerHTML = '';
            if (chatHistory.length === 0) {
                chatMessages.innerHTML = `
                    <div class="chat-welcome">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        <p>Ask me anything. I will help you and you can save our conversation as a note.</p>
                        <div class="chat-suggestions">
                            <button type="button" class="chat-suggestion-chip" data-prompt="What was I doing today?">What was I doing today?</button>
                            <button type="button" class="chat-suggestion-chip" data-prompt="Summarize my notes">Summarize my notes</button>
                            <button type="button" class="chat-suggestion-chip" data-prompt="What should I focus on?">What should I focus on?</button>
                            <button type="button" class="chat-suggestion-chip" data-prompt="Top priorities">Top priorities</button>
                        </div>
                    </div>
                `;
                attachSuggestionChipListeners();
            } else {
                chatHistory.forEach(m => appendChatBubble(m.role, m.content));
            }
        } catch (err) {
            console.error('Error loading chat history:', err);
        }
    }

    function attachSuggestionChipListeners() {
        const chips = chatMessages.querySelectorAll('.chat-suggestion-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const prompt = chip.getAttribute('data-prompt');
                chatInput.value = prompt;
                chatForm.dispatchEvent(new Event('submit'));
            });
        });
    }

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        appendChatBubble('user', text);
        chatInput.value = '';
        appendTypingIndicator();

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });
            removeTypingIndicator();
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Unknown server error' }));
                throw new Error(errorData.error || `Server error: ${res.status}`);
            }
            const data = await res.json();
            appendChatBubble('assistant', data.content);
        } catch (err) {
            removeTypingIndicator();
            console.error('Chat error:', err);
            if (err.message.includes('not configured')) {
                apiKeyConfigured = false;
                updateChatInputVisibility();
                appendChatBubble('assistant', 'API key is missing. Paste your DeepSeek key below to continue.');
            } else {
                appendChatBubble('assistant', `Error: ${err.message}. Check server logs.`);
            }
        }
    });

    btnClearChat.addEventListener('click', async () => {
        const confirmed = await showConfirm('Clear all chat history?');
        if (!confirmed) return;
        try {
            const res = await fetch('/api/chat/clear', { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to clear chat');
            chatMessages.innerHTML = `
                <div class="chat-welcome">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    <p>Ask me anything. I will help you and you can save our conversation as a note.</p>
                    <div class="chat-suggestions">
                        <button type="button" class="chat-suggestion-chip" data-prompt="What was I doing today?">What was I doing today?</button>
                        <button type="button" class="chat-suggestion-chip" data-prompt="Summarize my notes">Summarize my notes</button>
                        <button type="button" class="chat-suggestion-chip" data-prompt="What should I focus on?">What should I focus on?</button>
                        <button type="button" class="chat-suggestion-chip" data-prompt="Top priorities">Top priorities</button>
                    </div>
                </div>
            `;
            attachSuggestionChipListeners();
        } catch (err) {
            console.error('Error clearing chat:', err);
            showToast('Failed to clear chat history.', 'error');
        }
    });

    btnSaveChat.addEventListener('click', async () => {
        const title = await showPrompt('Enter a title for this chat note:', 'Chat Summary');
        if (!title) return;
        try {
            const res = await fetch('/api/chat/save-note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title })
            });
            if (!res.ok) throw new Error('Failed to save chat as note');
            const note = await res.json();
            allNotes.unshift(note);
            filterNotes();
            showToast('Chat saved as a note!', 'success');
        } catch (err) {
            console.error('Error saving chat:', err);
            showToast('Failed to save chat as note.', 'error');
        }
    });

    // Load chat history and check API key status on page load
    checkApiKey();
    loadChatHistory();

    // Attach listeners to any existing suggestion chips (on initial page load)
    setTimeout(() => {
        attachSuggestionChipListeners();
    }, 100);
});
