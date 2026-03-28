import type { AssistantSettingsSurfaceId } from './settingsCatalog';

export const ASSISTANT_SETTINGS_DEFAULTS: {
  surface: AssistantSettingsSurfaceId;
  sectionBySurface: Record<AssistantSettingsSurfaceId, string>;
} = {
  surface: 'operator',
  sectionBySurface: {
    operator: 'runtime',
    notebook: 'workspace',
  },
};
