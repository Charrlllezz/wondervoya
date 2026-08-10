// Server-side performance monitoring for Phase 2
import { logger } from './logger';

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

class PerformanceLogger {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 1000;

  // Time an operation
  async timeOperation<T>(
    operation: string, 
    fn: () => Promise<T>, 
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      
      this.addMetric({
        operation,
        duration,
        timestamp: new Date(),
        metadata
      });
      
      // Log slow operations
      if (duration > 1000) {
        logger.warn(`⚠️ Slow operation: ${operation} took ${duration.toFixed(2)}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      this.addMetric({
        operation: `${operation}_error`,
        duration,
        timestamp: new Date(),
        metadata: { ...metadata, error: (error as Error).message }
      });
      
      throw error;
    }
  }

  // Add a metric
  private addMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  // Get performance statistics
  getStats(operation?: string) {
    const relevantMetrics = operation 
      ? this.metrics.filter(m => m.operation === operation)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return null;
    }

    const durations = relevantMetrics.map(m => m.duration);
    const sum = durations.reduce((a, b) => a + b, 0);
    
    return {
      operation: operation || 'all',
      count: relevantMetrics.length,
      avgDuration: sum / relevantMetrics.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p95Duration: this.getPercentile(durations, 95),
      lastExecuted: relevantMetrics[relevantMetrics.length - 1]?.timestamp
    };
  }

  // Get all operation stats
  getAllStats() {
    const operations = Array.from(new Set(this.metrics.map(m => m.operation)));
    return operations.map(op => this.getStats(op));
  }

  private getPercentile(arr: number[], percentile: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  // Log periodic performance summary
  logSummary() {
    const stats = this.getAllStats();
    if (stats.length === 0) return;

    logger.log('📊 Performance Summary:');
    stats.forEach(stat => {
      if (stat && stat.count > 0) {
        logger.log(`  ${stat.operation}: ${stat.avgDuration.toFixed(2)}ms avg (${stat.count} calls)`);
      }
    });
  }

  // Clear old metrics
  cleanup() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp > oneHourAgo);
  }
}

export const performanceLogger = new PerformanceLogger();

// Auto-cleanup every hour
setInterval(() => {
  performanceLogger.cleanup();
  performanceLogger.logSummary();
}, 60 * 60 * 1000);