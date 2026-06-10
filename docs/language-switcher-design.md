# 三语言切换器设计方案

## 项目信息
- 博客路径：`~/work/code/cuckoom-blog`
- 主题：landscape
- 语言支持：zh-CN（中文 `/`）、en（英文 `/en/`）、ko（韩语 `/ko/`）

---

## 方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A. 下拉菜单** | 点击当前语言显示下拉列表 | 节省空间，优雅简洁 | 需要额外点击 |
| **B. 平铺按钮** | 三个按钮并排显示 | 直观，一键切换 | 占用空间较大 |
| **C. 图标+下拉** | 地球图标+下拉菜单 | 更具视觉识别度 | 稍复杂 |

**推荐方案：A（下拉菜单）** - 简洁优雅，移动端友好

---

## 方案 A：下拉菜单（推荐）

### 效果预览

```
┌─────────────────────────────────────────────────────────────┐
│  Logo          首页 归档 分类 关于      🔍 🌙  中文 ▼   │
└─────────────────────────────────────────────────────────────┘
                                           ↓ 点击后
                                    ┌─────────┐
                                    │ 中文    │ ← 当前语言高亮
                                    │ English │
                                    │ 한국어  │
                                    └─────────┘
```

### EJS 代码

```ejs
<%
  var currentLang = page.lang || "zh-CN";
  var langMap = {
    'zh-CN': { label: '中文', path: '/' },
    'en': { label: 'English', path: '/en/' },
    'ko': { label: '한국어', path: '/ko/' }
  };
  var currentLangData = langMap[currentLang];
%>
<div class="lang-switcher">
  <button class="lang-switcher-btn" aria-label="选择语言" aria-expanded="false">
    <span class="lang-current"><%= currentLangData.label %></span>
    <span class="lang-arrow">▼</span>
  </button>
  <ul class="lang-dropdown">
    <% Object.keys(langMap).forEach(function(lang) { %>
      <% if (lang !== currentLang) { %>
        <li>
          <a href="<%= langMap[lang].path %>" class="lang-option">
            <%= langMap[lang].label %>
          </a>
        </li>
      <% } else { %>
        <li>
          <span class="lang-option lang-active"><%= langMap[lang].label %></span>
        </li>
      <% } %>
    <% }); %>
  </ul>
</div>
```

### CSS 样式（Stylus）

```stylus
// Language Switcher - Dropdown Style
.lang-switcher
  position: relative
  display: inline-block

.lang-switcher-btn
  display: flex
  align-items: center
  gap: var(--space-xs)
  font-size: var(--font-size-sm)
  font-weight: 500
  color: var(--color-text-primary)
  background: transparent
  border: none
  padding: var(--space-xs) var(--space-sm)
  border-radius: var(--radius-btn)
  cursor: pointer
  transition: color var(--transition-fast), background var(--transition-fast)

  &:hover
    color: var(--color-primary)
    background: rgba(0, 0, 0, 0.05)

  // White text on hero gradient
  .site-header:not(.scrolled):not(.no-hero) &
    color: #FFFFFF
    &:hover
      color: rgba(255, 255, 255, 0.85)
      background: rgba(255, 255, 255, 0.15)

  // Dark text when scrolled
  .site-header.scrolled &
    color: var(--color-text-primary)
    &:hover
      color: var(--color-primary)
      background: rgba(0, 0, 0, 0.05)

.lang-arrow
  font-size: 10px
  transition: transform var(--transition-fast)

.lang-switcher.open .lang-arrow
  transform: rotate(180deg)

.lang-dropdown
  position: absolute
  top: 100%
  right: 0
  min-width: 120px
  margin-top: var(--space-xs)
  padding: var(--space-xs) 0
  background: var(--color-card-bg)
  border-radius: var(--radius-btn)
  box-shadow: var(--shadow-card-hover)
  opacity: 0
  visibility: hidden
  transform: translateY(-8px)
  transition: opacity var(--transition-fast), transform var(--transition-fast), visibility var(--transition-fast)
  z-index: 100

  li
    list-style: none

.lang-option
  display: block
  padding: var(--space-sm) var(--space-md)
  font-size: var(--font-size-sm)
  color: var(--color-text-primary)
  text-decoration: none
  cursor: pointer
  transition: background var(--transition-fast)

  &:hover
    background: rgba(0, 0, 0, 0.05)
    color: var(--color-primary)

.lang-active
  color: var(--color-primary)
  font-weight: 600
  background: rgba(74, 144, 217, 0.1)

// Open state
.lang-switcher.open .lang-dropdown
  opacity: 1
  visibility: visible
  transform: translateY(0)

// Mobile styles
@media screen and (max-width: 767px)
  .lang-dropdown
    right: auto
    left: 50%
    transform: translateX(-50%) translateY(-8px)
  
  .lang-switcher.open .lang-dropdown
    transform: translateX(-50%) translateY(0)
```

---

## 方案 B：平铺按钮

### 效果预览

```
┌─────────────────────────────────────────────────────────────────────┐
│  Logo          首页 归档 分类 关于      🔍 🌙  中文 | EN | 한국어 │
└─────────────────────────────────────────────────────────────────────┘
                                         ↑ 当前语言高亮，不可点击
```

### EJS 代码

