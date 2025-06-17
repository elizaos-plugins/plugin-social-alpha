import type { IAgentRuntime, UUID, Entity, Room, World, Memory } from '@elizaos/core';
import { asUUID, createUniqueUuid, logger, ChannelType, EventType } from '@elizaos/core';
import { v4 as uuid } from 'uuid';
import { strict as assert } from 'node:assert';

// Define Content type locally if not exported from core
type Content = {
  text: string;
  name?: string;
};

export async function setupScenario(
  runtime: IAgentRuntime
): Promise<{ user: Entity; room: Room; world: World }> {
  assert(runtime.agentId, 'Runtime must have an agentId to run a scenario');

  const user: Entity = {
    id: asUUID(uuid()),
    names: ['Test User'],
    agentId: runtime.agentId,
    metadata: { type: 'user' },
  };

  // Create entities in database
  if (runtime.createEntity) {
    await runtime.createEntity(user);
  }

  const world: World = {
    id: asUUID(uuid()),
    agentId: runtime.agentId,
    name: 'E2E Test World',
    serverId: 'e2e-test-server',
    metadata: {
      ownership: {
        ownerId: user.id,
      },
    },
  };
  await runtime.ensureWorldExists(world);

  // Create and setup room
  const room: Room = {
    id: asUUID(uuid()),
    name: 'Test DM Room',
    type: ChannelType.DM,
    source: 'e2e-test',
    worldId: world.id,
    serverId: world.serverId,
  };

  logger.info('[TestUtil] Creating room...', { roomId: room.id });
  if (runtime.createRoom) {
    await runtime.createRoom(room);
  }

  if (runtime.ensureParticipantInRoom) {
    await runtime.ensureParticipantInRoom(runtime.agentId, room.id);
    await runtime.ensureParticipantInRoom(user.id, room.id);
  }

  return { user, room, world };
}

export function sendMessageAndWaitForResponse(
  runtime: IAgentRuntime,
  room: Room,
  user: Entity,
  text: string
): Promise<Content> {
  return new Promise((resolve) => {
    assert(runtime.agentId, 'Runtime must have an agentId to send a message');
    assert(user.id, 'User must have an id to send a message');

    const message: Memory = {
      id: createUniqueUuid(runtime, `${user.id}-${Date.now()}`),
      entityId: user.id,
      roomId: room.id,
      content: {
        text,
      },
      createdAt: Date.now(),
    };

    const callback = (responseContent: Content) => {
      resolve(responseContent);
    };

    if (runtime.emitEvent) {
      runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
        runtime,
        message,
        callback,
      });
    } else {
      // Fallback if emitEvent is not available
      resolve({ text: 'emitEvent not available' });
    }
  });
} 