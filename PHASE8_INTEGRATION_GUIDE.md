# Phase 8 新视图模式组件集成指南

## 已创建的组件

### 1. DiffView.tsx (11.6 KB)
**路径**: `F:\MYproject\Zhang_Note\zhang_reader\components\DiffView.tsx`

**功能**: AI 润色文本对比视图
- 支持行内对比和左右分栏两种模式
- 使用 `diff` 库实现智能差异高亮
- 变更统计 (新增/删除/未变)
- 一键复制润色文本
- 下载对比文件
- 应用/取消操作

**Props**:
```typescript
interface DiffViewProps {
  originalText: string;        // 原始文本
  modifiedText: string;        // AI 润色后的文本
  onApply: (text: string) => void;  // 应用润色回调
  onCancel: () => void;        // 取消回调
  language?: 'en' | 'zh';      // 语言 (默认 'en')
}
```

**使用示例**:
```tsx
import { DiffView } from './components/DiffView';

<DiffView
  originalText={originalContent}
  modifiedText={polishedContent}
  onApply={(text) => {
    // 应用润色文本到编辑器
    setCurrentFile({ ...currentFile, content: text });
    setViewMode(ViewMode.Editor);
  }}
  onCancel={() => setViewMode(ViewMode.Editor)}
  language={aiConfig.language}
/>
```

---

### 2. AnalyticsDashboard.tsx (18.0 KB)
**路径**: `F:\MYproject\Zhang_Note\zhang_reader\components\AnalyticsDashboard.tsx`

**功能**: 学习数据分析仪表板
- 概览卡片 (平均分、总测验数、学习时间、趋势)
- 成绩历史图表 (柱状图)
- 知识点掌握度进度条 (支持按准确率/题数排序)
- 最近测验列表
- 薄弱知识点提醒
- 时间范围筛选 (本周/本月/全部)

**Props**:
```typescript
interface AnalyticsDashboardProps {
  examResults: ExamResult[];           // 测验结果数组
  knowledgeStats: KnowledgePointStat[]; // 知识点统计
  totalStudyTime?: number;             // 总学习时间 (分钟)
  language?: 'en' | 'zh';              // 语言
}
```

**使用示例**:
```tsx
import { AnalyticsDashboard } from './components/AnalyticsDashboard';

<AnalyticsDashboard
  examResults={examHistory}
  knowledgeStats={knowledgePointStats}
  totalStudyTime={calculateTotalStudyTime()}
  language={aiConfig.language}
/>
```

---

### 3. LearningRoadmap.tsx (22.8 KB)
**路径**: `F:\MYproject\Zhang_Note\zhang_reader\components\LearningRoadmap.tsx`

**功能**: 间隔重复学习 (SRS) 路线图
- 今日任务概览 (待复习/已逾期/已完成)
- 学习计划管理 (创建/删除)
- 复习任务列表 (可展开/折叠)
- 任务状态追踪 (pending/completed/overdue/future)
- 艾宾浩斯间隔标签
- 列表/日历视图切换 (日历视图待实现)
- 进度条可视化

**Props**:
```typescript
interface LearningRoadmapProps {
  studyPlans: StudyPlan[];    // 学习计划数组
  onCompleteTask: (planId: string, taskId: string) => void;  // 完成任务
  onCreatePlan: (sourceType: 'file' | 'mistake', sourceId: string, title: string) => void;  // 创建计划
  onDeletePlan: (planId: string) => void;  // 删除计划
  language?: 'en' | 'zh';
}
```

**使用示例**:
```tsx
import { LearningRoadmap } from './components/LearningRoadmap';

<LearningRoadmap
  studyPlans={studyPlans}
  onCompleteTask={(planId, taskId) => {
    // 标记任务完成，更新状态和 completedDate
    const updatedPlans = studyPlans.map(plan => {
      if (plan.id === planId) {
        const updatedTasks = plan.tasks.map(task =>
          task.id === taskId
            ? { ...task, status: 'completed', completedDate: Date.now() }
            : task
        );
        return { ...plan, tasks: updatedTasks };
      }
      return plan;
    });
    setStudyPlans(updatedPlans);
  }}
  onCreatePlan={(sourceType, sourceId, title) => {
    // 创建新的学习计划
    const newPlan = createStudyPlanWithSRS(title, sourceType, sourceId);
    setStudyPlans([...studyPlans, newPlan]);
  }}
  onDeletePlan={(planId) => {
    setStudyPlans(studyPlans.filter(p => p.id !== planId));
  }}
  language={aiConfig.language}
/>
```

---

## 在 App.tsx 中集成

### 1. 导入组件
```tsx
import { DiffView } from './components/DiffView';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { LearningRoadmap } from './components/LearningRoadmap';
```

### 2. 添加状态 (如果还没有)
```tsx
// 用于 DiffView
const [diffOriginal, setDiffOriginal] = useState('');
const [diffModified, setDiffModified] = useState('');

// 用于 AnalyticsDashboard
const [examHistory, setExamHistory] = useState<ExamResult[]>([]);
const [knowledgeStats, setKnowledgeStats] = useState<KnowledgePointStat[]>([]);

// 用于 LearningRoadmap
const [studyPlans, setStudyPlans] = useState<StudyPlan[]>([]);
```

