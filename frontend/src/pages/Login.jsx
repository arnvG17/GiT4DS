import React from 'react';

const BACKEND = import.meta.env.VITE_BACKEND || 'https://localhost:5000';

export default function Login(){
  const onUser = () => {
    // ideally collect team name first; for simplicity we open an input prompt
    const teamName = prompt('Team name (optional)') || '';
    localStorage.setItem("teamName", teamName);
    const url = `${BACKEND}/auth/github${teamName ? `?teamName=${encodeURIComponent(teamName)}` : ''}`;
    window.location.href = url; 
  };
  const onAdmin = () => {
    window.location.href = `${BACKEND}/auth/google`;
  };
  function logout() {
    localStorage.removeItem("token");
    localStorage.clear();
    sessionStorage.clear();

    console.log(localStorage.getItem("token")); // or sessionStorage, depending on what you use
     // redirect to login page
  }
  
  return (
    <div>
      <p>Login as:</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onUser}>User (GitHub)</button>
        <button onClick={onAdmin}>Admin (Google)</button>
        <button onClick={logout}>LOGOUT</button>
      </div>
    </div>
  );
}
