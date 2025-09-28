import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import Login from './pages/Login';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';



createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
          <Route path="/" element={<App />}>
          <Route index element={<Login />} />
          <Route path="/user" element={<UserDashboard />} />
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="oauth-callback" element={<AuthCallback />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
