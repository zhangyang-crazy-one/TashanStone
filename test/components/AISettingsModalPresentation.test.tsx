import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AIConfig, AppTheme } from '../../types';
import { AISettingsModal } from '../../components/AISettingsModal';
import { ASSISTANT_SETTINGS_DEFAULTS } from '../../src/services/assistant-runtime/defaults';
import { translations } from '../../utils/translations';

vi.mock('../../src/services/mcpService', () => ({
  mcpService: {
    isAvailable: () => false,
    getTools: vi.fn(),
  },
}));

const config: AIConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.example.com',
  apiKey: 'secret',
  temperature: 0.2,
  language: 'en',
  enableStreaming: true,
  enableWebSearch: true,
  assistantSettings: {
    surface: 'operator',
    sectionBySurface: {
      ...ASSISTANT_SETTINGS_DEFAULTS.sectionBySurface,
      operator: 'plugins',
      notebook: 'links-tags',
    },
  },
};

function renderModal() {
  render(
    <AISettingsModal
      isOpen={true}
      onClose={vi.fn()}
      config={config}
      onSave={vi.fn()}
      themes={[] as AppTheme[]}
      activeThemeId="default"
      onSelectTheme={vi.fn()}
      onImportTheme={vi.fn()}
      onDeleteTheme={vi.fn()}
      language="en"
      shortcuts={[]}
    />,
  );
}

describe('AISettingsModal presentation', () => {
  it('shows the shipped settings tabs and AI controls', () => {
    renderModal();

    expect(screen.getByRole('button', { name: translations.en.aiConfig })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MCP / Tools' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Context' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: translations.en.appearance })).toBeInTheDocument();
    expect(screen.getByText(translations.en.provider)).toBeInTheDocument();
    expect(screen.getByText(/Model Name/)).toBeInTheDocument();
  });

  it('keeps planning-state copy and phase-readiness badges out of the modal body', () => {
    renderModal();

    expect(screen.queryByText('Settings Blueprint')).not.toBeInTheDocument();
    expect(screen.queryByText('Phase 1 ready')).not.toBeInTheDocument();
    expect(screen.queryByText('Later phase')).not.toBeInTheDocument();
  });

  it('does not expose deferred shell selectors as interactive user-facing controls', () => {
    renderModal();

    expect(screen.queryByText(translations.en.assistantSettings.surfaces.operator.title)).not.toBeInTheDocument();
    expect(screen.queryByText(translations.en.assistantSettings.surfaces.notebook.title)).not.toBeInTheDocument();
    expect(screen.queryByText(translations.en.assistantSettings.operator.sections.plugins.title)).not.toBeInTheDocument();
    expect(screen.queryByText(translations.en.assistantSettings.notebook.sections['links-tags'].title)).not.toBeInTheDocument();
  });
});
