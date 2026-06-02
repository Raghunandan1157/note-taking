import React from 'react';

export default function SyncIndicator({ isSyncing }) {
  return (
    <div className={`sync-chip ${isSyncing ? 'syncing' : ''}`} id="last-sync">
      <i className={`fa-solid ${isSyncing ? 'fa-rotate' : 'fa-cloud-arrow-up'}`}></i>
      <span>{isSyncing ? 'Syncing' : 'Synced'}</span>
    </div>
  );
}
