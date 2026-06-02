# CuckooM Blog — 技术架构设计文档

> 文档版本: v1.0
> 创建日期: 2026-06-01
> 架构范围: CSS变量体系 + 深色模式 + 文件修改清单

---

## 一、技术方案概述

### 1.1 技术栈（保持不变）

| 层 | 技术 | 说明 |
|----|------|------|
| 模板 | EJS (`.ejs`) | Hexo 默认模板引擎 |
| 样式 | Stylus (`.styl`) | CSS 预处理器 |
| 脚本 | Vanilla JS + jQuery 3.6.4 | 已引入 jQuery |
| 构建 | Hexo generate | 静态站点生成 |

### 1.2 开发策略

- **渐进式改造**: 在 landscape 主题基础上逐步替换，不创建新主题
- **CSS 变量优先**: 使用 CSS Custom Properties 实现深色模式
- **保留已有定制**: 双语系统、搜索、语言切换器等全部保留

---

## 二、CSS 变量体系设计

### 2.1 新增变量定义文件

创建 `themes/landscape/source/css/_design-system.styl`:

```stylus
// ============================================
// CuckooM Blog Design System - CSS Variables
// ============================================

:root
  // === Colors (Light Mode) ===
  --color-primary: #4A90D9
  --color-bg: #FAFAFA
  --color-card-bg: #FFFFFF
  --color-text-primary: #333333
  --color-text-secondary: #666666
  --color-border: #E8E8E8
  --color-link: #258FB8
  --color-tag-bg: #E8F0FE
  --color-tag-text: #4A90D9
  --color-code-bg: #F5F5F5
  
  // === Gradients ===
  --gradient-hero-start: #4A90D9
  --gradient-hero-end: #7C5CBF
  
  // === Spacing (8px grid) ===
  --space-xs: 4px
  --space-sm: 8px
  --space-md: 16px
  --space-lg: 24px
  --space-xl: 32px
  --space-2xl: 48px
  --space-3xl: 64px
  
  // === Typography ===
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif
  --font-mono: "Source Code Pro", Consolas, Monaco, "Noto Sans Mono", monospace
  --font-size-base: 16px
  --font-size-sm: 14px
  --font-size-xs: 13px
  --line-height-base: 1.6em
  --line-height-heading: 1.2em
  
  // === Shadows ===
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.08)
  --shadow-card-hover: 0 4px 16px rgba(0, 0, 0, 0.12)
  --shadow-header: 0 1px 4px rgba(0, 0, 0, 0.08)
  
  // === Border Radius ===
  --radius-card: 12px
  --radius-btn: 8px
  --radius-tag: 4px
  --radius-input: 8px
  
  // === Transitions ===
  --transition-fast: 0.2s ease
  --transition-normal: 0.3s ease
  --transition-slow: 0.5s ease
  
  // === Layout ===
  --content-max-width: 720px
  --header-height: 60px
  --sidebar-width: 300px

// === Dark Mode Variables ===
[data-theme="dark"]
  --color-primary: #64B5F6
  --color-bg: #1A1A2E
  --color-card-bg: #16213E
  --color-text-primary: #E0E0E0
  --color-text-secondary: #A0A0A0
  --color-border: #2D2D44
  --color-link: #64B5F6
  --color-tag-bg: #1E3A5F
  --color-tag-text: #90CAF9
  --color-code-bg: #0D1117
  
  --gradient-hero-start: #1A1A2E
  --gradient-hero-end: #16213E
  
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.24)
  --shadow-card-hover: 0 4px 16px rgba(0, 0, 0, 0.32)
  --shadow-header: 0 1px 4px rgba(0, 0, 0, 0.24)

// === System Preference Auto-Detection ===
@media (prefers-color-scheme: dark)
  :root:not([data-theme="light"])
    --color-primary: #64B5F6
    --color-bg: #1A1A2E
    --color-card-bg: #16213E
    --color-text-primary: #E0E0E0
    --color-text-secondary: #A0A0A0
    --color-border: #2D2D44
    --color-link: #64B5F6
    --color-tag-bg: #1E3A5F
    --color-tag-text: #90CAF9
    --color-code-bg: #0D1117
    --gradient-hero-start: #1A1A2E
    --gradient-hero-end: #16213E
    --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.24)
    --shadow-card-hover: 0 4px 16px rgba(0, 0, 0, 0.32)
```

