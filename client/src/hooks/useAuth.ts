import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from 'react';

export function useAuth() {
  const [authMethod, setAuthMethod] = useState<'authenticated' | 'guest' | 'pending'>('guest');

  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: authMethod !== 'guest',
  });

  // Check localStorage for auth method preference
  useEffect(() => {
    const storedAuthMethod = localStorage.getItem('authMethod');
    if (storedAuthMethod === 'guest') {
      setAuthMethod('guest');
    } else if (user) {
      setAuthMethod('authenticated');
      localStorage.setItem('authMethod', 'authenticated');
    } else if (!isLoading && !user) {
      // For now, default to guest mode to avoid OAuth issues
      setAuthMethod('guest');
      localStorage.setItem('authMethod', 'guest');
    }
  }, [user, isLoading]);

  // Additional failsafe - default to guest mode after 500ms if still pending
  useEffect(() => {
    if (authMethod === 'pending') {
      const timeout = setTimeout(() => {
        setAuthMethod('guest');
        localStorage.setItem('authMethod', 'guest');
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [authMethod]);

  const signInAsGuest = () => {
    setAuthMethod('guest');
    localStorage.setItem('authMethod', 'guest');
  };

  const signOut = () => {
    localStorage.removeItem('authMethod');
    setAuthMethod('pending');
    window.location.href = '/api/auth/logout';
  };

  return {
    user,
    isLoading: isLoading && authMethod !== 'guest',
    isAuthenticated: !!user,
    isGuest: authMethod === 'guest',
    needsAuth: authMethod === 'pending',
    signInAsGuest,
    signOut,
    authMethod,
  };
}