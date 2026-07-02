import { createContext, useContext, useState, useEffect } from 'react';
import { getToken, setToken, removeToken } from '../utils/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(u => {
        if (!u) removeToken();
        setUser(u);
        setLoading(false);
      })
      .catch(() => {
        removeToken();
        setLoading(false);
      });
  }, []);

  function login(token, userData) {
    setToken(token);
    setUser(userData);
  }

  function logout() {
    removeToken();
    setUser(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
