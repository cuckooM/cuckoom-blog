# 多语言重构需求 - PM 审查报告

## 一、需求审查结论

### 需求合理性评估

| 维度 | 评估结果 | 说明 |
|------|---------|------|
| **问题定义** | ✅ 合理 | 硬编码问题确实存在，已在 22+ 模板文件中发现 `page.path.startsWith('en/')` 模式 |
| **技术方案** | ✅ 合理 | 基于 `page.lang` 属性符合 Hexo 最佳实践 |
| **扩展性目标** | ✅ 合理 | 支持日语、韩语等语言扩展有实际价值 |
| **工作量估算** | ⚠️ 偏乐观 | 7-11小时未充分考虑测试回归和边界情况 |

### 实际现状核实

经代码审查确认：

1. **Generator 文件**：3个（非文档所述7个）
   - `/scripts/en_posts_generator.js` - 约375行
   - `/scripts/en_tag_generator.js` - 约58行  
   - `/scripts/en_category_generator.js` - 约62行

2. **模板硬编码**：至少 12 个模板文件使用 `page.path.startsWith('en/')`：
   - `index.ejs`, `archive.ejs`, `category.ejs`, `tag.ejs`, `page.ejs`
   - `_partial/header.ejs`, `_partial/archive.ejs`, `_partial/sidebar-drawer.ejs`, `_partial/language-switcher.ejs`
   - `_widget/category.ejs` 等

3. **配置方式**：菜单在 `_config.yml` 中硬编码为 zh-CN/en 两套

---

## 二、验收标准完善建议

原验收标准不够具体，建议补充：

### 必须满足（P0）

| ID | 验收标准 | 验证方式 |
|----|---------|---------|
| AC-01 | 构建成功，无错误和警告 | `hexo clean && hexo g` |
| AC-02 | 中文页面路径保持不变（/categories/Java/） | 浏览器验证 |
| AC-03 | 英文页面路径正确（/en/categories/Java/） | 浏览器验证 |
| AC-04 | 语言切换器正确跳转 | 点击语言切换按钮验证 |
| AC-05 | 标签/分类/归档按语言正确统计 | 对比现有数据 |
| AC-06 | 模板中不再出现 `page.path.startsWith('en/')` | 代码审查 |
| AC-07 | Generator 合并为通用版本 | 文件数量减少 |

### 应当满足（P1）

| ID | 验收标准 | 验证方式 |
|----|---------|---------|
| AC-08 | 添加新语言仅需修改配置文件 | 模拟添加日语配置 |
| AC-09 | RSS feed 按语言正确生成 | 检查 feed 内容 |
| AC-10 | 搜索功能按语言筛选 | 测试搜索结果 |

### 可选满足（P2）

| ID | 验收标准 | 验证方式 |
|----|---------|---------|
| AC-11 | URL 可配置前缀格式（/en/ vs /en.） | 配置测试 |
| AC-12 | 支持语言回退机制 | 删除部分翻译内容验证 |

---

## 三、用户故事（User Stories）

### Epic: 多语言博客平台重构

#### Story 1: 统一语言判断机制
**优先级**: P0 | **估算**: 2h

```
作为 开发者
我希望 有一个统一的语言判断方法
以便 不再在每个模板中重复编写判断逻辑

验收条件:
- 提供 get_current_lang() helper
- 返回标准语言代码（zh-CN, en, jp, ko 等）
- 默认返回 zh-CN
- 兼容现有 page.lang 属性
```

#### Story 2: 通用语言前缀 Helper
**优先级**: P0 | **估算**: 1h

```
作为 开发者
我希望 有一个 helper 动态生成语言路径前缀
以便 同一套代码支持所有语言

验收条件:
- 提供 lang_prefix() helper
- 中文返回空字符串
- 英文返回 '/en'
- 日文返回 '/jp'（配置后）
- 与 url_for() helper 配合使用
```

#### Story 3: Generator 统一重构
**优先级**: P0 | **估算**: 3h

```
作为 维护者
我希望 合并 3 个英文专用 Generator 为通用版本
以便 减少代码重复，便于维护

验收条件:
- 创建通用 multi_lang_generator.js
- 根据 _config.yml 语言配置动态生成页面
- 生成的 page 对象包含 lang 属性
- 删除 en_*.js 专用文件
- 功能完全对等
```

#### Story 4: 模板统一改造
**优先级**: P0 | **估算**: 4h

```
作为 开发者
我希望 所有模板使用新的 helper 方法
以便 代码可维护且支持扩展

验收条件:
- 移除所有 page.path.startsWith('en/') 硬编码
- 使用 get_current_lang() 替代手动判断
- 使用 lang_prefix() 生成路径
- 语言切换器使用配置驱动
```

#### Story 5: 语言配置标准化
**优先级**: P0 | **估算**: 1h

