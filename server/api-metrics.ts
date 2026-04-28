/**
 * API Metrics - Performance measurement and comparison
 * Tracks payload sizes, response times, and cache efficiency
 */

export interface PayloadMetrics {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  fieldCount: {
    original: number;
    optimized: number;
  };
}

export interface PerformanceMetrics {
  buildTime: number;
  responseTime: number;
  cacheHit: boolean;
  cacheAge: number;
}

export interface ComparisonReport {
  timestamp: number;
  payloadMetrics: PayloadMetrics;
  performanceMetrics: PerformanceMetrics;
  improvement: {
    sizeReduction: string;
    speedImprovement: string;
    cacheEfficiency: string;
  };
}

export class MetricsCollector {
  private measurements: PerformanceMetrics[] = [];
  private lastOriginalPayload: any = null;
  private lastOptimizedPayload: any = null;

  /**
   * Record original payload for size comparison
   */
  recordOriginalPayload(payload: any): void {
    this.lastOriginalPayload = payload;
  }

  /**
   * Record optimized payload for size comparison
   */
  recordOptimizedPayload(payload: any): void {
    this.lastOptimizedPayload = payload;
  }

  /**
   * Record performance measurement
   */
  recordPerformance(metrics: Omit<PerformanceMetrics, 'cacheHit' | 'cacheAge'>): void {
    this.measurements.push({
      ...metrics,
      cacheHit: true, // Will be updated by cache system
      cacheAge: 0
    });
  }

  /**
   * Generate comparison report
   */
  generateReport(): ComparisonReport | null {
    if (!this.lastOriginalPayload || !this.lastOptimizedPayload || this.measurements.length === 0) {
      return null;
    }

    const originalSize = JSON.stringify(this.lastOriginalPayload).length;
    const optimizedSize = JSON.stringify(this.lastOptimizedPayload).length;
    const compressionRatio = (1 - optimizedSize / originalSize) * 100;

    const avgBuildTime = this.measurements.reduce((sum, m) => sum + m.buildTime, 0) / this.measurements.length;
    const avgResponseTime = this.measurements.reduce((sum, m) => sum + m.responseTime, 0) / this.measurements.length;
    const cacheHitRate = this.measurements.filter(m => m.cacheHit).length / this.measurements.length;

    return {
      timestamp: Date.now(),
      payloadMetrics: {
        originalSize,
        optimizedSize,
        compressionRatio,
        fieldCount: {
          original: this.countFields(this.lastOriginalPayload),
          optimized: this.countFields(this.lastOptimizedPayload)
        }
      },
      performanceMetrics: {
        buildTime: avgBuildTime,
        responseTime: avgResponseTime,
        cacheHit: cacheHitRate > 0.5,
        cacheAge: 0
      },
      improvement: {
        sizeReduction: `${compressionRatio.toFixed(1)}% smaller payload`,
        speedImprovement: `${((avgBuildTime - avgResponseTime) / avgBuildTime * 100).toFixed(1)}% faster response`,
        cacheEfficiency: `${(cacheHitRate * 100).toFixed(1)}% cache hit rate`
      }
    };
  }

  /**
   * Count fields in object recursively
   */
  private countFields(obj: any): number {
    if (!obj || typeof obj !== 'object') return 0;
    
    let count = 0;
    for (const key in obj) {
      count++;
      if (Array.isArray(obj[key])) {
        obj[key].forEach((item: any) => {
          count += this.countFields(item);
        });
      } else if (typeof obj[key] === 'object') {
        count += this.countFields(obj[key]);
      }
    }
    return count;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    if (this.measurements.length === 0) return null;

    const buildTimes = this.measurements.map(m => m.buildTime);
    const responseTimes = this.measurements.map(m => m.responseTime);

    return {
      samples: this.measurements.length,
      buildTime: {
        avg: buildTimes.reduce((a, b) => a + b) / buildTimes.length,
        min: Math.min(...buildTimes),
        max: Math.max(...buildTimes),
        p95: this.percentile(buildTimes, 95)
      },
      responseTime: {
        avg: responseTimes.reduce((a, b) => a + b) / responseTimes.length,
        min: Math.min(...responseTimes),
        max: Math.max(...responseTimes),
        p95: this.percentile(responseTimes, 95)
      }
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(arr: number[], p: number): number {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    if (Number.isInteger(index)) {
      return sorted[index];
    }
    const lower = sorted[Math.floor(index)];
    const upper = sorted[Math.ceil(index)];
    return lower + (upper - lower) * (index - Math.floor(index));
  }
}

// Global metrics collector
export const metricsCollector = new MetricsCollector();
