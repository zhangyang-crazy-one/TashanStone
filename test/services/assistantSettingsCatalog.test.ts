import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_SETTINGS_CATALOG,
  ASSISTANT_SETTINGS_SURFACE_ORDER,
  resolveAssistantSettingsSurface,
} from '../../src/services/assistant-runtime/settingsCatalog';
import { ASSISTANT_SETTINGS_DEFAULTS } from '../../src/services/assistant-runtime/defaults';
import { translations } from '../../utils/translations';

describe('assistant settings catalog', () => {
  it('exposes operator and notebook top-level surfaces', () => {
    expect(ASSISTANT_SETTINGS_SURFACE_ORDER).toEqual(['operator', 'notebook']);
    expect(Object.keys(ASSISTANT_SETTINGS_CATALOG)).toEqual(['operator', 'notebook']);
    expect(ASSISTANT_SETTINGS_DEFAULTS.surface).toBe('operator');
    expect(ASSISTANT_SETTINGS_DEFAULTS.sectionBySurface).toEqual({
      operator: 'runtime',
      notebook: 'workspace',
    });
  });

  it('keeps the wireframe-aligned section ids for operator and notebook surfaces', () => {
    expect(ASSISTANT_SETTINGS_CATALOG.operator.sections.map(section => section.id)).toEqual([
      'runtime',
      'models',
      'fallback',
      'tools',
      'agents',
      'scheduling',
      'channels',
      'media',
      'safety',
      'observability',
      'ui',
      'keyboard',
      'about',
    ]);

    expect(ASSISTANT_SETTINGS_CATALOG.notebook.sections.map(section => section.id)).toEqual([
      'workspace',
      'editor',
      'preview',
      'links-tags',
      'graph',
      'search-index',
      'study-srs',
      'appearance',
      'shortcuts',
      'voice-ocr',
      'backup',
      'about',
    ]);
  });

  it('resolves English and Chinese descriptor copy while marking deferred sections explicitly', () => {
    expect(translations.en.assistantSettings).toBeDefined();
    expect(translations.zh.assistantSettings).toBeDefined();

    const deferredSections = Object.values(ASSISTANT_SETTINGS_CATALOG)
      .flatMap(surface => surface.sections)
      .filter(section => section.phase !== 'phase-1');

    expect(deferredSections.length).toBeGreaterThan(0);

    for (const language of ['en', 'zh'] as const) {
      for (const surfaceId of ASSISTANT_SETTINGS_SURFACE_ORDER) {
        const resolvedSurface = resolveAssistantSettingsSurface(language, surfaceId);

        expect(resolvedSurface.title.length).toBeGreaterThan(0);
        expect(resolvedSurface.description.length).toBeGreaterThan(0);

        resolvedSurface.sections.forEach(section => {
          expect(section.title.length).toBeGreaterThan(0);
          expect(section.help.length).toBeGreaterThan(0);
          expect(section.phaseLabel.length).toBeGreaterThan(0);

          if (section.shortcut) {
            expect(section.shortcut.label.length).toBeGreaterThan(0);
            expect(section.shortcut.defaultBinding.length).toBeGreaterThan(0);
          }

          if (section.phase === 'deferred') {
            if (language === 'en') {
              expect(section.phaseLabel).toContain('Later');
            } else {
              expect(section.phaseLabel).toContain('后续');
            }
          }
        });
      }
    }
  });
});
