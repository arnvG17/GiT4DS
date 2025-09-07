import React from 'react';
import { Outlet } from 'react-router-dom';

export default function App(){
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 20 }}>
      <h1>Hackathon Submission App</h1>
      <Outlet />
    </div>
  );
}
