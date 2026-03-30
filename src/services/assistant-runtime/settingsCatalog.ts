import { translations, type Language } from '@/utils/translations';

export type AssistantSettingsSurfaceId = 'operator' | 'notebook';
export type AssistantSettingsSectionPhase = 'phase-1' | 'deferred';

export interface AssistantSettingsShortcutDescriptor {
  id: string;
  labelKey: string;
  defaultBinding: string;
}

export interface AssistantSettingsSectionDescriptor {
  id: string;
  titleKey: string;
  helpKey: string;
  phase: AssistantSettingsSectionPhase;
  wireframeRef: {
    en: string;
    zh: string;
  };
  shortcut?: AssistantSettingsShortcutDescriptor;
}

export interface AssistantSettingsSurfaceDescriptor {
  id: AssistantSettingsSurfaceId;
  titleKey: string;
  descriptionKey: string;
  defaultSectionId: string;
  sections: AssistantSettingsSectionDescriptor[];
}

export interface ResolvedAssistantSettingsShortcut {
  id: string;
  label: string;
  defaultBinding: string;
}

export interface ResolvedAssistantSettingsSection {
  id: string;
  title: string;
  help: string;
  phase: AssistantSettingsSectionPhase;
  available: boolean;
  phaseLabel: string;
  wireframeRef: AssistantSettingsSectionDescriptor['wireframeRef'];
  shortcut?: ResolvedAssistantSettingsShortcut;
}

export interface ResolvedAssistantSettingsSurface {
  id: AssistantSettingsSurfaceId;
  title: string;
  description: string;
  defaultSectionId: string;
  sections: ResolvedAssistantSettingsSection[];
}

export const ASSISTANT_SETTINGS_SURFACE_ORDER = ['operator', 'notebook'] as const satisfies readonly AssistantSettingsSurfaceId[];

const phaseLabelKeyByPhase: Record<AssistantSettingsSectionPhase, string> = {
  'phase-1': 'assistantSettings.phaseLabels.phase1Ready',
  deferred: 'assistantSettings.phaseLabels.laterPhase',
};

export function isAssistantSettingsSectionAvailable(phase: AssistantSettingsSectionPhase): boolean {
  return phase === 'phase-1';
}

