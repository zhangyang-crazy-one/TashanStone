import { useEffect, useState } from 'react';

import type { MistakeRecord } from '../../types';
import { srsService } from '../../src/services/srs/srsService';

const STORAGE_KEY = 'neon-quiz-mistakes';

const loadMistakes = (): MistakeRecord[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as MistakeRecord[];
    const seen = new Set<string>();
    const deduped = parsed.filter(record => {
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    });
    if (deduped.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
    }
    return deduped;
  } catch (error) {
    console.error('[QuizPanel] Failed to load mistakes', error);
    return [];
  }
};

export const useQuizMistakes = (quizTitle: string) => {
  const [showMistakes, setShowMistakes] = useState(false);
  const [savedMistakes, setSavedMistakes] = useState<MistakeRecord[]>(() => loadMistakes());

  useEffect(() => {
    try {
      srsService.initialize();
    } catch (error) {
      console.error('[QuizPanel] Failed to initialize SRS service:', error);
    }
  }, []);

  const persistMistakes = (mistakes: MistakeRecord[]) => {
    setSavedMistakes(mistakes);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mistakes));
  };

  const saveMistake = (record: MistakeRecord) => {
    const existingIndex = savedMistakes.findIndex(m => m.id === record.id);
    let updated: MistakeRecord[];

    if (existingIndex !== -1) {
      updated = [...savedMistakes];
      updated[existingIndex] = record;
    } else {
      updated = [record, ...savedMistakes];
      try {
        srsService.createStudyPlanForMistake(record, quizTitle);
      } catch (error) {
        console.error('[QuizPanel] Failed to create study plan for mistake:', error);
      }
    }

    persistMistakes(updated);
  };

  const deleteMistake = (id: string) => {
    const updated = savedMistakes.filter(m => m.id !== id);
    persistMistakes(updated);
  };

  return {
    showMistakes,
    setShowMistakes,
    savedMistakes,
    saveMistake,
    deleteMistake
  };
};
