// Client-side user session management to ensure data isolation

export function getUserId(): string {
  // Check if we have a stored user ID
  let userId = localStorage.getItem('wondervoya-user-id');
  
  if (!userId) {
    // Generate a new unique user ID
    userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('wondervoya-user-id', userId);
  }
  
  return userId;
}

export function clearUserId(): void {
  localStorage.removeItem('wondervoya-user-id');
}

export function regenerateUserId(): string {
  clearUserId();
  return getUserId();
}