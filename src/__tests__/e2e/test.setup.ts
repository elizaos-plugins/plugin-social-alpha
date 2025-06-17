import { vi } from 'vitest';
import type { IAgentRuntime, Service } from '@elizaos/core';

// This is a simplified mock runtime for now.
// We can expand it as needed.
export function createMockRuntime(initialSettings: Record<string, any> = {}): IAgentRuntime {
  const services = new Map<string, Service>();
  const settings = new Map<string, any>(Object.entries(initialSettings));
  const cache = new Map<string, any>();

  return {
    getService: <T extends Service>(name: string): T | undefined => {
      return services.get(name) as T | undefined;
    },
    registerService: (name: string, service: Service) => {
      services.set(name, service);
    },
    getSetting: vi.fn((key: string) => settings.get(key)),
    getCache: vi.fn(async (key: string) => cache.get(key)),
    setCache: vi.fn(async (key: string, value: any) => cache.set(key, value)),
    registerTaskWorker: vi.fn(),
    // Add other IAgentRuntime methods as needed by your tests
    // For now, we'll mock them with vitest.
    getComponent: vi.fn(),
    updateComponent: vi.fn(),
    createComponent: vi.fn(),
    deleteComponent: vi.fn(),
    findComponents: vi.fn(),
    getAgent: vi.fn(),
    getDb: vi.fn(),
    getUserId: vi.fn(),
    getAgentId: vi.fn(),
    createUniqueUuid: vi.fn((runtime, seed) => `mock-uuid-for-${seed}`),
    ensureWorldExists: vi.fn(),
    ensureRoomExists: vi.fn(),
  } as unknown as IAgentRuntime;
} 