const operatorSections: AssistantSettingsSectionDescriptor[] = [
  {
    id: 'runtime',
    titleKey: 'assistantSettings.operator.sections.runtime.title',
    helpKey: 'assistantSettings.operator.sections.runtime.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Operator Settings - Runtime', zh: '操作员设置 - 运行时' },
  },
  {
    id: 'models',
    titleKey: 'assistantSettings.operator.sections.models.title',
    helpKey: 'assistantSettings.operator.sections.models.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Operator Settings - Models', zh: '操作员设置 - 模型' },
  },
  {
    id: 'fallback',
    titleKey: 'assistantSettings.operator.sections.fallback.title',
    helpKey: 'assistantSettings.operator.sections.fallback.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Operator Settings - Fallback', zh: '操作员设置 - 回退' },
  },
  {
    id: 'tools',
    titleKey: 'assistantSettings.operator.sections.tools.title',
    helpKey: 'assistantSettings.operator.sections.tools.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Operator Settings - Tools', zh: '操作员设置 - 工具' },
  },
  {
    id: 'plugins',
    titleKey: 'assistantSettings.operator.sections.plugins.title',
    helpKey: 'assistantSettings.operator.sections.plugins.help',
    phase: 'deferred',
    wireframeRef: { en: 'Settings - Plugins', zh: '设置 - 插件（中文）' },
  },
  {
    id: 'skills',
    titleKey: 'assistantSettings.operator.sections.skills.title',
    helpKey: 'assistantSettings.operator.sections.skills.help',
    phase: 'deferred',
    wireframeRef: { en: 'Settings - Skills', zh: '设置 - 技能（中文）' },
  },
  {
    id: 'agents',
    titleKey: 'assistantSettings.operator.sections.agents.title',
    helpKey: 'assistantSettings.operator.sections.agents.help',
    phase: 'deferred',
    wireframeRef: { en: 'Operator Settings - Agents', zh: '操作员设置 - 代理' },
  },
  {
    id: 'scheduling',
    titleKey: 'assistantSettings.operator.sections.scheduling.title',
    helpKey: 'assistantSettings.operator.sections.scheduling.help',
    phase: 'deferred',
    wireframeRef: { en: 'Operator Settings - Scheduling', zh: '操作员设置 - 调度' },
  },
  {
    id: 'channels',
    titleKey: 'assistantSettings.operator.sections.channels.title',
    helpKey: 'assistantSettings.operator.sections.channels.help',
    phase: 'deferred',
    wireframeRef: { en: 'Operator Settings - Channels', zh: '操作员设置 - 渠道' },
  },
  {
    id: 'media',
    titleKey: 'assistantSettings.operator.sections.media.title',
    helpKey: 'assistantSettings.operator.sections.media.help',
    phase: 'deferred',
    wireframeRef: { en: 'Operator Settings - Media', zh: '操作员设置 - 媒体' },
  },
  {
    id: 'safety',
    titleKey: 'assistantSettings.operator.sections.safety.title',
    helpKey: 'assistantSettings.operator.sections.safety.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Operator Settings - Safety', zh: '操作员设置 - 安全' },
  },
  {
    id: 'observability',
    titleKey: 'assistantSettings.operator.sections.observability.title',
    helpKey: 'assistantSettings.operator.sections.observability.help',
    phase: 'deferred',
    wireframeRef: { en: 'Operator Settings - Observability', zh: '操作员设置 - 可观测性' },
  },
  {
    id: 'ui',
    titleKey: 'assistantSettings.operator.sections.ui.title',
    helpKey: 'assistantSettings.operator.sections.ui.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Operator Settings - UI', zh: '操作员设置 - 界面' },
    shortcut: {
      id: 'open-operator-settings',
      labelKey: 'assistantSettings.shortcuts.openOperatorSettings',
      defaultBinding: 'Ctrl+,',
    },
  },
  {
    id: 'keyboard',
    titleKey: 'assistantSettings.operator.sections.keyboard.title',
    helpKey: 'assistantSettings.operator.sections.keyboard.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Operator Settings - Keyboard', zh: '操作员设置 - 键盘' },
    shortcut: {
      id: 'focus-operator-keyboard',
      labelKey: 'assistantSettings.shortcuts.focusOperatorKeyboard',
      defaultBinding: 'Ctrl+Shift+K',
    },
  },
  {
    id: 'about',
    titleKey: 'assistantSettings.operator.sections.about.title',
    helpKey: 'assistantSettings.operator.sections.about.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Operator Settings - About', zh: '操作员设置 - 关于' },
  },
];

const notebookSections: AssistantSettingsSectionDescriptor[] = [
  {
    id: 'workspace',
    titleKey: 'assistantSettings.notebook.sections.workspace.title',
    helpKey: 'assistantSettings.notebook.sections.workspace.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Notebook Settings - Workspace', zh: '笔记设置 - 工作区（中文）' },
  },
  {
    id: 'editor',
    titleKey: 'assistantSettings.notebook.sections.editor.title',
    helpKey: 'assistantSettings.notebook.sections.editor.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Notebook Settings - Editor', zh: '笔记设置 - 编辑器（中文）' },
  },
  {
    id: 'preview',
    titleKey: 'assistantSettings.notebook.sections.preview.title',
    helpKey: 'assistantSettings.notebook.sections.preview.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Notebook Settings - Preview', zh: '笔记设置 - 预览（中文）' },
  },
  {
    id: 'links-tags',
    titleKey: 'assistantSettings.notebook.sections.links-tags.title',
    helpKey: 'assistantSettings.notebook.sections.links-tags.help',
    phase: 'deferred',
    wireframeRef: { en: 'Notebook Settings - Links Tags', zh: '笔记设置 - 链接标签（中文）' },
  },
  {
    id: 'graph',
    titleKey: 'assistantSettings.notebook.sections.graph.title',
    helpKey: 'assistantSettings.notebook.sections.graph.help',
    phase: 'deferred',
    wireframeRef: { en: 'Notebook Settings - Graph', zh: '笔记设置 - 图谱（中文）' },
  },
  {
    id: 'search-index',
    titleKey: 'assistantSettings.notebook.sections.search-index.title',
    helpKey: 'assistantSettings.notebook.sections.search-index.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Notebook Settings - Search Index', zh: '笔记设置 - 搜索索引（中文）' },
  },
  {
    id: 'study-srs',
    titleKey: 'assistantSettings.notebook.sections.study-srs.title',
    helpKey: 'assistantSettings.notebook.sections.study-srs.help',
    phase: 'deferred',
    wireframeRef: { en: 'Notebook Settings - Study SRS', zh: '笔记设置 - 学习 SRS（中文）' },
  },
  {
    id: 'appearance',
    titleKey: 'assistantSettings.notebook.sections.appearance.title',
    helpKey: 'assistantSettings.notebook.sections.appearance.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Notebook Settings - Appearance', zh: '笔记设置 - 外观（中文）' },
  },
  {
    id: 'shortcuts',
    titleKey: 'assistantSettings.notebook.sections.shortcuts.title',
    helpKey: 'assistantSettings.notebook.sections.shortcuts.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Notebook Settings - Shortcuts', zh: '笔记设置 - 快捷键（中文）' },
    shortcut: {
      id: 'open-notebook-shortcuts',
      labelKey: 'assistantSettings.shortcuts.openNotebookShortcuts',
      defaultBinding: 'Ctrl+Shift+/',
    },
  },
  {
    id: 'voice-ocr',
    titleKey: 'assistantSettings.notebook.sections.voice-ocr.title',
    helpKey: 'assistantSettings.notebook.sections.voice-ocr.help',
    phase: 'deferred',
    wireframeRef: { en: 'Notebook Settings - Voice OCR', zh: '笔记设置 - 语音 OCR（中文）' },
  },
  {
    id: 'backup',
    titleKey: 'assistantSettings.notebook.sections.backup.title',
    helpKey: 'assistantSettings.notebook.sections.backup.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Notebook Settings - Backup', zh: '笔记设置 - 备份（中文）' },
  },
  {
    id: 'about',
    titleKey: 'assistantSettings.notebook.sections.about.title',
    helpKey: 'assistantSettings.notebook.sections.about.help',
    phase: 'phase-1',
    wireframeRef: { en: 'Notebook Settings - About', zh: '笔记设置 - 关于（中文）' },
  },
];

