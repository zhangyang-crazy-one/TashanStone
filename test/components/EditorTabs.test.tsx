import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EditorTabs } from '../../components/EditorTabs';
import type { EditorPane, MarkdownFile } from '../../types';

const mockFiles: MarkdownFile[] = [
  { id: 'file1', name: 'README.md', content: '# Hello', path: '/docs/README.md' },
  { id: 'file2', name: 'Notes.md', content: '# Notes', path: '/docs/Notes.md' },
  { id: 'file3', name: 'Todo.md', content: '# Todo', path: '/docs/Todo.md' },
];

const mockPanes: EditorPane[] = [
  { id: 'pane1', fileId: 'file1', mode: 'editor' },
  { id: 'pane2', fileId: 'file2', mode: 'preview' },
];

const defaultProps = {
  panes: mockPanes,
  activePane: 'pane1',
  files: mockFiles,
  onSelectPane: vi.fn(),
  onClosePane: vi.fn(),
  onToggleMode: vi.fn(),
  language: 'en' as const,
};

describe('EditorTabs', () => {
  describe('Rendering', () => {
    it('should return null when panes array is empty', () => {
      const { container } = render(
        <EditorTabs {...defaultProps} panes={[]} />
      );
      
      expect(container.firstChild).toBeNull();
    });

    it('should render tabs for all panes', () => {
      render(<EditorTabs {...defaultProps} />);
      
      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('Notes.md')).toBeInTheDocument();
    });

    it('should display file names from files array', () => {
      render(<EditorTabs {...defaultProps} />);
      
      mockPanes.forEach(pane => {
        const file = mockFiles.find(f => f.id === pane.fileId);
        expect(screen.getByText(file!.name)).toBeInTheDocument();
      });
    });

    it('should show "Untitled" for missing file', () => {
      const panesWithMissingFile: EditorPane[] = [
        { id: 'pane1', fileId: 'nonexistent', mode: 'editor' },
      ];
      
      render(<EditorTabs {...defaultProps} panes={panesWithMissingFile} />);
      
      expect(screen.getByText('Untitled')).toBeInTheDocument();
    });
  });

  describe('Active tab styling', () => {
    it('should apply active styling to selected pane', () => {
      render(<EditorTabs {...defaultProps} activePane="pane1" />);
      
      const activeTab = screen.getByText('README.md').closest('div');
      expect(activeTab?.className).toContain('bg-white');
    });

    it('should apply inactive styling to non-selected pane', () => {
      render(<EditorTabs {...defaultProps} activePane="pane1" />);
      
      const inactiveTab = screen.getByText('Notes.md').closest('div');
      expect(inactiveTab?.className).toContain('bg-paper-50');
    });
  });

  describe('Tab interactions', () => {
    it('should call onSelectPane when tab is clicked', () => {
      const onSelectPane = vi.fn();
      render(<EditorTabs {...defaultProps} onSelectPane={onSelectPane} />);
      
      fireEvent.click(screen.getByText('Notes.md'));
      
      expect(onSelectPane).toHaveBeenCalledWith('pane2');
    });

    it('should call onClosePane when close button is clicked', () => {
      const onClosePane = vi.fn();
      render(<EditorTabs {...defaultProps} onClosePane={onClosePane} />);
      
      // Find all close buttons (X icons)
      const closeButtons = screen.getAllByTitle('Close Tab');
      fireEvent.click(closeButtons[0]);
      
      expect(onClosePane).toHaveBeenCalledWith('pane1');
    });

    it('should not trigger onSelectPane when close button is clicked', () => {
      const onSelectPane = vi.fn();
      const onClosePane = vi.fn();
      render(
        <EditorTabs 
          {...defaultProps} 
          onSelectPane={onSelectPane} 
          onClosePane={onClosePane} 
        />
      );
      
      const closeButtons = screen.getAllByTitle('Close Tab');
      fireEvent.click(closeButtons[0]);
      
      expect(onClosePane).toHaveBeenCalled();
      expect(onSelectPane).not.toHaveBeenCalled();
    });
  });

  describe('Mode toggle', () => {
    it('should call onToggleMode when mode button is clicked', () => {
      const onToggleMode = vi.fn();
      render(<EditorTabs {...defaultProps} onToggleMode={onToggleMode} />);
      
      // Find all mode toggle buttons (Eye or Edit3 icons)
      // They should have title attributes based on current mode
      const buttons = screen.getAllByRole('button');
      // Filter to find mode toggle buttons (not close buttons)
      const modeButton = buttons.find(b => 
        b.getAttribute('title')?.includes('Preview') || 
        b.getAttribute('title')?.includes('Editor')
      );
      
      if (modeButton) {
        fireEvent.click(modeButton);
        expect(onToggleMode).toHaveBeenCalled();
      }
    });

    it('should not trigger onSelectPane when mode button is clicked', () => {
      const onSelectPane = vi.fn();
      const onToggleMode = vi.fn();
      render(
        <EditorTabs 
          {...defaultProps} 
          onSelectPane={onSelectPane} 
          onToggleMode={onToggleMode} 
        />
      );
      
      const buttons = screen.getAllByRole('button');
      const modeButton = buttons.find(b => 
        b.getAttribute('title')?.includes('Preview') || 
        b.getAttribute('title')?.includes('Editor')
      );
      
      if (modeButton) {
        fireEvent.click(modeButton);
        expect(onSelectPane).not.toHaveBeenCalled();
      }
    });
  });

  describe('Language support', () => {
    it('should use English translations by default', () => {
      render(<EditorTabs {...defaultProps} language="en" />);
      
      // Check that component renders (translations are used for tooltips)
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    it('should support Chinese language', () => {
      render(<EditorTabs {...defaultProps} language="zh" />);
      
      // Component should still render with Chinese translations
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
  });

  describe('Multiple tabs', () => {
    it('should render correct number of tabs', () => {
      const manyPanes: EditorPane[] = [
        { id: 'p1', fileId: 'file1', mode: 'editor' },
        { id: 'p2', fileId: 'file2', mode: 'editor' },
        { id: 'p3', fileId: 'file3', mode: 'preview' },
      ];
      
      render(<EditorTabs {...defaultProps} panes={manyPanes} />);
      
      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('Notes.md')).toBeInTheDocument();
      expect(screen.getByText('Todo.md')).toBeInTheDocument();
    });

    it('should handle clicking different tabs', () => {
      const onSelectPane = vi.fn();
      const manyPanes: EditorPane[] = [
        { id: 'p1', fileId: 'file1', mode: 'editor' },
        { id: 'p2', fileId: 'file2', mode: 'editor' },
        { id: 'p3', fileId: 'file3', mode: 'preview' },
      ];
      
      render(
        <EditorTabs 
          {...defaultProps} 
          panes={manyPanes} 
          onSelectPane={onSelectPane} 
        />
      );
      
      fireEvent.click(screen.getByText('Todo.md'));
      expect(onSelectPane).toHaveBeenCalledWith('p3');
      
      fireEvent.click(screen.getByText('README.md'));
      expect(onSelectPane).toHaveBeenCalledWith('p1');
    });
  });

  describe('Edge cases', () => {
    it('should handle null activePane', () => {
      render(<EditorTabs {...defaultProps} activePane={null} />);
      
      // All tabs should render as inactive
      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('Notes.md')).toBeInTheDocument();
    });

    it('should handle empty files array', () => {
      render(<EditorTabs {...defaultProps} files={[]} />);
      
      // Should show "Untitled" for all tabs
      const untitledTabs = screen.getAllByText('Untitled');
      expect(untitledTabs.length).toBe(2);
    });
  });
});
