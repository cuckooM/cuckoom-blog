# 多语言重构计划（方案A：渐进式）

## 目标
将当前硬编码路径方案重构为基于 `page.lang` 的标准 Hexo i18n 方案，以支持未来更多语言。

## 实施阶段

### 第一阶段：Helper 重构（优先级：高）

**文件**：`scripts/localized_url_helper.js`

**改动**：
- 移除硬编码的 `page.path.startsWith('en/')` 检查
- 改用 `this.page.lang || 'zh-CN'` 判断当前语言
- 动态生成语言前缀：`langPrefix = lang === 'zh-CN' ? '' : '/' + lang.toLowerCase()`
- 支持任意语言（只需添加配置，无需修改代码）

**新增 Helper**：
- `get_current_lang()`：获取当前语言上下文
- `is_non_default_lang()`：判断是否是非默认语言

**影响范围**：
- 所有使用 `localized_url_for` 的模板（8个）
- 测试：验证中英文链接仍然正确

---

### 第二阶段：Generator 优化（优先级：中）

**问题**：当前有 7 个自定义 generator（en_tag_generator、en_category_generator 等）

**改动**：
- 合并为通用的 `localized_generator.js`
- 根据 `_config.yml` 中的语言配置动态生成
- 减少代码重复

**配置示例**：
```yaml
# _config.yml
languages:
  - code: zh-CN
    name: 中文
    prefix: ''  # 默认语言无前缀
  - code: en
    name: English
    prefix: 'en'
  # 未来语言：
  - code: jp
    name: 日本語
    prefix: 'jp'
```

---

### 第三阶段：文章处理优化（优先级：中）

**当前**：手动判断 `post.lang === 'en'` 或 `post.path.startsWith('en/')`

**改进**：
- 统一使用 `post.lang` 属性
- 确保所有文章都有 `lang` 字段（包括默认语言的）
- Helper 提供统一的过滤方法

**新增 Helper**：
```javascript
hexo.extend.helper.register('filter_by_lang', function(items) {
  const lang = this.page.lang || 'zh-CN';
  return items.filter(item => item.lang === lang);
});
```

---

### 第四阶段：配置标准化（优先级：低）

**目标**：
- 使用 Hexo 官方 hexo-generator-i18n 插件
- 标准化语言切换逻辑
- 减少自定义代码量

**保留**：
- 主题相关的特殊处理（tags、categories 页面）
- 语言特定的 URL 转换逻辑

---

## 测试验证

每个阶段完成后需要验证：
1. 中文环境链接正确（/categories/Java/）
2. 英文环境链接正确（/en/categories/Java/）
3. 标签、分类、归档数量正确
4. 构建速度正常（<2s）

---

## 风险控制

- ✓ 渐进式重构，每个阶段独立验证
- ✓ 保留现有功能，只改实现方式
- ✓ 如果某个阶段有问题，可以回滚到上一阶段
- ✓ 先重构 helper，测试后再重构其他部分

---

## 时间估算

- 第一阶段：Helper 重构 → 1-2小时
- 第二阶段：Generator 合并 → 2-3小时
- 第三阶段：文章处理 → 1小时
- 第四阶段：配置标准化 → 1-2小时

总计：5-8小时

---

## 完成标志

重构完成后，添加新语言只需：
1. 在 `_config.yml` 添加语言配置
2. 创建对应的文章（添加 `lang: new-lang` 字段）
3. 无需修改任何代码

这才是真正的多语言支持。