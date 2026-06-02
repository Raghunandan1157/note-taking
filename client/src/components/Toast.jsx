import React from 'react';

export default function Toast({ toasts, onClose }) {
  return (
    <div className="toast-container" id="toast-container">
      {toasts.map((toast) => {
        // Auto close after 3 seconds
        React.useEffect(() => {
          const timer = setTimeout(() => {
            onClose(toast.id);
          }, 3500);
          return () => clearTimeout(timer);
        }, [toast.id]);

        let iconClass = 'fa-circle-info';
        if (toast.type === 'success') iconClass = 'fa-circle-check';
        if (toast.type === 'error') iconClass = 'fa-circle-xmark';

        return (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <i className={`fa-solid ${iconClass}`}></i>
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
