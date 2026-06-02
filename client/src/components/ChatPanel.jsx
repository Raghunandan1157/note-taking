import React from 'react';
import { Marked } from 'marked';

const marked = new Marked({
  gfm: true,
  breaks: true,
});

export default function ChatPanel({ 
  isOpen, 
  onClose, 
  onAddToast 
}) {
  const [messages, setMessages] = React.useState([]);
  const [inputVal, setInputVal] = React.useState('');
  const [isApiKeyConfigured, setIsApiKeyConfigured] = React.useState(true);
  const [apiKeyVal, setApiKeyVal] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  
  const messagesEndRef = React.useRef(null);

  // Fetch chat history and API key configuration state when panel is opened
  React.useEffect(() => {
    if (isOpen) {
      checkApiKeyConfig();
      fetchChatHistory();
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const checkApiKeyConfig = async () => {
    try {
      const res = await fetch('/api/config/DEEPSEEK_KEY');
      if (res.ok) {
        setIsApiKeyConfigured(true);
      } else {
        setIsApiKeyConfigured(false);
      }
    } catch (err) {
      console.error('Error checking API configuration:', err);
    }
  };

  const fetchChatHistory = async () => {
    try {
      const res = await fetch('/api/chat/history');
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Error fetching chat history:', err);
    }
  };

  const handleSaveApiKey = async (e) => {
    e.preventDefault();
    if (!apiKeyVal.trim()) return;

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'DEEPSEEK_KEY', value: apiKeyVal.trim() })
      });

      if (res.ok) {
        setIsApiKeyConfigured(true);
        setApiKeyVal('');
        onAddToast('success', 'DeepSeek API Key configured successfully');
      } else {
        onAddToast('error', 'Failed to configure API key');
      }
    } catch (err) {
      onAddToast('error', 'Failed to configure API key');
    }
  };

  const handleSendMessage = async (text) => {
    const messageToSend = text || inputVal;
    if (!messageToSend.trim() || isLoading) return;

    // optimistic user message update
    const userMsg = { role: 'user', content: messageToSend };
    setMessages(prev => [...prev, userMsg]);
    if (!text) setInputVal('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageToSend.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data]);
      } else {
        const errData = await res.json();
        setMessages(prev => [
          ...prev, 
          { role: 'system-error', content: errData.error || 'Failed to get AI assistant response' }
        ]);
        onAddToast('error', errData.error || 'AI Chat encountered an error');
      }
    } catch (err) {
      setMessages(prev => [
        ...prev, 
        { role: 'system-error', content: 'Connection failed. Ensure the server is running.' }
      ]);
      onAddToast('error', 'Connection failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear your chat history?')) return;

    try {
      const res = await fetch('/api/chat/clear', { method: 'DELETE' });
      if (res.ok) {
        setMessages([]);
        onAddToast('success', 'Chat history cleared');
      } else {
        onAddToast('error', 'Failed to clear chat history');
      }
    } catch (err) {
      onAddToast('error', 'Failed to clear chat history');
    }
  };

  const handleSaveAsNote = async () => {
    if (messages.length === 0) {
      onAddToast('info', 'No message history to save');
      return;
    }

    const noteTitle = window.prompt('Enter title for saved chat note:', 'AI Chat Summary');
    if (noteTitle === null) return; // cancelled

    try {
      const res = await fetch('/api/chat/save-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: noteTitle })
      });

      if (res.ok) {
        onAddToast('success', 'Chat saved to notes workspace');
        // Trigger global reload by sending a custom window event
        window.dispatchEvent(new Event('reload-notes'));
      } else {
        onAddToast('error', 'Failed to save chat as note');
      }
    } catch (err) {
      onAddToast('error', 'Failed to save chat as note');
    }
  };

  const renderBubbleContent = (content) => {
    try {
      return { __html: marked.parse(content || '') };
    } catch (e) {
      return { __html: content || '' };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="chat-panel" role="dialog" aria-modal="true">
      <div className="chat-header">
        <div className="chat-brand">
          <i className="fa-solid fa-robot"></i>
          <span>AI Assistant</span>
        </div>
        <div className="chat-actions">
          <button 
            type="button" 
            id="btn-save-chat" 
            onClick={handleSaveAsNote}
            title="Save chat as note" 
            className="chat-action-btn"
          >
            <i className="fa-regular fa-bookmark"></i>
          </button>
          <button 
            type="button" 
            id="btn-clear-chat" 
            onClick={handleClearHistory}
            title="Clear chat history" 
            className="chat-action-btn"
          >
            <i className="fa-regular fa-trash-can"></i>
          </button>
          <button 
            type="button" 
            id="btn-close-chat" 
            onClick={onClose}
            title="Close chat" 
            className="chat-action-btn"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <i className="fa-solid fa-wand-magic-sparkles"></i>
            <p>I can answer questions based on your notes or assist with coding, summaries, and writing tasks.</p>
            <div className="chat-suggestions">
              <button 
                type="button" 
                className="chat-suggestion-chip" 
                onClick={() => handleSendMessage('What was I doing today?')}
              >
                What was I doing today?
              </button>
              <button 
                type="button" 
                className="chat-suggestion-chip" 
                onClick={() => handleSendMessage('Summarize my notes')}
              >
                Summarize my notes
              </button>
              <button 
                type="button" 
                className="chat-suggestion-chip" 
                onClick={() => handleSendMessage('What should I focus on?')}
              >
                What should I focus on?
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`chat-bubble ${msg.role}`}
            dangerouslySetInnerHTML={msg.role !== 'system-error' ? renderBubbleContent(msg.content) : undefined}
          >
            {msg.role === 'system-error' ? msg.content : null}
          </div>
        ))}

        {isLoading && (
          <div className="chat-bubble assistant">
            <i className="fa-solid fa-ellipsis fa-pulse"></i> Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {!isApiKeyConfigured && (
        <form onSubmit={handleSaveApiKey} className="chat-config-row">
          <div className="chat-config-inner">
            <label>DeepSeek API Key Required</label>
            <div className="chat-config-input-group">
              <input 
                type="password" 
                value={apiKeyVal}
                onChange={(e) => setApiKeyVal(e.target.value)}
                placeholder="sk-..." 
                autoComplete="off"
                required
              />
              <button type="submit" className="chat-config-save-btn">
                Save Key
              </button>
            </div>
          </div>
        </form>
      )}

      <form 
        onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} 
        className="chat-input-row"
      >
        <input 
          type="text" 
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder={isApiKeyConfigured ? "Ask me anything..." : "Configure API key first..."} 
          disabled={!isApiKeyConfigured || isLoading}
          autoComplete="off"
        />
        <button 
          type="submit" 
          className="chat-send-btn"
          disabled={!isApiKeyConfigured || !inputVal.trim() || isLoading}
        >
          <i className="fa-solid fa-paper-plane"></i>
        </button>
      </form>
    </div>
  );
}
