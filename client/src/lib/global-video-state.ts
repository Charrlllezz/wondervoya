class GlobalVideoState {
  private currentVideoIndex: number;
  private currentTime: number;
  private listeners: Set<() => void> = new Set();

  constructor() {
    // Try to restore video state from localStorage
    const savedIndex = localStorage.getItem('wondervoya-video-index');
    const savedTime = localStorage.getItem('wondervoya-video-time');
    this.currentVideoIndex = savedIndex ? parseInt(savedIndex, 10) : 0;
    this.currentTime = savedTime ? parseFloat(savedTime) : 0;
    console.log(`🎬 GlobalVideoState initialized with video index: ${this.currentVideoIndex}, time: ${this.currentTime}s (from localStorage: ${savedIndex}, ${savedTime})`);
  }

  getCurrentIndex(): number {
    return this.currentVideoIndex;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  setCurrentIndex(index: number): void {
    this.currentVideoIndex = index % 17; // Ensure it wraps around
    localStorage.setItem('wondervoya-video-index', this.currentVideoIndex.toString());
    console.log(`🎬 GlobalVideoState: Set video index to ${this.currentVideoIndex}, saved to localStorage`);
    this.notifyListeners();
  }

  setCurrentTime(time: number): void {
    this.currentTime = time;
    localStorage.setItem('wondervoya-video-time', this.currentTime.toString());
    // Don't notify listeners for time updates to avoid excessive re-renders
  }

  nextVideo(): void {
    this.currentVideoIndex = (this.currentVideoIndex + 1) % 17;
    this.currentTime = 0; // Reset time for new video
    localStorage.setItem('wondervoya-video-index', this.currentVideoIndex.toString());
    localStorage.setItem('wondervoya-video-time', '0');
    console.log(`🎬 GlobalVideoState: Advanced to video index ${this.currentVideoIndex}, saved to localStorage`);
    this.notifyListeners();
  }

  // Reset video to beginning when transitioning to chat
  resetForChatTransition(): void {
    console.log(`🎬 Resetting video to beginning for chat transition (was at ${this.currentVideoIndex + 1})`);
    this.currentVideoIndex = 0;
    this.currentTime = 0;
    localStorage.setItem('wondervoya-video-index', this.currentVideoIndex.toString());
    localStorage.setItem('wondervoya-video-time', '0');
    console.log(`🎬 GlobalVideoState: Reset to video index 0, saved to localStorage`);
    this.notifyListeners();
  }

  // Maintain video state on page navigation (preserve current time)
  maintainStateOnNavigation(): void {
    console.log(`🎬 Maintaining video state on navigation - staying at video ${this.currentVideoIndex + 1} at time ${this.currentTime.toFixed(2)}s`);
    // Just notify listeners to sync, don't change index or time
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }
}

// Export singleton instance
export const globalVideoState = new GlobalVideoState();