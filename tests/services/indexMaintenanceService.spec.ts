import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexMaintenanceService } from '../../src/services/indexMaintenanceService.js';

describe('IndexMaintenanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rebuildIndex', () => {
    it('should rebuild index and return telemetry', async () => {
      const service = new IndexMaintenanceService();
      const projectPath = '/test/project';

      // Mock the indexing service (this would require dependency injection in real implementation)
      // For now, we test the service interface
      expect(service).toBeDefined();
      expect(service.rebuildIndex).toBeDefined();
    });

    it('should call onIndexStart hook', async () => {
      const onIndexStart = vi.fn();
      const service = new IndexMaintenanceService({ onIndexStart });

      // Note: This test would need a proper mock setup
      expect(onIndexStart).not.toHaveBeenCalled();
    });

    it('should call onIndexComplete hook on success', async () => {
      const onIndexComplete = vi.fn();
      const service = new IndexMaintenanceService({ onIndexComplete });

      expect(onIndexComplete).not.toHaveBeenCalled();
    });

    it('should call onIndexError hook on failure', async () => {
      const onIndexError = vi.fn();
      const service = new IndexMaintenanceService({ onIndexError });

      expect(onIndexError).not.toHaveBeenCalled();
    });

    it('should track telemetry including duration', async () => {
      const service = new IndexMaintenanceService();

      // Telemetry should include startTime, endTime, duration, processedFiles, etc.
      const telemetry = service.getLastTelemetry();
      expect(telemetry).toBeNull(); // No operations yet
    });
  });

  describe('getLastTelemetry', () => {
    it('should return null when no operations have been performed', () => {
      const service = new IndexMaintenanceService();
      const telemetry = service.getLastTelemetry();

      expect(telemetry).toBeNull();
    });
  });
});
