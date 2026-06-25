import React from 'react';

export default function AdminPanel({ currentUser }) {
  return (
    <div style={{ padding: '20px' }}>
      <h1>👑 Admin Dashboard</h1>
      <p>Welcome, {currentUser?.full_name}. This screen will hold the master organizational ledger.</p>
    </div>
  );
}