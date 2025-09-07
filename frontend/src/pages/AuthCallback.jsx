import React, { useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom'; // From React Router

function AuthCallback() {
  const [status, setStatus] = useState('Authenticating...');
  const navigate = useNavigate();

  useEffect(() => {
    // This effect runs only once when the component is first rendered.
    const hash = window.location.hash;
    
    // Check if a hash with a token exists
    if (hash) {
      const urlParams = new URLSearchParams(hash.substring(1)); // Remove the '#'
      const token = urlParams.get('token');

      if (token) {
        console.log("Received JWT from backend:", token);
        try {
          // 1. Decode the token to see its contents (optional, for UI)
          const decodedToken = jwtDecode(token);
          console.log("Decoded JWT payload:", decodedToken);
          // The payload will look like: { githubAccessToken: '...', iat: ..., exp: ... }

          // 2. Store the full, undecoded JWT to be used for API calls
          localStorage.setItem('jwtToken', token);
          
          // 3. Clean the token from the URL bar for security
          window.history.replaceState(null, '', window.location.pathname);
          
          // 4. Redirect the user to their dashboard or a protected page
          setStatus('Authentication successful! Redirecting...');
          // Use a small delay to allow the user to see the success message
          setTimeout(() => {
            navigate('/user'); // Or '/profile', etc.
          }, 1000);

        } catch (error) {
          console.error("Failed to decode or process token:", error);
          setStatus('Authentication failed. Please try again.');
          localStorage.removeItem('jwtToken'); // Clean up bad token
          setTimeout(() => navigate('/login'), 2000);
        }
      } else {
        // No token found in the hash
        setStatus('Invalid authentication redirect.');
        setTimeout(() => navigate('/login'), 2000);
      }
    } else {
        // No hash in the URL at all
        setStatus('No authentication token provided.');
        setTimeout(() => navigate('/login'), 2000);
    }
  }, [navigate]); // Add navigate to dependency array

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Processing Login</h1>
      <p>{status}</p>
      {/* You can add a spinner or loading animation here */}
    </div>
  );
}

export default AuthCallback;