export const ASSISTANT_SETTINGS_CATALOG = {
  operator: {
    id: 'operator',
    titleKey: 'assistantSettings.surfaces.operator.title',
    descriptionKey: 'assistantSettings.surfaces.operator.description',
    defaultSectionId: 'runtime',
    sections: operatorSections,
  },
  notebook: {
    id: 'notebook',
    titleKey: 'assistantSettings.surfaces.notebook.title',
    descriptionKey: 'assistantSettings.surfaces.notebook.description',
    defaultSectionId: 'workspace',
    sections: notebookSections,
  },
} as const satisfies Record<AssistantSettingsSurfaceId, AssistantSettingsSurfaceDescriptor>;

function readTranslationValue(language: Language, key: string): string {
  const segments = key.split('.');
  let current: unknown = translations[language];

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      throw new Error(`Missing translation key "${key}" for language "${language}"`);
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current !== 'string') {
    throw new Error(`Translation key "${key}" for language "${language}" does not resolve to a string`);
  }

  return current;
}

export function resolveAssistantSettingsSurface(
  language: Language,
  surfaceId: AssistantSettingsSurfaceId,
): ResolvedAssistantSettingsSurface {
  const surface = ASSISTANT_SETTINGS_CATALOG[surfaceId];

  return {
    id: surface.id,
    title: readTranslationValue(language, surface.titleKey),
    description: readTranslationValue(language, surface.descriptionKey),
    defaultSectionId: surface.defaultSectionId,
    sections: surface.sections.map(section => ({
      id: section.id,
      title: readTranslationValue(language, section.titleKey),
      help: readTranslationValue(language, section.helpKey),
      phase: section.phase,
      available: isAssistantSettingsSectionAvailable(section.phase),
      phaseLabel: readTranslationValue(language, phaseLabelKeyByPhase[section.phase]),
      wireframeRef: section.wireframeRef,
      shortcut: section.shortcut
        ? {
            id: section.shortcut.id,
            label: readTranslationValue(language, section.shortcut.labelKey),
            defaultBinding: section.shortcut.defaultBinding,
          }
        : undefined,
    })),
  };
}

export function resolveUserFacingAssistantSettingsSurface(
  language: Language,
  surfaceId: AssistantSettingsSurfaceId,
): ResolvedAssistantSettingsSurface {
  const surface = resolveAssistantSettingsSurface(language, surfaceId);

  return {
    ...surface,
    sections: surface.sections.filter(section => section.available),
  };
}
