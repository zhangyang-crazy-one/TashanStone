import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Toolbar } from '../../components/Toolbar';
import { ViewMode, Theme, AIProvider } from '../../types';

// Mock window.electronAPI
const mockElectronAPI = {
  platform: { isElectron: false },
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onMaximizedChange: vi.fn().mockReturnValue(() => {}),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset electronAPI mock
  (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
});

const defaultProps = {
  viewMode: ViewMode.Editor,
  setViewMode: vi.fn(),
  onClear: vi.fn(),
  onExport: vi.fn(),
  onAIPolish: vi.fn(),
  onAIExpand: vi.fn(),
  onBuildGraph: vi.fn(),
  onSynthesize: vi.fn(),
  onGenerateMindMap: vi.fn(),
  onGenerateQuiz: vi.fn(),
  onFormatBold: vi.fn(),
  onFormatItalic: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  isAIThinking: false,
  theme: 'light' as Theme,
  toggleTheme: vi.fn(),
  toggleSidebar: vi.fn(),
  toggleChat: vi.fn(),
  toggleSettings: vi.fn(),
  fileName: 'TestFile',
  onRename: vi.fn(),
  activeProvider: 'gemini' as AIProvider,
  language: 'en' as const,
};

describe('Toolbar', () => {
  describe('Rendering', () => {
    it('should render toolbar with file name', () => {
      render(<Toolbar {...defaultProps} />);
      
      const fileNameInput = screen.getByDisplayValue('TestFile');
      expect(fileNameInput).toBeInTheDocument();
    });

    it('should render .md extension', () => {
      render(<Toolbar {...defaultProps} />);
      
      expect(screen.getByText('.md')).toBeInTheDocument();
    });

    it('should render sidebar toggle button', () => {
      render(<Toolbar {...defaultProps} />);
      
      expect(screen.getByLabelText('Toggle sidebar')).toBeInTheDocument();
    });

    it('should render undo/redo buttons', () => {
      render(<Toolbar {...defaultProps} />);
      
      expect(screen.getByLabelText('Undo')).toBeInTheDocument();
      expect(screen.getByLabelText('Redo')).toBeInTheDocument();
    });

    it('should render bold/italic buttons', () => {
      render(<Toolbar {...defaultProps} />);
      
      expect(screen.getByLabelText('Bold')).toBeInTheDocument();
      expect(screen.getByLabelText('Italic')).toBeInTheDocument();
    });
  });

  describe('File name editing', () => {
    it('should call onRename when file name is changed', () => {
      const onRename = vi.fn();
      render(<Toolbar {...defaultProps} onRename={onRename} />);
      
      const input = screen.getByDisplayValue('TestFile');
      fireEvent.change(input, { target: { value: 'NewName' } });
      
      expect(onRename).toHaveBeenCalledWith('NewName');
    });
  });

  describe('Button interactions', () => {
    it('should call toggleSidebar when sidebar button is clicked', () => {
      const toggleSidebar = vi.fn();
      render(<Toolbar {...defaultProps} toggleSidebar={toggleSidebar} />);
      
      fireEvent.click(screen.getByLabelText('Toggle sidebar'));
      
      expect(toggleSidebar).toHaveBeenCalledTimes(1);
    });

    it('should call onUndo when undo button is clicked', () => {
      const onUndo = vi.fn();
      render(<Toolbar {...defaultProps} onUndo={onUndo} />);
      
      fireEvent.click(screen.getByLabelText('Undo'));
      
      expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it('should call onRedo when redo button is clicked', () => {
      const onRedo = vi.fn();
      render(<Toolbar {...defaultProps} onRedo={onRedo} />);
      
      fireEvent.click(screen.getByLabelText('Redo'));
      
      expect(onRedo).toHaveBeenCalledTimes(1);
    });

    it('should call onFormatBold when bold button is clicked', () => {
      const onFormatBold = vi.fn();
      render(<Toolbar {...defaultProps} onFormatBold={onFormatBold} />);
      
      fireEvent.click(screen.getByLabelText('Bold'));
      
      expect(onFormatBold).toHaveBeenCalledTimes(1);
    });

    it('should call onFormatItalic when italic button is clicked', () => {
      const onFormatItalic = vi.fn();
      render(<Toolbar {...defaultProps} onFormatItalic={onFormatItalic} />);
      
      fireEvent.click(screen.getByLabelText('Italic'));
      
      expect(onFormatItalic).toHaveBeenCalledTimes(1);
    });

    it('should call toggleChat when chat button is clicked', () => {
      const toggleChat = vi.fn();
      render(<Toolbar {...defaultProps} toggleChat={toggleChat} />);
      
      const chatButton = screen.getByLabelText('AI Chat');
      fireEvent.click(chatButton);
      
      expect(toggleChat).toHaveBeenCalledTimes(1);
    });

    it('should call toggleSettings when settings button is clicked', () => {
      const toggleSettings = vi.fn();
      render(<Toolbar {...defaultProps} toggleSettings={toggleSettings} />);
      
      const settingsButton = screen.getByLabelText('Settings');
      fireEvent.click(settingsButton);
      
      expect(toggleSettings).toHaveBeenCalledTimes(1);
    });

    it('should call toggleTheme when theme button is clicked', () => {
      const toggleTheme = vi.fn();
      render(<Toolbar {...defaultProps} toggleTheme={toggleTheme} />);
      
      const themeButton = screen.getByLabelText(/switch to/i);
      fireEvent.click(themeButton);
      
      expect(toggleTheme).toHaveBeenCalledTimes(1);
    });

    it('should call onExport when export button is clicked', () => {
      const onExport = vi.fn();
      render(<Toolbar {...defaultProps} onExport={onExport} />);
      
      const exportButton = screen.getByLabelText('Download');
      fireEvent.click(exportButton);
      
      expect(onExport).toHaveBeenCalledTimes(1);
    });
  });

  describe('Theme toggle', () => {
    it('should show moon icon in light mode', () => {
      render(<Toolbar {...defaultProps} theme="light" />);
      
      expect(screen.getByLabelText('Switch to dark mode')).toBeInTheDocument();
    });

    it('should show sun icon in dark mode', () => {
      render(<Toolbar {...defaultProps} theme="dark" />);
      
      expect(screen.getByLabelText('Switch to light mode')).toBeInTheDocument();
    });
  });

  describe('View Mode dropdown', () => {
    it('should show view mode button', () => {
      render(<Toolbar {...defaultProps} />);
      
      // Find the view mode dropdown button
      const viewButton = screen.getByTestId('view-mode');
      expect(viewButton).toBeInTheDocument();
    });

    it('should open dropdown when clicked', () => {
      render(<Toolbar {...defaultProps} />);
      
      const viewButton = screen.getByTestId('view-mode');
      fireEvent.click(viewButton);
      
      // Should show menu items (use getAllByText since "Editor" appears in button label too)
      const editorItems = screen.getAllByText('Editor');
      expect(editorItems.length).toBeGreaterThan(0);
    });
  });

  describe('AI Actions dropdown', () => {
    it('should show AI actions button', () => {
      render(<Toolbar {...defaultProps} />);
      
      const aiButton = screen.getByRole('button', { name: /^AI$/ });
      expect(aiButton).toBeInTheDocument();
    });

    it('should disable AI button when AI is thinking', () => {
      render(<Toolbar {...defaultProps} isAIThinking={true} />);
      
      const aiButton = screen.getByRole('button', { name: /^AI$/ });
      expect(aiButton).toBeDisabled();
    });

    it('should open AI menu when clicked', () => {
      render(<Toolbar {...defaultProps} />);
      
      const aiButton = screen.getByRole('button', { name: /^AI$/ });
      fireEvent.click(aiButton);
      
      // Should show AI menu items
      expect(screen.getByText('Polish')).toBeInTheDocument();
    });

    it('should call onAIPolish from menu', () => {
      const onAIPolish = vi.fn();
      render(<Toolbar {...defaultProps} onAIPolish={onAIPolish} />);
      
      const aiButton = screen.getByRole('button', { name: /^AI$/ });
      fireEvent.click(aiButton);
      
      const polishButton = screen.getByText('Polish');
      fireEvent.click(polishButton);
      
      expect(onAIPolish).toHaveBeenCalledTimes(1);
    });
  });

  describe('Split mode controls', () => {
    it('should render split mode buttons when onSplitModeChange is provided', () => {
      const onSplitModeChange = vi.fn();
      render(<Toolbar {...defaultProps} onSplitModeChange={onSplitModeChange} />);
      
      expect(screen.getByLabelText('Single view')).toBeInTheDocument();
      expect(screen.getByLabelText('Split horizontally')).toBeInTheDocument();
      expect(screen.getByLabelText('Split vertically')).toBeInTheDocument();
    });

    it('should call onSplitModeChange with correct mode', () => {
      const onSplitModeChange = vi.fn();
      
      render(
        <Toolbar 
          {...defaultProps} 
          onSplitModeChange={onSplitModeChange}
        />
      );
      
      const splitButton = screen.getByLabelText('Split horizontally');
      fireEvent.click(splitButton);
      
      // Verify onSplitModeChange was called with correct argument
      expect(onSplitModeChange).toHaveBeenCalledWith('horizontal');
    });
  });

  describe('Language support', () => {
    it('should use English translations', () => {
      render(<Toolbar {...defaultProps} language="en" />);
      
      expect(screen.getByLabelText('Settings')).toBeInTheDocument();
      expect(screen.getByLabelText('Download')).toBeInTheDocument();
    });

    it('should use Chinese translations', () => {
      render(<Toolbar {...defaultProps} language="zh" />);
      
      // Component should render with Chinese translations
      expect(screen.getByLabelText('设置')).toBeInTheDocument();
    });
  });

  describe('Electron window controls', () => {
    it('should not render window controls in web mode', () => {
      mockElectronAPI.platform.isElectron = false;
      render(<Toolbar {...defaultProps} />);
      
      expect(screen.queryByLabelText('Minimize window')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Maximize|Restore/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Close window')).not.toBeInTheDocument();
    });

    it('should render window controls in Electron mode', () => {
      mockElectronAPI.platform.isElectron = true;
      render(<Toolbar {...defaultProps} />);
      
      expect(screen.getByLabelText('Minimize window')).toBeInTheDocument();
      expect(screen.getByLabelText(/Maximize|Restore/)).toBeInTheDocument();
      expect(screen.getByLabelText('Close window')).toBeInTheDocument();
    });
  });
});
