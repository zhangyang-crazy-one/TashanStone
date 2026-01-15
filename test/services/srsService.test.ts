/**
 * SRS Service Tests
 * test/services/srsService.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SRSService, SRS_INTERVALS } from '../../src/services/srs/srsService';
import { StudyPlan, MistakeRecord } from '../../types';

// Mock localStorage for Node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get store() { return store; }
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

describe('SRS Service', () => {
  let srsService: SRSService;
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value.toString(); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
      get store() { return store; }
    };
  })();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    
    // Clear localStorage first
    localStorage.clear();
    
    // Create fresh instance for each test
    srsService = new SRSService();
    srsService.initialize();
    
    // Double-check that plans are cleared
    if (srsService.getAllPlans().length > 0) {
      // Force clear by reinitializing with empty localStorage
      srsService = new SRSService();
      localStorage.clear();
      srsService.initialize();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with empty plans', () => {
      const plans = srsService.getAllPlans();
      expect(plans).toHaveLength(0);
    });

    it('should load saved plans from localStorage', () => {
      const savedPlans: StudyPlan[] = [
        {
          id: 'test-plan',
          title: 'Test Plan',
          sourceType: 'file',
          sourceId: 'file-1',
          createdDate: Date.now(),
          tasks: [],
          progress: 50
        }
      ];
      localStorage.setItem('neon-study-plans', JSON.stringify(savedPlans));
      
      const freshService = new SRSService();
      freshService.initialize();
      
      const plans = freshService.getAllPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0].id).toBe('test-plan');
    });
  });

  describe('createStudyPlanForFile', () => {
    it('should create a study plan for a file', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test File.md',
        content: 'Test content',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      
      expect(plan).toBeDefined();
      expect(plan.sourceType).toBe('file');
      expect(plan.sourceId).toBe('file-123');
      expect(plan.title).toContain('Test File.md');
      expect(plan.tasks).toHaveLength(SRS_INTERVALS.length);
    });

    it('should set first task as pending', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      
      expect(plan.tasks[0].status).toBe('pending');
      expect(plan.tasks[1].status).toBe('future');
    });

    it('should schedule tasks with correct intervals', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      const now = Date.now();
      
      // Check first interval (5 mins)
      expect(plan.tasks[0].scheduledDate).toBe(now + SRS_INTERVALS[0].ms);
      
      // Check second interval (30 mins)
      expect(plan.tasks[1].scheduledDate).toBe(now + SRS_INTERVALS[1].ms);
    });

    it('should accept custom title', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile, 'Custom Title');
      
      expect(plan.title).toBe('Custom Title');
    });
  });

  describe('createStudyPlanForMistake', () => {
    it('should create a study plan for a mistake', () => {
      const mistake: MistakeRecord = {
        id: 'mistake-123',
        question: 'What is 2+2?',
        userAnswer: '5',
        correctAnswer: '4',
        timestamp: Date.now()
      };

      const plan = srsService.createStudyPlanForMistake(mistake);
      
      expect(plan).toBeDefined();
      expect(plan.sourceType).toBe('mistake');
      expect(plan.sourceId).toBe('mistake-123');
      expect(plan.title).toContain('Mistake Review');
    });

    it('should use quiz title in plan title', () => {
      const mistake: MistakeRecord = {
        id: 'mistake-123',
        question: 'Test question',
        userAnswer: 'Wrong',
        correctAnswer: 'Right',
        timestamp: Date.now(),
        quizTitle: 'Math Quiz'
      };

      const plan = srsService.createStudyPlanForMistake(mistake, 'Math Quiz');
      
      expect(plan.title).toBe('Mistake Review: Math Quiz');
    });
  });

  describe('markTaskComplete', () => {
    it('should mark a task as completed', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      const taskId = plan.tasks[0].id;
      
      const updatedPlan = srsService.markTaskComplete(plan.id, taskId);
      
      expect(updatedPlan).not.toBeNull();
      expect(updatedPlan!.tasks[0].status).toBe('completed');
      expect(updatedPlan!.tasks[0].completedDate).toBeDefined();
    });

    it('should advance next task to pending', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      const taskId = plan.tasks[0].id;
      
      const updatedPlan = srsService.markTaskComplete(plan.id, taskId);
      
      expect(updatedPlan!.tasks[1].status).toBe('pending');
    });

    it('should calculate progress correctly', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      
      // Complete first task
      srsService.markTaskComplete(plan.id, plan.tasks[0].id);
      const planAfterOne = srsService.getPlanById(plan.id)!;
      
      // 8 tasks total, 1 completed = 12.5% -> rounded to 13%
      expect(planAfterOne.progress).toBe(13);
    });

    it('should return null for invalid plan ID', () => {
      const result = srsService.markTaskComplete('invalid-id', 'task-id');
      expect(result).toBeNull();
    });

    it('should return null for invalid task ID', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      const result = srsService.markTaskComplete(plan.id, 'invalid-task-id');
      
      expect(result).toBeNull();
    });
  });

  describe('getTaskStatus', () => {
    it('should return completed for completed tasks', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      srsService.markTaskComplete(plan.id, plan.tasks[0].id);
      
      const updatedPlan = srsService.getPlanById(plan.id)!;
      const status = srsService.getTaskStatus(updatedPlan.tasks[0]);
      
      expect(status).toBe('completed');
    });

    it('should return future for future tasks', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      const status = srsService.getTaskStatus(plan.tasks[1]);
      
      expect(status).toBe('future');
    });

    it('should return pending for current pending tasks', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      const status = srsService.getTaskStatus(plan.tasks[0]);
      
      expect(status).toBe('pending');
    });

    it('should return overdue for past due tasks', () => {
      // Create a plan first to establish scheduledDate based on current time
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      
      // Now advance time past the scheduled date (5 mins interval)
      // The first task is scheduled for 5 minutes after plan creation
      vi.advanceTimersByTime(10 * 60 * 1000); // Advance 10 minutes
      
      const status = srsService.getTaskStatus(plan.tasks[0]);
      
      expect(status).toBe('overdue');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      srsService.createStudyPlanForFile(mockFile);
      srsService.createStudyPlanForFile({ ...mockFile, id: 'file-456' });
      
      const stats = srsService.getStats();
      
      // 2 plans created, each with a pending task scheduled for today
      expect(stats.totalPlans).toBe(2);
      expect(stats.completedPlans).toBe(0);
      expect(stats.todaysTasks).toBe(2); // Both pending tasks are scheduled for today
    });

    it('should count completed plans', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      
      // Complete all tasks
      for (const task of plan.tasks) {
        srsService.markTaskComplete(plan.id, task.id);
      }
      
      const stats = srsService.getStats();
      expect(stats.completedPlans).toBe(1);
    });
  });

  describe('deletePlan', () => {
    it('should delete a plan', () => {
      const mockFile = {
        id: 'file-123',
        name: 'Test.md',
        content: '',
        lastModified: Date.now()
      };

      const plan = srsService.createStudyPlanForFile(mockFile);
      expect(srsService.getAllPlans()).toHaveLength(1);
      
      const result = srsService.deletePlan(plan.id);
      expect(result).toBe(true);
      expect(srsService.getAllPlans()).toHaveLength(0);
    });

    it('should return false for invalid plan ID', () => {
      const result = srsService.deletePlan('invalid-id');
      expect(result).toBe(false);
    });
  });
});