### 3. 在渲染函数中添加条件渲染
```tsx
// 在主渲染区域 (根据 viewMode)
{viewMode === ViewMode.Diff && (
  <DiffView
    originalText={diffOriginal}
    modifiedText={diffModified}
    onApply={(text) => {
      if (currentFile) {
        setFiles(files.map(f => f.id === currentFile.id ? { ...f, content: text } : f));
        setCurrentFile({ ...currentFile, content: text });
      }
      setViewMode(ViewMode.Editor);
    }}
    onCancel={() => setViewMode(ViewMode.Editor)}
    language={aiConfig.language}
  />
)}

{viewMode === ViewMode.Analytics && (
  <AnalyticsDashboard
    examResults={examHistory}
    knowledgeStats={knowledgeStats}
    totalStudyTime={calculateTotalStudyTime()}
    language={aiConfig.language}
  />
)}

{viewMode === ViewMode.Roadmap && (
  <LearningRoadmap
    studyPlans={studyPlans}
    onCompleteTask={handleCompleteTask}
    onCreatePlan={handleCreatePlan}
    onDeletePlan={handleDeletePlan}
    language={aiConfig.language}
  />
)}
```

### 4. 在 Toolbar.tsx 中添加按钮
```tsx
<button
  onClick={() => setViewMode(ViewMode.Diff)}
  className={/* ... */}
  title="Diff View"
>
  <DiffIcon size={18} />
</button>

<button
  onClick={() => setViewMode(ViewMode.Analytics)}
  className={/* ... */}
  title="Analytics"
>
  <BarChart2 size={18} />
</button>

<button
  onClick={() => setViewMode(ViewMode.Roadmap)}
  className={/* ... */}
  title="Learning Roadmap"
>
  <Target size={18} />
</button>
```

---

## 依赖项

已安装:
```json
{
  "diff": "^5.2.0",
  "@types/diff": "^5.2.3"
}
```

---

## 艾宾浩斯间隔重复算法实现参考

```typescript
// 创建带有 SRS 间隔的学习计划
function createStudyPlanWithSRS(
  title: string,
  sourceType: 'file' | 'mistake',
  sourceId: string
): StudyPlan {
  const now = Date.now();

  // 艾宾浩斯遗忘曲线间隔 (毫秒)
  const intervals = [
    { label: '5min', ms: 5 * 60 * 1000 },
    { label: '30min', ms: 30 * 60 * 1000 },
    { label: '12h', ms: 12 * 60 * 60 * 1000 },
    { label: '1d', ms: 24 * 60 * 60 * 1000 },
    { label: '2d', ms: 2 * 24 * 60 * 60 * 1000 },
    { label: '4d', ms: 4 * 24 * 60 * 60 * 1000 },
    { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: '15d', ms: 15 * 24 * 60 * 60 * 1000 },
    { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
    { label: '60d', ms: 60 * 24 * 60 * 60 * 1000 }
  ];

  const tasks: ReviewTask[] = intervals.map((interval, idx) => ({
    id: `task-${Date.now()}-${idx}`,
    scheduledDate: now + interval.ms,
    status: 'future' as const,
    intervalLabel: interval.label
  }));

  // 第一个任务设为 pending
  if (tasks.length > 0) {
    tasks[0].status = 'pending';
  }

  return {
    id: `plan-${Date.now()}`,
    title,
    sourceType,
    sourceId,
    createdDate: now,
    tasks,
    progress: 0,
    tags: []
  };
}

// 完成任务时更新状态
function handleCompleteTask(planId: string, taskId: string) {
  setStudyPlans(plans => plans.map(plan => {
    if (plan.id !== planId) return plan;

    const updatedTasks = plan.tasks.map(task => {
      if (task.id === taskId) {
        return { ...task, status: 'completed' as const, completedDate: Date.now() };
      }
      return task;
    });

    // 激活下一个 future 任务
    const nextFutureIdx = updatedTasks.findIndex(t => t.status === 'future');
    if (nextFutureIdx !== -1) {
      updatedTasks[nextFutureIdx].status = 'pending';
    }

    // 计算进度
    const completedCount = updatedTasks.filter(t => t.status === 'completed').length;
    const progress = Math.round((completedCount / updatedTasks.length) * 100);

    return { ...plan, tasks: updatedTasks, progress };
  }));
}
```

---

## 样式特性

所有组件均支持:
- ✅ Dark mode (使用 CSS 变量)
- ✅ 响应式设计
- ✅ Tailwind CSS v4
- ✅ Lucide React 图标
- ✅ 平滑过渡动画
- ✅ 自定义滚动条 (custom-scrollbar)
- ✅ 中英文双语支持

---

## 测试建议

1. **DiffView**: 使用 AI 润色功能生成对比文本
2. **AnalyticsDashboard**: 完成多个测验后查看统计
3. **LearningRoadmap**: 创建学习计划并标记任务完成

---

## 后续优化建议

1. **DiffView**: 添加逐行编辑功能
2. **AnalyticsDashboard**: 集成更多图表库 (如 Recharts)
3. **LearningRoadmap**: 实现完整的日历视图
4. **数据持久化**: 将 examHistory 和 studyPlans 保存到 Electron DB

---

Created by: Claude Code (Front-End Master)
Date: 2025-12-08
