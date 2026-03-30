import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { ToolCallCard } from '../../components/ToolCallCard';
import type { ToolCall } from '../../types';

describe('ToolCallCard', () => {
  it('renders runtime error details for failed tool calls', () => {
    const toolCall: ToolCall = {
      id: 'tool-1',
      name: 'search_knowledge_base',
      args: {},
      status: 'error',
      error: 'Knowledge search timed out',
      result: {
        success: false,
      },
    };

    render(<ToolCallCard toolCall={toolCall} />);

    expect(screen.getByText('Knowledge search timed out')).toBeInTheDocument();
  });
});
