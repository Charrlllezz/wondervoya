// Memory management for Phase 2 performance improvements
interface MemoryStats {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

class MemoryManager {
  private maxMessages = 50; // Limit conversation history
  private maxCacheSize = 50; // Limit cached API responses
  private cleanupInterval: NodeJS.Timeout | null = null;
  private memoryThreshold = 100 * 1024 * 1024; // 100MB threshold

  constructor() {
    this.startPeriodicCleanup();
    this.monitorMemoryUsage();
  }

  // Limit conversation messages to prevent memory bloat
  limitMessages<T extends { id: string; timestamp?: string }>(
    messages: T[], 
    maxCount: number = this.maxMessages
  ): T[] {
    if (messages.length <= maxCount) {
      return messages;
    }

    // Keep the most recent messages
    return messages.slice(-maxCount);
  }

  // Clean up old data based on age and usage
  cleanupOldData(): void {
    // Clear expired cache entries
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Clean localStorage of old data
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('chat-') || key?.startsWith('temp-')) {
          try {
            const item = JSON.parse(localStorage.getItem(key) || '{}');
            if (item.timestamp && item.timestamp < oneHourAgo) {
              keysToRemove.push(key);
            }
          } catch {
            // Remove invalid entries
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));

      if (keysToRemove.length > 0) {
        console.log(`🧹 Cleaned up ${keysToRemove.length} old localStorage entries`);
      }
    }
  }

  // Get current memory usage
  getMemoryUsage(): MemoryStats | null {
    if ('memory' in performance && (performance as any).memory) {
      return (performance as any).memory;
    }
    return null;
  }

  // Check if memory usage is high
  isMemoryHigh(): boolean {
    const memory = this.getMemoryUsage();
    return memory ? memory.usedJSHeapSize > this.memoryThreshold : false;
  }

  // Force garbage collection if available
  forceGarbageCollection(): void {
    if ('gc' in window && typeof (window as any).gc === 'function') {
      (window as any).gc();
      console.log('🗑️ Forced garbage collection');
    }
  }

  // Optimize component state for memory efficiency
  optimizeComponentState<T extends Record<string, any>>(state: T): T {
    const optimized = { ...state };

    // Remove undefined values
    Object.keys(optimized).forEach(key => {
      if (optimized[key] === undefined) {
        delete optimized[key];
      }
    });

    return optimized;
  }

  // Debounce function to reduce excessive calls
  debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;

    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Start periodic cleanup
  private startPeriodicCleanup(): void {
    // Clean up every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();

      if (this.isMemoryHigh()) {
        console.warn('⚠️ High memory usage detected, running cleanup');
        this.forceGarbageCollection();
      }
    }, 10 * 60 * 1000);
  }

  // Monitor memory usage
  private monitorMemoryUsage(): void {
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const memory = this.getMemoryUsage();
        if (memory) {
          const usedMB = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
          const limitMB = (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
          console.log(`📊 Memory: ${usedMB}MB / ${limitMB}MB`);
        }
      }, 30000); // Log every 30 seconds in development
    }
  }

  // Cleanup resources
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Global memory manager instance
export const memoryManager = new MemoryManager();

// Memory-optimized hooks
import { useState, useCallback } from 'react';

export function useMemoryOptimizedState<T>(
  initialState: T
): [T, (state: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState(initialState);

  const optimizedSetState = useCallback((newState: T | ((prev: T) => T)) => {
    setState(prev => {
      const next = typeof newState === 'function' ? (newState as any)(prev) : newState;
      return memoryManager.optimizeComponentState(next);
    });
  }, []);

  return [state, optimizedSetState];
}