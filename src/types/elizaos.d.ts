declare module '@elizaos/core' {
  export type UUID = string;
  
  export interface Memory {
    id: UUID;
    entityId: UUID;
    roomId: UUID;
    content: {
      text: string;
      name?: string;
      [key: string]: any;
    };
    embedding?: number[];
    createdAt: number;
    metadata?: Record<string, any>;
  }

  export interface Entity {
    id: UUID;
    names?: string[];
    [key: string]: any;
  }

  export interface Room {
    id: UUID;
    name?: string;
    [key: string]: any;
  }

  export interface World {
    id: UUID;
    name?: string;
    [key: string]: any;
  }

  export interface Component {
    id: UUID;
    entityId: UUID;
    agentId: UUID;
    worldId: UUID;
    roomId: UUID;
    sourceEntityId: UUID;
    type: string;
    createdAt: number;
    data: Record<string, any>;
  }

  export interface Task {
    id: UUID;
    name: string;
    description?: string;
    metadata?: Record<string, any>;
    [key: string]: any;
  }

  export interface Content {
    text: string;
    [key: string]: any;
  }

  export interface IAgentRuntime {
    agentId: UUID;
    character?: any;
    getSetting(key: string): string | undefined;
    getCache<T>(key: string): Promise<T | null>;
    setCache<T>(key: string, value: T): Promise<void>;
    createMemory(memory: Memory, tableName?: string, unique?: boolean): Promise<void>;
    searchMemories(params: {
      tableName: string;
      embedding: number[];
      match_threshold: number;
      count: number;
    }): Promise<Memory[]>;
    getMemories(params: {
      tableName: string;
      roomId?: UUID;
      count?: number;
      unique?: boolean;
    }): Promise<Memory[]>;
    useModel(modelType: ModelType, input: any): Promise<any>;
    getComponent(
      componentId: UUID,
      type: string,
      worldId: UUID,
      agentId?: UUID
    ): Promise<Component | null>;
    createComponent(component: Component): Promise<void>;
    updateComponent(component: Component): Promise<void>;
    deleteComponent?(componentId: UUID): Promise<void>;
    deleteTask(taskId: UUID): Promise<void>;
    createTask(task: Partial<Task>): Promise<void>;
    registerTaskWorker(worker: {
      name: string;
      execute: (runtime: IAgentRuntime, options: any, task: Task) => Promise<void>;
    }): void;
    getEntityById(entityId: UUID): Promise<Entity | null>;
    ensureWorldExists(world: Partial<World>): Promise<void>;
    ensureRoomExists(room: Partial<Room>): Promise<void>;
    getService<T extends Service>(name: string): T | null;
    getParticipantUserState?(userId: UUID): Promise<string>;
    getAllWorlds?(): Promise<World[]>;
    createEntity?(entity: Entity): Promise<void>;
    createRoom?(room: Room): Promise<void>;
    ensureParticipantInRoom?(userId: UUID, roomId: UUID): Promise<void>;
    emitEvent?(eventType: EventType, data: any): void;
  }

  export enum ModelType {
    TEXT_EMBEDDING = 'TEXT_EMBEDDING',
    TEXT_LARGE = 'TEXT_LARGE',
  }

  export enum ChannelType {
    API = 'API',
    DISCORD = 'DISCORD',
    TELEGRAM = 'TELEGRAM',
    GROUP = 'GROUP',
    DM = 'DM',
  }

  export enum EventType {
    MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  }

  export class Service {
    protected runtime: IAgentRuntime;
    constructor(runtime: IAgentRuntime);
    static serviceType?: string;
    stop?(): Promise<void>;
  }

  export interface TestCase {
    name: string;
    description?: string;
    fn: (runtime: IAgentRuntime) => Promise<void>;
  }

  export interface TestSuite {
    name: string;
    description?: string;
    tests: TestCase[];
  }

  export interface Route {
    type: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    handler: (req: any, res: any, runtime: IAgentRuntime) => Promise<void> | void;
    name?: string;
    public?: boolean;
  }

  export interface Plugin {
    name: string;
    description?: string;
    config?: Record<string, string>;
    init?: (config: Record<string, string>, runtime?: IAgentRuntime) => Promise<void> | void;
    services?: typeof Service[];
    routes?: Route[];
    events?: EventHandlerMap;
    tests?: TestSuite[];
  }

  export type EventHandlerMap = Record<string, any>;

  export interface MessagePayload {
    message: {
      id: UUID;
      senderId: UUID;
      agentId: UUID;
      worldId: UUID;
      roomId: UUID;
      text: string;
      timestamp: number;
    };
  }

  export type HandlerCallback = (response: any, metadata?: Record<string, any>) => Promise<void>;

  export const logger: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug: (...args: any[]) => void;
  };

  export function asUUID(value: string): UUID;
  export function createUniqueUuid(runtime: IAgentRuntime, seed: string): UUID;
  export function parseJSONObjectFromText(text: string): any;

  export type MemoryMetadata = Record<string, any>;
  export type ModelTypeName = string;
  export type MessageReceivedHandlerParams = any;
  export const shouldRespondTemplate: string;
  export function truncateToCompleteSentence(text: string): string;
} 