```ejs
<%
  var currentLang = page.lang || "zh-CN";
  var langMap = {
    'zh-CN': { label: '中文', path: '/' },
    'en': { label: 'EN', path: '/en/' },
    'ko': { label: '한국어', path: '/ko/' }
  };
%>
<div class="lang-switcher-inline">
  <% Object.keys(langMap).forEach(function(lang, index) { %>
    <% if (lang === currentLang) { %>
      <span class="lang-item lang-active"><%= langMap[lang].label %></span>
    <% } else { %>
      <a href="<%= langMap[lang].path %>" class="lang-item"><%= langMap[lang].label %></a>
    <% } %>
    <% if (index < Object.keys(langMap).length - 1) { %>
      <span class="lang-divider">|</span>
    <% } %>
  <% }); %>
</div>
```

### CSS 样式

```stylus
// Language Switcher - Inline Style
.lang-switcher-inline
  display: flex
  align-items: center
  gap: var(--space-xs)

.lang-item
  font-size: var(--font-size-sm)
  font-weight: 500
  color: var(--color-text-secondary)
  text-decoration: none
  padding: var(--space-xs) var(--space-sm)
  border-radius: var(--radius-btn)
  transition: color var(--transition-fast), background var(--transition-fast)

  &:hover
    color: var(--color-primary)
    background: rgba(0, 0, 0, 0.05)

  // White text on hero gradient
  .site-header:not(.scrolled):not(.no-hero) &
    color: rgba(255, 255, 255, 0.7)
    &:hover
      color: #FFFFFF
      background: rgba(255, 255, 255, 0.15)

  // Dark text when scrolled
  .site-header.scrolled &
    color: var(--color-text-secondary)
    &:hover
      color: var(--color-primary)

.lang-active
  color: var(--color-primary)
  font-weight: 600
  
  .site-header:not(.scrolled):not(.no-hero) &
    color: #FFFFFF
    font-weight: 700

.lang-divider
  color: var(--color-text-secondary)
  opacity: 0.3

  .site-header:not(.scrolled):not(.no-hero) &
    color: rgba(255, 255, 255, 0.5)
```

---

## 方案 C：图标 + 下拉菜单

### 效果预览

```
┌─────────────────────────────────────────────────────────────────┐
│  Logo          首页 归档 分类 关于      🔍 🌙  🌐 中文 ▼      │
└─────────────────────────────────────────────────────────────────┘
                                           ↓ 点击后
                                    ┌─────────┐
                                    │ 中文    │
                                    │ English │
                                    │ 한국어  │
                                    └─────────┘
```

### EJS 代码

```ejs
<%
  var currentLang = page.lang || "zh-CN";
  var langMap = {
    'zh-CN': { label: '中文', path: '/' },
    'en': { label: 'English', path: '/en/' },
    'ko': { label: '한국어', path: '/ko/' }
  };
  var currentLangData = langMap[currentLang];
%>
<div class="lang-switcher">
  <button class="lang-switcher-btn" aria-label="选择语言" aria-expanded="false">
    <span class="lang-icon">🌐</span>
    <span class="lang-current"><%= currentLangData.label %></span>
    <span class="lang-arrow">▼</span>
  </button>
  <ul class="lang-dropdown">
    <% Object.keys(langMap).forEach(function(lang) { %>
      <li>
        <% if (lang === currentLang) { %>
          <span class="lang-option lang-active"><%= langMap[lang].label %></span>
        <% } else { %>
          <a href="<%= langMap[lang].path %>" class="lang-option"><%= langMap[lang].label %></a>
        <% } %>
      </li>
    <% }); %>
  </ul>
</div>
```

### CSS 样式

```stylus
// 在方案 A 的基础上添加图标样式
.lang-icon
  font-size: 16px
  line-height: 1

.lang-switcher-btn
  // ... 其他样式同方案 A
  gap: var(--space-sm)
```

---

## 移动端适配建议

1. **触摸友好**：下拉菜单项最小高度 44px，间距适当增大
2. **关闭行为**：点击菜单外部自动关闭下拉菜单
3. **响应式**：小屏幕下可考虑底部弹出的 action sheet
4. **动画优化**：使用 `transform` 和 `opacity` 实现流畅动画

### JavaScript 交互

```javascript
// 添加到 header.ejs 或单独文件
document.addEventListener('DOMContentLoaded', function() {
  // Language switcher dropdown toggle
  const langSwitchers = document.querySelectorAll('.lang-switcher');
  
  langSwitchers.forEach(function(switcher) {
    const btn = switcher.querySelector('.lang-switcher-btn');
    
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      
      // Close other dropdowns
      langSwitchers.forEach(function(s) {
        if (s !== switcher) s.classList.remove('open');
      });
      
      // Toggle current
      switcher.classList.toggle('open');
      btn.setAttribute('aria-expanded', switcher.classList.contains('open'));
    });
  });
  
  // Close on outside click
  document.addEventListener('click', function() {
    langSwitchers.forEach(function(switcher) {
      switcher.classList.remove('open');
      const btn = switcher.querySelector('.lang-switcher-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  });
  
  // Close on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      langSwitchers.forEach(function(switcher) {
        switcher.classList.remove('open');
      });
    }
  });
});
```

---

## 推荐方案完整实现

**推荐使用方案 A（下拉菜单）**，理由：
1. ✅ 界面简洁，节省空间
2. ✅ 移动端友好，触摸操作直观
3. ✅ 可扩展性强，未来添加语言不影响布局
4. ✅ 与现有设计风格一致

### 文件修改清单

1. **修改文件**：`themes/landscape/layout/_partial/language-switcher.ejs`
2. **修改文件**：`themes/landscape/source/css/_partial/header.styl`
3. **添加 JS**：将交互代码添加到 `header.ejs` 的 `<script>` 部分