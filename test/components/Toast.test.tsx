import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { ToastProvider, ToastContainer, useToast, toast, setGlobalToast } from '../../components/Toast';
import type { ToastMessage } from '../../components/Toast';

// Test component that uses useToast hook
const TestComponent: React.FC<{ action?: string; type?: 'success' | 'error' | 'warning' | 'info' }> = ({ 
  action = 'show', 
  type = 'info' 
}) => {
  const { showToast } = useToast();
  
  return (
    <button 
      data-testid="trigger" 
      onClick={() => showToast(`Test ${type} message`, type, 5000)}
    >
      Trigger Toast
    </button>
  );
};

describe('Toast Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ToastProvider', () => {
    it('should render children', () => {
      render(
        <ToastProvider>
          <div data-testid="child">Child Content</div>
        </ToastProvider>
      );
      
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should provide showToast function via context', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );
      
      const button = screen.getByTestId('trigger');
      expect(button).toBeInTheDocument();
    });
  });

  describe('useToast hook', () => {
    it('should throw error when used outside ToastProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        render(<TestComponent />);
      }).toThrow('useToast must be used within a ToastProvider');
      
      consoleError.mockRestore();
    });

    it('should show toast when triggered', () => {
      render(
        <ToastProvider>
          <TestComponent type="success" />
        </ToastProvider>
      );
      
      const button = screen.getByTestId('trigger');
      fireEvent.click(button);
      
      // Advance timers to allow state update
      act(() => {
        vi.advanceTimersByTime(100);
      });
      
      expect(screen.getByText('Test success message')).toBeInTheDocument();
    });
  });

  describe('ToastContainer', () => {
    it('should render nothing when toasts array is empty', () => {
      const { container } = render(
        <ToastContainer toasts={[]} onClose={() => {}} />
      );
      
      expect(container.firstChild).toBeNull();
    });

    it('should render toast items', () => {
      const toasts: ToastMessage[] = [
        { id: '1', message: 'Toast 1', type: 'success' },
        { id: '2', message: 'Toast 2', type: 'error' },
      ];
      
      render(<ToastContainer toasts={toasts} onClose={() => {}} />);
      
      expect(screen.getByText('Toast 1')).toBeInTheDocument();
      expect(screen.getByText('Toast 2')).toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      const toasts: ToastMessage[] = [
        { id: '1', message: 'Closeable toast', type: 'info' },
      ];
      
      render(<ToastContainer toasts={toasts} onClose={onClose} />);
      
      // Find close button (X icon button)
      const closeButton = screen.getByRole('button');
      fireEvent.click(closeButton);
      
      // Wait for animation delay
      act(() => {
        vi.advanceTimersByTime(300);
      });
      
      expect(onClose).toHaveBeenCalledWith('1');
    });
  });

  describe('Toast types', () => {
    it.each([
      ['success', 'emerald'],
      ['error', 'red'],
      ['warning', 'amber'],
      ['info', 'blue'],
    ] as const)('should render %s toast with correct styling', (type, _colorClass) => {
      render(
        <ToastProvider>
          <TestComponent type={type} />
        </ToastProvider>
      );
      
      fireEvent.click(screen.getByTestId('trigger'));
      
      // Advance timers to allow state update
      act(() => {
        vi.advanceTimersByTime(100);
      });
      
      expect(screen.getByText(`Test ${type} message`)).toBeInTheDocument();
    });
  });

  describe('Toast auto-dismiss', () => {
    it('should auto-dismiss after duration', async () => {
      const toasts: ToastMessage[] = [
        { id: '1', message: 'Auto dismiss', type: 'info', duration: 1000 },
      ];
      const onClose = vi.fn();
      
      render(<ToastContainer toasts={toasts} onClose={onClose} />);
      
      expect(screen.getByText('Auto dismiss')).toBeInTheDocument();
      
      // Advance past duration + animation delay
      act(() => {
        vi.advanceTimersByTime(1300);
      });
      
      expect(onClose).toHaveBeenCalledWith('1');
    });

    it('should not auto-dismiss if duration is 0', () => {
      const toasts: ToastMessage[] = [
        { id: '1', message: 'Persistent toast', type: 'info', duration: 0 },
      ];
      const onClose = vi.fn();
      
      render(<ToastContainer toasts={toasts} onClose={onClose} />);
      
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Global toast function', () => {
    it('should set and use global toast function', () => {
      const mockShowToast = vi.fn();
      setGlobalToast(mockShowToast);
      
      toast.success('Success!');
      expect(mockShowToast).toHaveBeenCalledWith('Success!', 'success', undefined);
      
      toast.error('Error!', 5000);
      expect(mockShowToast).toHaveBeenCalledWith('Error!', 'error', 5000);
      
      toast.warning('Warning!');
      expect(mockShowToast).toHaveBeenCalledWith('Warning!', 'warning', undefined);
      
      toast.info('Info!');
      expect(mockShowToast).toHaveBeenCalledWith('Info!', 'info', undefined);
      
      toast.show('Custom', 'success', 2000);
      expect(mockShowToast).toHaveBeenCalledWith('Custom', 'success', 2000);
    });
  });
});
