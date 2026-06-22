# 移动端样式错乱 Bug 分析报告

## 项目信息
- 项目路径: /home/cuckoom/work/code/cuckoom-blog
- 主题: landscape (Stylus CSS)
- 报告日期: 2026-06-22
- 影响范围: 手机浏览器 (Chrome), 所有断点 ≤767px

---

## 执行摘要

经过对全部 23 个 Stylus 文件、布局模板和 viewport 配置的审查，共发现 **7 个严重问题** 和 **4 个中等问题** 导致移动端样式错乱。

---

## 严重问题 (Critical)

### BUG-01: `#wrap` 使用 `position: absolute; height: 100%` 导致移动端滚动异常

**文件**: `themes/landscape/source/css/style.styl` (第 62-72 行)

```stylus
#wrap
  height: 100%
  width: 100%
  position: absolute
  top: 0
  left: 0
  transition: 0.2s ease-out
  z-index: 1
  background: var(--color-bg)
  .mobile-nav-on &
    left: mobile-nav-width
```

**问题描述**: 
- `#wrap` 是页面的主容器，使用 `position: absolute` 脱离文档流
- `height: 100%` 使其等于视口高度，内容溢出时不会扩展容器
- 这是旧版移动端导航的遗留代码（`.mobile-nav-on` 类），现已改用 drawer 系统
- 在移动端 Chrome 上，`position: absolute` + `height: 100%` 导致：
  1. 页面内容溢出时滚动行为异常（body 滚动但 `#wrap` 不跟随）
  2. 100vh 在移动端浏览器的实际计算高度不准确（地址栏收缩/展开）
  3. 子元素的百分比高度计算不正确

**根本原因**: 旧版 mobile-nav 使用 `#wrap` 位移来展示侧边栏，现已废弃但仍保留。

**修复建议**:
```stylus
#wrap
  min-height: 100%        // 改为 min-height
  width: 100%
  position: relative      // 改为 relative，保持布局正常
  z-index: 1
  background: var(--color-bg)
  // 删除 .mobile-nav-on 相关代码
```

---

### BUG-02: 内容区域存在三重 padding 导致移动端内容过窄

**涉及文件**:
- `themes/landscape/source/css/style.styl` (第 35-42 行) - `.outer`
- `themes/landscape/source/css/_components/_card.styl` (第 90-96 行) - `.article-card-list`
- `themes/landscape/source/css/_components/_card.styl` (第 5-10 行) - `.article-card`
- `themes/landscape/source/css/_partial/article.styl` (第 6-9 行) - `.article-detail`
- `themes/landscape/source/css/custom/pages.styl` (第 6-12 行) - `.category-grid`, `.tags-cloud-section`, `.page-content`

**问题描述**:
以首页为例，内容从外到内有三层 padding：

```
body
  └── .outer (padding: 0 16px)         ← 第 1 层
      └── .article-card-list (padding: 0 16px)  ← 第 2 层
          └── .article-card (padding: 16px)      ← 第 3 层
```

在 375px 宽度的手机上：
- 外层 padding: 2 × 16px = 32px
- 卡片列表 padding: 2 × 16px = 32px
- 卡片本身 padding: 2 × 16px = 32px
- **总水平占用: 96px**
- **实际内容宽度: 375 - 96 = 279px** ← 过窄！

同样的问题出现在文章详情页、分类页、标签页等所有页面。

**修复建议**: 
方案 A（推荐）：移除 `.article-card-list` 的独立 padding，由 `.outer` 统一控制
```stylus
.article-card-list
  max-width: var(--content-max-width)
  margin: 0 auto
  padding: 0    // 移除独立 padding
```

方案 B：使用 `box-sizing: border-box` 并统一 padding 策略

---

### BUG-03: 缺少全局 `overflow-x: hidden` 导致水平滚动

**文件**: `themes/landscape/source/css/style.styl` (第 28-33 行)

**问题描述**:
`body` 没有设置 `overflow-x: hidden`。在移动端，任何超出视口宽度的元素（如固定定位的 header 边缘、未完全隐藏的 drawer、宽表格等）都会导致页面出现水平滚动条，用户可以看到空白区域或布局错位。

**修复建议**:
```stylus
html, body
  overflow-x: hidden
```

---

### BUG-04: 移动端 Hero 区域过高挤压内容

**文件**: `themes/landscape/source/css/_components/_hero.styl` (第 60-82 行)

**问题描述**:
移动端 hero 样式：
```stylus
@media screen and (max-width: 767px)
  .hero-section
    padding: var(--space-2xl) var(--space-md)  // 48px top + 48px bottom
    &.hero-full
      height: auto
      min-height: 80px
      max-height: 120px
    &.hero-simple
      height: auto
      min-height: 60px
      max-height: 100px
```

