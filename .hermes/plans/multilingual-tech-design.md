# 多语言重构技术设计文档

## 一、架构师签署
| 角色 | 状态 | 日期 |
|------|------|------|
| SA (系统架构师) | 已完成 | 2026-06-09 |

---

## 二、现有架构分析

### 2.1 文件结构
```
scripts/
├── en_posts_generator.js      (375行) - 英文文章生成器
├── en_tag_generator.js       (58行)  - 英文标签页生成器
├── en_category_generator.js  (62行)  - 英文分类页生成器
├── en_tagcloud_helper.js     - 英文标签云助手
├── localized_url_helper.js   (57行)  - 本地化URL助手
└── bilingual_content_processor.js (101行) - 双语内容处理器
```

### 2.2 问题诊断

| 问题类型 | 现状 | 影响 |
|---------|------|------|
| 硬编码语言判断 | `page.path.startsWith('en/')` | 扩展新语言需修改代码 |
| Generator 重复 | 3个英文专用Generator | 代码冗余，维护成本高 |
| 语言配置分散 | 硬编码在各文件 | 无法集中管理 |

### 2.3 现有数据流
```
source/_posts/*.md (lang: en)
       ↓
en_posts_generator.js (过滤 post.lang === 'en')
       ↓
生成 /en/ 路径页面
       ↓
模板通过 page.path.startsWith('en/') 判断语言
```

---

## 三、目标架构设计

### 3.1 核心设计原则
1. **配置驱动**: 语言配置集中管理
2. **属性优先**: 使用 `page.lang` 替代路径判断
3. **单一职责**: Generator 不关心具体语言
4. **可扩展性**: 新增语言仅需配置

### 3.2 配置结构设计

```yaml
# _config.yml 新增配置
languages:
  - code: zh-CN
    prefix: ""           # 默认语言无前缀
    default: true
  - code: en
    prefix: "en"
  - code: ja            # 未来扩展
    prefix: "ja"
```

### 3.3 Helper 接口设计

#### 3.3.1 get_current_lang()
```javascript
// 返回当前页面语言代码
hexo.extend.helper.register('get_current_lang', function() {
  return this.page.lang || 'zh-CN';
});
```

#### 3.3.2 lang_prefix()
```javascript
// 返回当前语言的URL前缀
hexo.extend.helper.register('lang_prefix', function() {
  const lang = this.page.lang || 'zh-CN';
  return lang === 'zh-CN' ? '' : '/' + lang.toLowerCase();
});
```

#### 3.3.3 localized_url_for(path)
```javascript
// 生成本地化URL
hexo.extend.helper.register('localized_url_for', function(path) {
  const lang = this.page.lang || 'zh-CN';
  const prefix = lang === 'zh-CN' ? '' : '/' + lang.toLowerCase();
  let normalizedPath = path.startsWith('/') ? path : '/' + path;
  
  // 已有语言前缀则直接返回
  if (normalizedPath.match(/^\/(en|ja|ko)\//)) {
    return this.url_for(normalizedPath);
  }
  
  // 非默认语言添加前缀
  if (lang !== 'zh-CN') {
    normalizedPath = prefix + normalizedPath;
  }
  
  return this.url_for(normalizedPath);
});
```

#### 3.3.4 is_non_default_lang()
```javascript
// 判断是否非默认语言
hexo.extend.helper.register('is_non_default_lang', function() {
  return (this.page.lang || 'zh-CN') !== 'zh-CN';
});
```

### 3.4 Generator 重构设计

#### 3.4.1 统一多语言生成器 (multi_lang_generator.js)

```javascript
// 设计思路
hexo.extend.generator.register('multi_lang_posts', function(locals) {
  const config = this.config.languages || [{code: 'zh-CN', default: true}];
  const defaultLang = config.find(l => l.default)?.code || 'zh-CN';
  
  // 按语言分组
  const postsByLang = {};
  locals.posts.toArray().forEach(post => {
    const lang = post.lang || defaultLang;
    if (!postsByLang[lang]) postsByLang[lang] = [];
    postsByLang[lang].push(post);
  });
  
  // 为每种语言生成页面
  const results = [];
  Object.entries(postsByLang).forEach(([lang, posts]) => {
    const langConfig = config.find(l => l.code === lang);
    const prefix = langConfig?.prefix || '';
    
    posts.forEach(post => {
      const path = prefix ? `${prefix}/${post.path}` : post.path;
      results.push({
        path: path,
        layout: post.layout,
        data: { ...post, lang: lang }
      });
    });
  });
  
  return results;
});
```

### 3.5 数据流重构

```
source/_posts/*.md (lang: en)
       ↓
multi_lang_generator.js (读取 config.languages)
       ↓
根据配置生成多语言路径
       ↓
模板通过 page.lang 判断语言
```

---

## 四、实施计划

### Phase 1: Helper 重构 (已完成)
- [x] localized_url_helper.js 改用 page.lang
- [x] bilingual_content_processor.js 改用 page.lang
- [x] 构建验证通过

### Phase 2: Generator 重构
- [x] 创建 multi_lang_generator.js
- [x] 合并 en_posts_generator.js 功能
- [x] 合并 en_tag_generator.js 功能
- [x] 合并 en_category_generator.js 功能
- [x] 对比测试验证 (117 files generated, 无 ERROR/WARN)

### Phase 3: 模板改造
- [ ] 移除所有 page.path.startsWith('en/')
- [ ] 使用新 helper 方法
- [ ] 语言切换器重构

### Phase 4: 配置标准化
- [ ] _config.yml 添加 languages 配置
- [ ] 菜单配置支持多语言

---

## 五、风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| Generator 合并功能退化 | 高 | 保留旧文件，对比测试 |
| 模板改造遗漏 | 中 | grep 搜索验证 |
| URL 变化影响 SEO | 低 | 保持现有 URL 格式 |

---

## 六、签核记录

| 阶段 | 签核人 | 状态 |
|------|--------|------|
| 技术设计 | SA | ✅ 已完成 |
| 工作量评估 | Dev | ⏳ 待评估 |
| 代码实施 | Dev | ⏳ 待实施 |
| 验收测试 | QA | ⏳ 待验收 |