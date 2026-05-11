import type { RiskLevel, TemplateName } from '@brawnen/harnessly-shared';

export interface BuiltinTemplateDefinition {
  name: TemplateName;
  description: string;
  keywords: string[];
  defaultRiskLevel: RiskLevel;
  defaultScopeInclude: string[];
  defaultScopeExclude: string[];
  defaultAcceptanceCriteria: string[];
  defaultOutOfScope: string[];
}

const builtinTemplates: BuiltinTemplateDefinition[] = [
  {
    name: 'bug-fix',
    description: '面向缺陷修复、异常排查和行为纠正',
    keywords: ['修复', 'bug', 'fix', '错误', '异常', '失败', '问题'],
    defaultRiskLevel: 'medium',
    defaultScopeInclude: ['相关缺陷代码路径'],
    defaultScopeExclude: ['无关模块', '用户级全局配置'],
    defaultAcceptanceCriteria: ['目标已被修复', '变更范围与问题直接相关', '输出结果可供后续 verify 使用'],
    defaultOutOfScope: ['重构整仓', '新增未请求依赖'],
  },
  {
    name: 'feature-simple',
    description: '面向单点功能新增、轻量能力扩展',
    keywords: ['新增', '添加', 'feature', '支持', '实现', '增加'],
    defaultRiskLevel: 'low',
    defaultScopeInclude: ['相关功能模块路径'],
    defaultScopeExclude: ['无关模块', '用户级全局配置'],
    defaultAcceptanceCriteria: ['目标功能已可用', '变更范围与目标一致', '输出结果可供后续 verify 使用'],
    defaultOutOfScope: ['跨模块平台化重构', '新增未请求依赖'],
  },
  {
    name: 'general-task',
    description: '面向无法明确归类的通用任务',
    keywords: [],
    defaultRiskLevel: 'low',
    defaultScopeInclude: ['相关实现路径'],
    defaultScopeExclude: ['无关模块', '用户级全局配置'],
    defaultAcceptanceCriteria: ['目标已被实现或处理', '变更范围与目标一致', '输出结果可供后续 verify 使用'],
    defaultOutOfScope: ['重构整仓', '新增未请求依赖'],
  },
];

export class TemplateRegistry {
  private readonly templates = new Map<TemplateName, BuiltinTemplateDefinition>();

  constructor(initialTemplates: BuiltinTemplateDefinition[] = builtinTemplates) {
    for (const template of initialTemplates) {
      this.templates.set(template.name, template);
    }
  }

  list(): BuiltinTemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  get(name: TemplateName): BuiltinTemplateDefinition {
    const template = this.templates.get(name);

    if (!template) {
      throw new Error(`模板 ${name} 不存在`);
    }

    return template;
  }

  match(goal: string): BuiltinTemplateDefinition {
    const normalizedGoal = goal.trim().toLowerCase();

    for (const template of this.list()) {
      if (template.keywords.some((keyword) => normalizedGoal.includes(keyword.toLowerCase()))) {
        return template;
      }
    }

    return this.get('general-task');
  }
}

export function createTemplateRegistry(): TemplateRegistry {
  return new TemplateRegistry();
}

export function getBuiltinTemplates(): BuiltinTemplateDefinition[] {
  return builtinTemplates.map((template) => ({
    ...template,
    keywords: [...template.keywords],
    defaultScopeInclude: [...template.defaultScopeInclude],
    defaultScopeExclude: [...template.defaultScopeExclude],
    defaultAcceptanceCriteria: [...template.defaultAcceptanceCriteria],
    defaultOutOfScope: [...template.defaultOutOfScope],
  }));
}

export function matchTemplate(goal: string): TemplateName {
  return createTemplateRegistry().match(goal).name;
}
