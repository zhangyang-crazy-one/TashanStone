/**
 * escapeHtml Utility Tests
 * Tests for HTML escaping function
 */

import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../utils/escapeHtml';

describe('escapeHtml', () => {
  it('should escape ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('should escape less than sign', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('should escape greater than sign', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('He said "Hello"')).toBe('He said &quot;Hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("It's fine")).toBe('It&#039;s fine');
  });

  it('should escape multiple special characters', () => {
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
    );
  });

  it('should handle HTML tags', () => {
    expect(escapeHtml('<div class="test">Content</div>')).toBe(
      '&lt;div class=&quot;test&quot;&gt;Content&lt;/div&gt;'
    );
  });

  it('should return empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should not modify text without special characters', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('12345')).toBe('12345');
  });

  it('should handle unicode characters correctly', () => {
    expect(escapeHtml('Hello \u4e16\u754c')).toBe('Hello \u4e16\u754c');
    expect(escapeHtml('\u4f60\u597d & \u4e16\u754c')).toBe('\u4f60\u597d &amp; \u4e16\u754c');
  });

  it('should handle newlines and whitespace', () => {
    expect(escapeHtml('Line 1\nLine 2')).toBe('Line 1\nLine 2');
    expect(escapeHtml('  spaces  ')).toBe('  spaces  ');
  });

  it('should prevent XSS attacks', () => {
    const malicious = '<img src="x" onerror="alert(\'XSS\')">';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
  });
});
