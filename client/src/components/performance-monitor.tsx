import { useEffect, useState } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  componentCount: number;
}

export function usePerformanceMonitor(componentName: string) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    memoryUsage: 0,
    componentCount: 0
  });

  useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Get memory usage if available
      const memoryInfo = (performance as any).memory;
      const memoryUsage = memoryInfo ? memoryInfo.usedJSHeapSize / 1024 / 1024 : 0;
      
      if (process.env.NODE_ENV === 'development') {
        console.group(`📊 Performance: ${componentName}`);
        console.log(`Render time: ${renderTime.toFixed(2)}ms`);
        if (memoryUsage) console.log(`Memory: ${memoryUsage.toFixed(2)}MB`);
        console.groupEnd();
      }
      
      setMetrics({
        renderTime,
        memoryUsage,
        componentCount: document.querySelectorAll('[data-component]').length
      });
    };
  }, [componentName]);

  return metrics;
}

// Production-safe console replacement
export const devLog = {
  log: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  },
  error: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.error(...args);
    }
  },
  warn: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(...args);
    }
  }
};