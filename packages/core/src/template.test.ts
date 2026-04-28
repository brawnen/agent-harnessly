import { describe, expect, it } from 'vitest';

import { createTemplateRegistry, getBuiltinTemplates, matchTemplate, TemplateRegistry } from './template';

describe('template registry', () => {
  it('should expose builtin templates', () => {
    const templates = getBuiltinTemplates();

    expect(templates.map((template) => template.name)).toEqual([
      'bug-fix',
      'feature-simple',
      'general-task',
    ]);
  });

  it('should match bug-fix and feature-simple by keywords', () => {
    const registry = createTemplateRegistry();

    expect(registry.match('修复登录异常').name).toBe('bug-fix');
    expect(registry.match('新增导出能力').name).toBe('feature-simple');
  });

  it('should fall back to general-task when no keyword matches', () => {
    expect(matchTemplate('整理当前任务说明')).toBe('general-task');
  });

  it('should allow getting template defaults by name', () => {
    const registry = new TemplateRegistry();
    const template = registry.get('bug-fix');

    expect(template.defaultRiskLevel).toBe('medium');
    expect(template.defaultScopeInclude).toContain('相关缺陷代码路径');
  });
});