### 2.2 组件样式文件

创建 `themes/landscape/source/css/_components/_card.styl`:

```stylus
// Article Card Component
.article-card
  background: var(--color-card-bg)
  border-radius: var(--radius-card)
  padding: var(--space-lg)
  margin-bottom: var(--space-xl)
  box-shadow: var(--shadow-card)
  transition: transform var(--transition-fast), box-shadow var(--transition-fast)
  max-width: var(--content-max-width)
  
  &:hover
    transform: translateY(-2px)
    box-shadow: var(--shadow-card-hover)
  
  .card-title
    font-size: 20px
    font-weight: 600
    color: var(--color-text-primary)
    margin-bottom: var(--space-sm)
    
    a
      color: inherit
      &:hover
        color: var(--color-primary)
  
  .card-meta
    font-size: var(--font-size-xs)
    color: var(--color-text-secondary)
    margin-bottom: var(--space-md)
    
    .meta-item
      display: inline-block
      margin-right: var(--space-sm)
      
      &::after
        content: "·"
        margin-left: var(--space-sm)
      
      &:last-child::after
        content: ""
  
  .card-excerpt
    font-size: 15px
    line-height: var(--line-height-base)
    color: var(--color-text-secondary)
    display: -webkit-box
    -webkit-line-clamp: 3
    -webkit-box-orient: vertical
    overflow: hidden
    margin-bottom: var(--space-md)
  
  .card-tags
    margin-bottom: var(--space-md)
    
    .tag-pill
      display: inline-block
      background: var(--color-tag-bg)
      color: var(--color-tag-text)
      font-size: var(--font-size-xs)
      padding: 4px 10px
      border-radius: var(--radius-tag)
      margin-right: 6px
      
      &:hover
        opacity: 0.8
  
  .card-read-more
    text-align: right
    
    a
      color: var(--color-primary)
      font-size: var(--font-size-sm)
      font-weight: 500
      
      &:hover
        text-decoration: underline
```

创建 `themes/landscape/source/css/_components/_hero.styl`:

```stylus
// Hero Section Component
.hero-section
  background: linear-gradient(135deg, var(--gradient-hero-start), var(--gradient-hero-end))
  padding: var(--space-3xl) var(--space-lg)
  text-align: center
  color: #FFFFFF
  position: relative
  
  // Homepage full hero
  &.hero-full
    min-height: 200px
    max-height: 360px
    height: 45vh
    
  // Other pages simplified hero
  &.hero-simple
    min-height: 120px
    max-height: 200px
    height: 25vh
  
  .hero-title
    font-size: 32px
    font-weight: 700
    margin-bottom: var(--space-sm)
    
  .hero-subtitle
    font-size: 18px
    font-weight: 400
    opacity: 0.9
    margin-bottom: var(--space-md)
    
  .hero-description
    font-size: 15px
    font-weight: 400
    opacity: 0.8
    max-width: 600px
    margin: 0 auto
```

创建 `themes/landscape/source/css/_components/_sidebar-drawer.styl`:

```stylus
// Sidebar Drawer Component
.sidebar-drawer
  position: fixed
  right: -var(--sidebar-width)
  top: var(--header-height)
  width: var(--sidebar-width)
  height: calc(100vh - var(--header-height))
  background: var(--color-card-bg)
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12)
  z-index: 100
  transition: right var(--transition-normal)
  overflow-y: auto
  padding: var(--space-lg)
  
  &.is-open
    right: 0
  
  .drawer-close
    position: absolute
    top: var(--space-md)
    right: var(--space-md)
    font-size: 24px
    color: var(--color-text-secondary)
    cursor: pointer
    
    &:hover
      color: var(--color-primary)
  
  .drawer-widget
    margin-bottom: var(--space-xl)
    
    .widget-title
      font-size: 16px
      font-weight: 600
      color: var(--color-text-primary)
      padding-bottom: var(--space-sm)
      border-bottom: 1px solid var(--color-border)
      margin-bottom: var(--space-md)
    
    .widget-list
      list-style: none
      padding: 0
      
      li
        font-size: var(--font-size-sm)
        color: var(--color-text-secondary)
        margin-bottom: var(--space-sm)
        
        a
          color: inherit
          
          &:hover
            color: var(--color-primary)

// Overlay for drawer
.drawer-overlay
  position: fixed
  top: 0
  left: 0
  width: 100%
  height: 100%
  background: rgba(0, 0, 0, 0.3)
  z-index: 99
  opacity: 0
  visibility: hidden
  transition: opacity var(--transition-normal), visibility var(--transition-normal)
  
  &.is-visible
    opacity: 1
    visibility: visible

// Mobile full-width drawer
@media screen and (max-width: 767px)
  .sidebar-drawer
    width: 100%
    right: -100%
```

---

## 三、深色模式实现方案

### 3.1 JavaScript 实现

创建 `themes/landscape/source/js/theme-toggle.js`:

```javascript
(function() {
  'use strict';
  
  const THEME_KEY = 'cuckoom-blog-theme';
  const DARK = 'dark';
  const LIGHT = 'light';
  
  // 获取当前主题
  function getTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored;
    
    // 无存储时跟随系统偏好
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
  }
  
  // 应用主题
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateToggleButton(theme);
  }
  
  // 更新切换按钮图标
  function updateToggleButton(theme) {
    const btn = document.querySelector('.theme-toggle-btn');
    if (!btn) return;
    
    const icon = btn.querySelector('.theme-icon');
    if (theme === DARK) {
      icon.textContent = '☀️';
      icon.setAttribute('aria-label', '切换到浅色模式');
    } else {
      icon.textContent = '🌙';
      icon.setAttribute('aria-label', '切换到深色模式');
    }
  }
  
  // 切换主题
  function toggleTheme() {
    const current = getTheme();
    const next = current === DARK ? LIGHT : DARK;
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }
  
  // 初始化
  function init() {
    applyTheme(getTheme());
    
    // 监听系统偏好变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? DARK : LIGHT);
      }
    });
    
    // 绑定切换按钮
    const btn = document.querySelector('.theme-toggle-btn');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
    }
  }
  
  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

### 3.2 模板修改

在 `layout/_partial/header.ejs` 中添加切换按钮:

```ejs
<button class="theme-toggle-btn" aria-label="切换主题">
  <span class="theme-icon" aria-hidden="true">🌙</span>