问题：
- `padding-top: 48px` + `max-height: 120px` + `padding-bottom: 48px` = 视觉总高度可达 **216px**
- 在 667px 高度的手机上，hero 占用了近 1/3 的屏幕空间
- 加上固定 header (60px)，首屏可见内容区域非常小
- `max-height` 约束的是内容区域（content-box），padding 在外

**修复建议**:
```stylus
@media screen and (max-width: 767px)
  .hero-section
    padding: var(--space-lg) var(--space-md)  // 24px instead of 48px
    padding-top: calc(var(--header-height) + var(--space-lg))  // 60 + 24 = 84px
    
    &.hero-full
      height: auto
      min-height: 60px
      max-height: 100px

    &.hero-simple
      height: auto
      min-height: 50px
      max-height: 80px
```

---

### BUG-05: 页面内容表格在移动端溢出

**文件**: `themes/landscape/source/css/custom/pages.styl` (第 187-199 行)

**问题描述**:
`.page-content` 中的表格（如 About 页面的信息表）没有移动端水平滚动处理：
```stylus
// article.styl 中有移动端处理:
@media mq-mobile
  table
    display: block
    max-width: 100%
    overflow-x: auto
    -webkit-overflow-scrolling: touch
    white-space: nowrap

// 但 pages.styl 的 .page-content 中缺少同样处理！
```

**修复建议**:
在 `custom/pages.styl` 的 `.page-content` 中添加：
```stylus
.page-content
  // ...existing styles...
  @media screen and (max-width: 767px)
    table
      display: block
      max-width: 100%
      overflow-x: auto
      -webkit-overflow-scrolling: touch
```

---

### BUG-06: `.mobile-menu-toggle` 在 header.styl 和 mobile.styl 中有冲突定义

**文件**:
- `themes/landscape/source/css/_partial/header.styl` (第 142-151 行)
- `themes/landscape/source/css/_partial/mobile.styl` (第 9-37 行)

**问题描述**:
两个文件对同一元素有不同的移动端样式：

**header.styl**:
```stylus
.mobile-menu-toggle
  display: none
  @media screen and (max-width: 767px)
    display: block       // ← block
    color: #FFFFFF
    font-size: 20px
```

**mobile.styl** (后导入，优先级更高):
```stylus
.mobile-menu-toggle
  display: none
  @media mq-mobile
    display: flex        // ← flex
    align-items: center
    justify-content: center
```

虽然 `flex` 最终生效（后导入覆盖），但：
1. `header.styl` 中设置了 `color: #FFFFFF` 仅对 `.site-header.scrolled &` 变暗
2. `mobile.styl` 中使用了 `color: var(--color-text-secondary)` 完全不同的颜色方案
3. 两套样式逻辑不一致，可能导致颜色显示混乱

**修复建议**: 移除 `header.styl` 中的 `.mobile-menu-toggle` 定义，统一由 `mobile.styl` 管理。

---

### BUG-07: 缺少全局 `box-sizing: border-box`

**文件**: `themes/landscape/source/css/style.styl`

**问题描述**:
全局样式没有设置 `box-sizing: border-box`。默认 `content-box` 导致：
- 所有 padding 和 border 加在 width 之外
- 设置了 `width: 100%` 的元素加上 padding 会超出容器
- 在移动端窄屏上特别容易导致水平溢出

**修复建议**:
在 `style.styl` 的 `global-reset()` 之后添加：
```stylus
*, *::before, *::after
  box-sizing: border-box
```

---

## 中等问题 (Medium)

### BUG-08: `.outer` 在移动端无 `max-width` 约束

**文件**: `themes/landscape/source/css/style.styl` (第 35-42 行)

**问题描述**:
```stylus
.outer
  clearfix()
  margin: 0 auto
  padding: 0 var(--space-md)
  
  @media screen and (min-width: 1024px)  // 只在桌面端设 max-width
    max-width: var(--header-max-width)
    padding: 0
```

在移动端，`.outer` 的宽度由父元素 `#wrap` (width: 100%) 决定。如果内部子元素有固定宽度或百分比宽度计算不当，会直接撑破容器。

**修复建议**:
```stylus
.outer
  clearfix()
  margin: 0 auto
  padding: 0 var(--space-md)
  max-width: var(--content-max-width)   // 移动端也限制宽度
  
  @media screen and (min-width: 1024px)
    max-width: var(--header-max-width)
    padding: 0
```

---

### BUG-09: 移动端 `archive-post-tags` 标签溢出

**文件**: `themes/landscape/source/css/_partial/archive.styl` (第 78-86 行)

**问题描述**:
```stylus
.archive-post-tags
  display: flex
  gap: 4px
  flex-shrink: 0
```

在窄屏手机上，`.archive-post-item` 使用 `display: flex` 布局：
- `.archive-post-date` (固定宽度)
- `.archive-post-title` (flex: 1)
- `.archive-post-tags` (flex-shrink: 0, 不缩小)

