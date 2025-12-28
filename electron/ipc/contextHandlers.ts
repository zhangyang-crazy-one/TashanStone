import { ipcMain } from 'electron';
import { chatRepository, ChatMessage } from '../database/repositories/chatRepository.js';
import { Checkpoint, CompactedSession } from '../database/repositories/chatRepository.js';
import { logger } from '../utils/logger.js';

export interface SerializableCheckpoint {
  id: string;
  session_id: string;
  name: string;
  message_count: number;
  token_count: number;
  summary: string;
  created_at: number;
}

export interface SerializableCompactedSession {
  id: string;
  session_id: string;
  summary: string;
  key_topics: string[];
  decisions: string[];
  message_start: number;
  message_end: number;
  created_at: number;
}

export function registerContextHandlers(): void {
  ipcMain.handle('context:getMessages', async (_, sessionId: string) => {
    try {
      const messages = chatRepository.getAll(sessionId);
      return { success: true, messages };
    } catch (error) {
      logger.error('Failed to get context messages', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:addMessage', async (_, sessionId: string, message: ChatMessage) => {
    try {
      chatRepository.add(message, sessionId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to add context message', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:addMessages', async (_, sessionId: string, messages: ChatMessage[]) => {
    try {
      chatRepository.addBatch(messages, sessionId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to add context messages batch', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:clear', async (_, sessionId: string) => {
    try {
      chatRepository.clear(sessionId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear context', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:updateMessageCompression', async (_, messageId: string, updates: any) => {
    try {
      chatRepository.updateMessageCompression(messageId, updates);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update message compression', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:markMessagesAsCompacted', async (_, messageIds: string[], summaryId: string) => {
    try {
      chatRepository.markMessagesAsCompacted(messageIds, summaryId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to mark messages as compacted', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:createCheckpoint', async (_, sessionId: string, name: string, messages: any[]) => {
    try {
      const tokenCount = messages.length * 200;
      const checkpoint: Checkpoint = {
        id: `cp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        session_id: sessionId,
        name,
        message_count: messages.length,
        token_count: tokenCount,
        summary: `检查点 - ${messages.length} 条消息`,
        messages_snapshot: JSON.stringify(messages),
        created_at: Date.now(),
      };
      chatRepository.saveCheckpoint(checkpoint);
      return { success: true, checkpoint };
    } catch (error) {
      logger.error('Failed to create checkpoint', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:getCheckpoints', async (_, sessionId: string) => {
    try {
      const checkpoints = chatRepository.listCheckpoints(sessionId);
      return { success: true, checkpoints };
    } catch (error) {
      logger.error('Failed to get checkpoints', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:getCheckpoint', async (_, checkpointId: string) => {
    try {
      const checkpoint = chatRepository.getCheckpoint(checkpointId);
      if (checkpoint) {
        return { success: true, checkpoint, messages: JSON.parse(checkpoint.messages_snapshot) };
      }
      return { success: false, error: 'Checkpoint not found' };
    } catch (error) {
      logger.error('Failed to get checkpoint', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:restoreCheckpoint', async (_, checkpointId: string) => {
    try {
      const checkpoint = chatRepository.getCheckpoint(checkpointId);
      if (!checkpoint) {
        return { success: false, error: 'Checkpoint not found' };
      }
      const messages = JSON.parse(checkpoint.messages_snapshot);
      return { success: true, checkpoint, messages };
    } catch (error) {
      logger.error('Failed to restore checkpoint', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:deleteCheckpoint', async (_, checkpointId: string) => {
    try {
      const deleted = chatRepository.deleteCheckpoint(checkpointId);
      return { success: true, deleted: deleted > 0 };
    } catch (error) {
      logger.error('Failed to delete checkpoint', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:saveCompactedSession', async (_, session: SerializableCompactedSession) => {
    try {
      chatRepository.saveCompactedSession({
        id: session.id,
        session_id: session.session_id,
        summary: session.summary,
        key_topics: JSON.stringify(session.key_topics),
        decisions: JSON.stringify(session.decisions),
        message_start: session.message_start,
        message_end: session.message_end,
        created_at: session.created_at,
      });
      return { success: true };
    } catch (error) {
      logger.error('Failed to save compacted session', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:getCompactedSessions', async (_, sessionId: string) => {
    try {
      const sessions = chatRepository.getCompactedSessions(sessionId);
      const serialized = sessions.map(s => ({
        id: s.id,
        session_id: s.session_id,
        summary: s.summary,
        key_topics: JSON.parse(s.key_topics || '[]'),
        decisions: JSON.parse(s.decisions || '[]'),
        message_start: s.message_start,
        message_end: s.message_end,
        created_at: s.created_at,
      }));
      return { success: true, sessions: serialized };
    } catch (error) {
      logger.error('Failed to get compacted sessions', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('context:deleteCompactedSessions', async (_, sessionId: string) => {
    try {
      const deleted = chatRepository.deleteCompactedSession(sessionId);
      return { success: true, deleted };
    } catch (error) {
      logger.error('Failed to delete compacted sessions', error);
      return { success: false, error: String(error) };
    }
  });

  logger.info('Context IPC handlers registered');
}
