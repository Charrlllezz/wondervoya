
export class VideoPreloader {
  private static instance: VideoPreloader;
  private preloadedVideos: Map<string, HTMLVideoElement> = new Map();
  private loadingPromises: Map<string, Promise<void>> = new Map();
  private maxConcurrentLoads = 3;
  private currentLoads = 0;
  private loadQueue: Array<{ src: string; priority: number; resolve: () => void; reject: (error: Error) => void }> = [];

  private constructor() {}

  static getInstance(): VideoPreloader {
    if (!VideoPreloader.instance) {
      VideoPreloader.instance = new VideoPreloader();
    }
    return VideoPreloader.instance;
  }

  async preloadVideo(src: string, priority: number = 5): Promise<void> {
    // Return existing promise if already loading
    if (this.loadingPromises.has(src)) {
      return this.loadingPromises.get(src)!;
    }

    // Return immediately if already preloaded
    if (this.preloadedVideos.has(src)) {
      return Promise.resolve();
    }

    const loadPromise = new Promise<void>((resolve, reject) => {
      if (this.currentLoads >= this.maxConcurrentLoads) {
        // Add to queue
        this.loadQueue.push({ src, priority, resolve, reject });
        // Sort queue by priority (lower number = higher priority)
        this.loadQueue.sort((a, b) => a.priority - b.priority);
      } else {
        this.loadVideoNow(src, resolve, reject);
      }
    });

    this.loadingPromises.set(src, loadPromise);
    return loadPromise;
  }

  private loadVideoNow(src: string, resolve: () => void, reject: (error: Error) => void): void {
    this.currentLoads++;
    
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;

    const cleanup = () => {
      this.currentLoads--;
      this.loadingPromises.delete(src);
      this.processQueue();
    };

    const onLoad = () => {
      console.log(`✅ VideoPreloader: Successfully preloaded ${src}`);
      this.preloadedVideos.set(src, video);
      cleanup();
      resolve();
    };

    const onError = (error: Event) => {
      console.error(`❌ VideoPreloader: Failed to preload ${src}:`, error);
      cleanup();
      reject(new Error(`Failed to preload video: ${src}`));
    };

    video.addEventListener('loadeddata', onLoad, { once: true });
    video.addEventListener('error', onError, { once: true });
    
    // Start loading
    video.load();
  }

  private processQueue(): void {
    if (this.loadQueue.length === 0 || this.currentLoads >= this.maxConcurrentLoads) {
      return;
    }

    const next = this.loadQueue.shift()!;
    this.loadVideoNow(next.src, next.resolve, next.reject);
  }

  getPreloadedVideo(src: string): HTMLVideoElement | null {
    return this.preloadedVideos.get(src) || null;
  }

  clearCache(): void {
    this.preloadedVideos.clear();
    this.loadingPromises.clear();
    this.loadQueue = [];
  }

  getStats(): { preloaded: number; loading: number; queued: number } {
    return {
      preloaded: this.preloadedVideos.size,
      loading: this.currentLoads,
      queued: this.loadQueue.length
    };
  }
}

export const videoPreloader = VideoPreloader.getInstance();