当标签较多时，`.archive-post-tags` 不会缩小，导致内容溢出到右侧。

**修复建议**:
```stylus
.archive-post-tags
  display: flex
  gap: 4px
  flex-shrink: 0
  max-width: 40%
  overflow: hidden
  
  @media screen and (max-width: 767px)
    display: none  // 移动端隐藏标签，简化布局
```

---

### BUG-10: 语言切换下拉框在移动端可能溢出

**文件**: `themes/landscape/source/css/_partial/header.styl` (第 289-296 行)

**问题描述**:
```stylus
@media screen and (max-width: 767px)
  .lang-dropdown
    right: auto
    left: 50%
    transform: translateX(-50%) translateY(-8px)
  
  .lang-switcher.open .lang-dropdown
    transform: translateX(-50%) translateY(0)
```

下拉框用 `left: 50%; transform: translateX(-50%)` 居中。如果语言切换按钮靠近屏幕左边缘，下拉框可能溢出左边界。

**修复建议**:
```stylus
@media screen and (max-width: 767px)
  .lang-dropdown
    right: 0
    left: auto
    transform: translateY(-8px)
  
  .lang-switcher.open .lang-dropdown
    transform: translateY(0)
```

---

### BUG-11: `mq-mobile` 和裸 `@media` 断点混用

**文件**: 多个文件

**问题描述**:
部分文件使用 `mq-mobile` 变量（如 `mobile.styl`, `_card.styl`），部分使用原始 `@media screen and (max-width: 767px)`（如 `header.styl`, `_hero.styl`, `_sidebar-drawer.styl`）。虽然值相同（767px），但：
- 维护不一致，修改断点时容易遗漏
- Stylus 变量在某些情况下编译行为不同
- `_card.styl` 中同时出现 `mq-mobile` (第99行) 和 `@media screen and (max-width: 767px)` (第185行)

**修复建议**: 统一使用 `mq-mobile` 变量。

---

## 问题分析总结

### 影响程度评估

| 问题 | 严重程度 | 影响范围 | 用户可见度 |
|------|----------|----------|------------|
| BUG-01 #wrap absolute | Critical | 全局 | 高 |
| BUG-02 三重 padding | Critical | 全局内容区 | 高 |
| BUG-03 水平溢出 | Critical | 全局 | 高 |
| BUG-04 Hero 过高 | Critical | 所有页面首屏 | 高 |
| BUG-05 表格溢出 | Critical | 文章/页面 | 中 |
| BUG-06 toggle 冲突 | Critical | Header 导航 | 中 |
| BUG-07 缺少 box-sizing | Critical | 全局布局 | 高 |
| BUG-08 .outer 无约束 | Medium | 全局 | 中 |
| BUG-09 标签溢出 | Medium | 归档页 | 低 |
| BUG-10 语言下拉溢出 | Medium | 多语言切换 | 低 |
| BUG-11 断点混用 | Medium | 维护性 | 无直接可见 |

### 根因分类

1. **遗留代码未清理** (BUG-01, BUG-06): 从旧版 mobile-nav 迁移到 drawer 系统时，旧代码未完全移除
2. **CSS 架构设计问题** (BUG-02, BUG-07, BUG-08): 缺少统一的 padding/box-sizing 策略
3. **移动端适配不完整** (BUG-04, BUG-05, BUG-09): 部分组件只有桌面端考虑
4. **安全边界缺失** (BUG-03): 未设置 overflow 保护

---

## 推荐修复优先级

### Phase 1 - 紧急修复 (立即)
1. BUG-01: 移除 `#wrap` 的 `position: absolute`，改为 `position: relative`
2. BUG-03: 添加 `overflow-x: hidden` 到 html/body
3. BUG-07: 添加全局 `box-sizing: border-box`

### Phase 2 - 布局修复 (1-2天)
4. BUG-02: 消除重复 padding
5. BUG-04: 调整移动端 hero 尺寸
6. BUG-08: 给 `.outer` 添加 max-width

### Phase 3 - 组件修复 (3-5天)
7. BUG-05: 表格移动端处理
8. BUG-06: 统一 mobile-menu-toggle 样式
9. BUG-09: 归档页标签处理
10. BUG-10: 语言下拉定位
11. BUG-11: 统一断点变量使用

---

## 注意事项

- 所有修复应在 `@media screen and (max-width: 767px)` 内进行，确保不影响桌面端
- 修复后需在以下设备/分辨率测试：
  - iPhone SE (375×667)
  - iPhone 12/13 (390×844)
  - iPhone 14 Pro Max (430×932)
  - Samsung Galaxy S21 (360×800)
  - 小屏手机 (320×568) - xs 断点
- 验证桌面端 (≥1024px) 样式不受影响
- 测试横竖屏切换