```
作为 站点管理员
我希望 在 _config.yml 中统一配置支持的语言
以便 无需修改代码即可扩展语言

验收条件:
- 支持类似以下配置格式:
  languages:
    - code: zh-CN
      default: true
    - code: en
      prefix: en
    - code: jp
      prefix: jp
- 菜单配置支持语言变量
```

#### Story 6: 新语言快速添加
**优先级**: P1 | **估算**: 1h

```
作为 站点管理员
我希望 添加日语支持只需配置和创建内容
以便 快速扩展国际市场

验收条件:
- 在 _config.yml 添加 jp 配置
- 创建 source/jp/ 目录和内容
- 运行 hexo g 后自动生成 /jp/ 路径页面
- 无需修改任何代码文件
```

#### Story 7: 语言统计准确性
**优先级**: P1 | **估算**: 2h

```
作为 博客读者
我希望 标签/分类/归档数量按当前语言统计
以便 了解该语言下的内容规模

验收条件:
- 中文页面只显示中文文章的统计
- 英文页面只显示英文文章的统计
- 新语言同理
```

---

## 四、优先级排序

### Sprint 1（核心重构）- 必须完成

| 序号 | 用户故事 | 优先级 | 依赖 | 估算 |
|-----|---------|-------|------|-----|
| 1 | Story 5: 语言配置标准化 | P0 | - | 1h |
| 2 | Story 1: 统一语言判断机制 | P0 | #1 | 2h |
| 3 | Story 2: 通用语言前缀 Helper | P0 | #1 | 1h |
| 4 | Story 3: Generator 统一重构 | P0 | #1, #2, #3 | 3h |
| 5 | Story 4: 模板统一改造 | P0 | #2, #3, #4 | 4h |

**Sprint 1 总计**: 11h

### Sprint 2（扩展与验证）- 建议完成

| 序号 | 用户故事 | 优先级 | 依赖 | 估算 |
|-----|---------|-------|------|-----|
| 6 | Story 7: 语言统计准确性 | P1 | Sprint 1 | 2h |
| 7 | Story 6: 新语言快速添加 | P1 | Sprint 1 | 1h |

**Sprint 2 总计**: 3h

---

## 五、风险评估与缓解措施

| 风险 | 概率 | 影响 | 缓解措施 |
|-----|-----|-----|---------|
| 模板改造遗漏 | 中 | 高 | 使用 grep 搜索验证，逐文件审查 |
| Generator 合并功能退化 | 中 | 高 | 对比测试现有功能点 |
| page.lang 属性缺失 | 低 | 高 | 添加默认值兜底逻辑 |
| RSS/Search 插件兼容 | 中 | 中 | 单独验证这些功能 |
| URL 格式变化影响 SEO | 低 | 中 | 保持现有 URL 格式不变 |

---

## 六、建议的迭代计划

### Phase 1: 基础设施（Day 1）
1. 创建语言配置结构
2. 实现 helper 方法
3. 单元测试 helper

### Phase 2: Generator 重构（Day 2）
1. 创建通用 generator
2. 对比验证功能
3. 删除旧文件

### Phase 3: 模板改造（Day 3）
1. 批量替换硬编码
2. 语言切换器重构
3. 逐页面验证

### Phase 4: 集成测试（Day 4）
1. 全站构建验证
2. 功能点检查
3. 文档更新

---

## 七、签署确认

| 角色 | 状态 | 说明 |
|-----|------|------|
| PM | ✅ 已审查 | 本文档 |
| SA | ⏳ 待审查 | 需输出技术设计文档 |
| Dev | ⏳ 待评估 | 需确认工作量估算 |
| QA | ⏳ 待验收 | 需制定测试用例 |

---

## 八、附录：现有代码统计

### Generator 文件

| 文件 | 行数 | 功能 |
|-----|------|------|
| en_posts_generator.js | 375 | 英文文章生成（含索引/归档/分类/标签页） |
| en_tag_generator.js | 58 | 英文标签页生成 |
| en_category_generator.js | 62 | 英文分类页生成 |
| **合计** | **495** | |

### 模板文件使用硬编码统计

| 文件 | 硬编码次数 |
|-----|-----------|
| index.ejs | 1 |
| archive.ejs | 1 |
| category.ejs | 1 |
| tag.ejs | 1 |
| page.ejs | 1 |
| _partial/header.ejs | 1 |
| _partial/archive.ejs | 1 |
| _partial/sidebar-drawer.ejs | 1 |
| _partial/language-switcher.ejs | 1 |
| _widget/category.ejs | 3+ |
| tags.ejs | 1 |
| categories.ejs | 1 |
| **合计** | **15+** |

---

*审查完成时间: 2026-06-09*
*审查人: PM Agent*