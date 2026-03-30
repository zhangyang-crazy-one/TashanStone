import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatInput } from '../../components/ChatPanel/ChatInput';
import { translations } from '../../utils/translations';

describe('ChatInput', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a multiline textarea and grows as the prompt gets longer', () => {
    const onInputChange = vi.fn();
    const scrollHeightMock = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(124);

    render(
      <ChatInput
        input={'First line\nSecond line'}
        onInputChange={onInputChange}
        onSubmit={vi.fn()}
        aiState={{ isThinking: false, error: null, message: null }}
        language="en"
        t={translations.en}
        isSupported={false}
        isProcessing={false}
        isListening={false}
        onToggleListening={vi.fn()}
        interimTranscript=""
      />,
    );

    const composer = screen.getByRole('textbox');

    expect(composer.tagName).toBe('TEXTAREA');
    expect(composer).toHaveValue('First line\nSecond line');
    expect(composer).toHaveStyle({ height: '124px' });

    scrollHeightMock.mockRestore();
  });

  it('submits on Enter and preserves a newline on Shift+Enter', () => {
    const onInputChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ChatInput
        input="Draft message"
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        aiState={{ isThinking: false, error: null, message: null }}
        language="en"
        t={translations.en}
        isSupported={false}
        isProcessing={false}
        isListening={false}
        onToggleListening={vi.fn()}
        interimTranscript=""
      />,
    );

    const composer = screen.getByRole('textbox');

    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
