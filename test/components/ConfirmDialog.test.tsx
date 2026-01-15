import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { ConfirmDialogProps } from '../../components/ConfirmDialog';

const defaultProps: ConfirmDialogProps = {
  isOpen: true,
  title: 'Confirm Action',
  message: 'Are you sure you want to proceed?',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmDialog', () => {
  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      render(<ConfirmDialog {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
      render(<ConfirmDialog {...defaultProps} />);
      
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
    });

    it('should display title and message', () => {
      render(
        <ConfirmDialog 
          {...defaultProps} 
          title="Delete File" 
          message="This action cannot be undone." 
        />
      );
      
      expect(screen.getByText('Delete File')).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    });

    it('should use default button texts', () => {
      render(<ConfirmDialog {...defaultProps} />);
      
      expect(screen.getByText('Confirm')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should use custom button texts', () => {
      render(
        <ConfirmDialog 
          {...defaultProps} 
          confirmText="Delete" 
          cancelText="Keep" 
        />
      );
      
      expect(screen.getByText('Delete')).toBeInTheDocument();
      expect(screen.getByText('Keep')).toBeInTheDocument();
    });
  });

  describe('Dialog types', () => {
    it('should render danger type with red styling', () => {
      render(<ConfirmDialog {...defaultProps} type="danger" />);
      
      const confirmButton = screen.getByText('Confirm');
      expect(confirmButton.className).toContain('bg-red-500');
    });

    it('should render warning type with amber styling', () => {
      render(<ConfirmDialog {...defaultProps} type="warning" />);
      
      const confirmButton = screen.getByText('Confirm');
      expect(confirmButton.className).toContain('bg-amber-500');
    });

    it('should render info type with cyan styling', () => {
      render(<ConfirmDialog {...defaultProps} type="info" />);
      
      const confirmButton = screen.getByText('Confirm');
      expect(confirmButton.className).toContain('bg-cyan-500');
    });

    it('should default to warning type', () => {
      render(<ConfirmDialog {...defaultProps} />);
      
      const confirmButton = screen.getByText('Confirm');
      expect(confirmButton.className).toContain('bg-amber-500');
    });
  });

  describe('User interactions', () => {
    it('should call onConfirm when confirm button is clicked', () => {
      const onConfirm = vi.fn();
      render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
      
      fireEvent.click(screen.getByText('Confirm'));
      
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when cancel button is clicked', () => {
      const onCancel = vi.fn();
      render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
      
      fireEvent.click(screen.getByText('Cancel'));
      
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when clicking backdrop', () => {
      const onCancel = vi.fn();
      const { container } = render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
      
      // Click the backdrop (first fixed div)
      const backdrop = container.querySelector('.fixed.inset-0');
      if (backdrop) {
        fireEvent.click(backdrop);
      }
      
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should not close when clicking dialog content', () => {
      const onCancel = vi.fn();
      render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
      
      // Click on the dialog content
      fireEvent.click(screen.getByText('Confirm Action'));
      
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('should call onCancel when pressing Escape key', () => {
      const onCancel = vi.fn();
      render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
      
      fireEvent.keyDown(window, { key: 'Escape' });
      
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when X button is clicked', () => {
      const onCancel = vi.fn();
      render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
      
      // Find all buttons and click the X (close) button
      const buttons = screen.getAllByRole('button');
      // The X button should be after the title, before cancel/confirm
      const closeButton = buttons[0]; // First button is the X
      fireEvent.click(closeButton);
      
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Keyboard interactions', () => {
    it('should not respond to Escape when dialog is closed', () => {
      const onCancel = vi.fn();
      render(<ConfirmDialog {...defaultProps} isOpen={false} onCancel={onCancel} />);
      
      fireEvent.keyDown(window, { key: 'Escape' });
      
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('should clean up event listener on unmount', () => {
      const onCancel = vi.fn();
      const { unmount } = render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
      
      unmount();
      
      fireEvent.keyDown(window, { key: 'Escape' });
      
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper dialog structure', () => {
      render(<ConfirmDialog {...defaultProps} />);
      
      // Title should be in h3
      const title = screen.getByText('Confirm Action');
      expect(title.tagName).toBe('H3');
      
      // Message should be in p
      const message = screen.getByText('Are you sure you want to proceed?');
      expect(message.tagName).toBe('P');
    });

    it('should have interactive buttons', () => {
      render(<ConfirmDialog {...defaultProps} />);
      
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(3); // X, Cancel, Confirm
    });
  });
});