</button>
```

---

## 四、文件修改清单

### 4.1 需修改的文件

| 文件 | 修改内容 |
|------|----------|
| `source/css/style.styl` | 导入新的设计系统文件 |
| `source/css/_variables.styl` | 添加新变量引用 |
| `source/css/_partial/header.styl` | 重构导航栏样式 |
| `source/css/_partial/footer.styl` | 重构 Footer 样式 |
| `source/css/_partial/article.styl` | 重构文章卡片样式 |
| `source/css/_partial/sidebar.styl` | 重构边栏为抽屉样式 |
| `layout/layout.ejs` | 添加主题切换脚本 |
| `layout/index.ejs` | 重构首页 Hero + 卡片列表 |
| `layout/post.ejs` | 重构文章详情页布局 |
| `layout/archive.ejs` | 重构归档页时间线样式 |
| `layout/_partial/header.ejs` | 添加主题切换按钮 |
| `layout/_partial/sidebar.ejs` | 重构为可折叠抽屉 |

### 4.2 需新增的文件

| 文件 | 用途 |
|------|------|
| `source/css/_design-system.styl` | CSS 变量定义 |
| `source/css/_components/_card.styl` | 卡片组件样式 |
| `source/css/_components/_hero.styl` | Hero 区域样式 |
| `source/css/_components/_sidebar-drawer.styl` | 可折叠边栏样式 |
| `source/js/theme-toggle.js` | 深色模式切换脚本 |

---

## 五、实现步骤

### Phase 1: 基础架构（优先级 P0）

1. **创建设计系统文件**
   - 创建 `_design-system.styl` 定义所有 CSS 变量
   - 创建 `_components/` 目录及组件样式文件
   - 在 `style.styl` 中导入新文件

2. **实现深色模式框架**
   - 创建 `theme-toggle.js`
   - 在 `layout.ejs` 中引入脚本
   - 测试主题切换功能

3. **重构 Header**
   - 修改 `header.ejs` 添加切换按钮
   - 重构 `header.styl` 使用 CSS 变量
   - 实现滚动时的样式变化

### Phase 2: 页面重构（优先级 P1）

4. **首页重构**
   - 修改 `index.ejs` 实现 Hero + 卡片布局
   - 创建卡片模板 partial
   - 移除原有边栏占位

5. **可折叠边栏**
   - 重构 `sidebar.ejs` 为抽屉组件
   - 实现展开/收起 JS 逻辑
   - 添加遮罩层

6. **文章详情页**
   - 重构 `post.ejs` 布局
   - 优化正文排版样式
   - 实现文章导航

### Phase 3: 其他页面（优先级 P2）

7. **归档/分类/标签页**
   - 重构时间线样式
   - 统一卡片风格

8. **移动端适配**
   - 测试各页面移动端表现
   - 调整响应式断点

9. **深色模式验证**
   - 检查所有页面深色模式覆盖
   - 验证代码块高亮切换

---

## 六、关键代码结构

### 6.1 style.styl 导入顺序

```stylus
// 设计系统（最先导入）
@import "_design-system"

// 原有变量（保留但不优先使用）
@import "_variables"

// 组件样式
@import "_components/_card"
@import "_components/_hero"
@import "_components/_sidebar-drawer"

// 原有 partial 样式（逐步替换）
@import "_partial/header"
@import "_partial/footer"
@import "_partial/article"
@import "_partial/sidebar"
// ...
```

### 6.2 layout.ejs 结构

```ejs
<!DOCTYPE html>
<html lang="<%= config.language || 'zh-CN' %>">
<head>
  <!-- ... -->
</head>
<body>
  <%- partial('_partial/header') %>
  
  <main class="main-content">
    <%- body %>
  </main>
  
  <%- partial('_partial/footer') %>
  
  <!-- 侧栏抽屉 -->
  <div class="drawer-overlay"></div>
  <%- partial('_partial/sidebar-drawer') %>
  
  <!-- 脚本 -->
  <script src="<%= url_for('/js/script.js') %>"></script>
  <script src="<%= url_for('/js/theme-toggle.js') %>"></script>
</body>
</html>
```

---

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| CSS 变量兼容性 | 低 | 现代浏览器均支持，降级时可回退到旧变量 |
| 深色模式遗漏 | 中 | 建立检查清单，逐页面验证 |
| 双语功能破坏 | 高 | 保留所有语言判断逻辑，仅改样式 |
| 移动端布局问题 | 中 | 每阶段完成后进行移动端测试 |

---

## 八、验收标准

- [ ] CSS 变量体系完整，浅色/深色模式变量齐全
- [ ] 深色模式切换正常，localStorage 持久化有效
- [ ] 系统偏好自动检测生效
- [ ] 所有页面使用 CSS 变量，无硬编码颜色
- [ ] Hexo 构建无报错
- [ ] 本地预览正常