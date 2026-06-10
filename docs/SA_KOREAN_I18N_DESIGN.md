# SA 设计：博客多语言扩展韩语支持方案

## 一、方案概述

基于现有的中英文双语架构，扩展支持韩语（语言代码：`ko`，URL路径：`/ko/`），保持与现有方案一致的架构设计。

### 现有架构分析

| 组件 | 作用 | 支持语言 |
|------|------|---------|
| `_config.yml` | 语言配置 | zh-CN, en |
| `i18n_route_filter.js` | 路由重写 + Helpers | 动态读取配置 |
| `i18n_tag_generator.js` | 标签/分类页面生成 | 硬编码 `en` |
| `languages/*.yml` | UI 翻译文件 | zh-CN, en |
| `source/en/_posts/` | 英文文章目录 | en |

**关键发现：**
- `i18n_route_filter.js` **已支持动态多语言**，从 `config.language` 读取
- `i18n_tag_generator.js` **硬编码 `en`**，需要重构为多语言支持
- 文章命名规范：英文使用 `en-` 前缀 + `lang: en` Front Matter

---

## 二、配置修改

### 2.1 `_config.yml` 语言配置

```yaml
# 修改前
language:
  - zh-CN
  - en

# 修改后
language:
  - zh-CN
  - en
  - ko
```

### 2.2 `_config.yml` 主题菜单配置

```yaml
theme_config:
  menu:
    zh-CN:
      首页: /
      归档: /archives
      分类: /categories
      标签: /tags
      关于: /about
    en:
      Home: /
      Archives: /archives
      Categories: /categories
      Tags: /tags
      About: /about
    # 新增韩语菜单
    ko:
      홈: /
      아카이브: /archives
      카테고리: /categories
      태그: /tags
      소개: /about
```

### 2.3 新增韩语语言文件

**文件：** `languages/ko.yml`

```yaml
# ko.yml - 한국어
menu:
  home: 홈
  archives: 아카이브
  categories: 카테고리
  tags: 태그
  about: 소개

search: 검색
prev: 이전
next: 다음
page: 페이지 %d
total: 총 %d
categories: 카테고리
tags: 태그
tagcloud: 태그 클라우드
recent_posts: 최신 글
newer: 이전 글
older: 다음 글
share: 공유
powered_by: Powered by
rss_feed: RSS 피드
```

---

## 三、脚本修改

### 3.1 `i18n_route_filter.js` - 无需修改 ✅

**分析结果：** 该脚本已动态读取 `config.language`，自动支持新增语言：

```javascript
// 关键代码（第 22-25 行）
const languages = (config.language && Array.isArray(config.language)) 
  ? config.language 
  : [config.language || 'zh-CN'];
const defaultLang = languages[0];

// 关键代码（第 31 行）
const enPosts = posts.filter(post => post.lang === 'en');
```

**结论：** 只需修改 `post.lang === 'en'` 为通用处理，或新增韩语判断。

**建议修改（可选优化）：** 将硬编码的 `en` 改为动态遍历非默认语言：

```javascript
// 修改第 31 行
// 原代码：
const enPosts = posts.filter(post => post.lang === 'en');

// 建议改为：
const nonDefaultLangs = languages.slice(1); // ['en', 'ko']
const i18nPosts = posts.filter(post => nonDefaultLangs.includes(post.lang));
```

**完整重构版本见附录 A。**

### 3.2 `i18n_tag_generator.js` - 需要重构 ⚠️

**问题：** 当前硬编码为 `en`，无法支持韩语。

**重构方案：** 改为动态遍历所有非默认语言。

**重构后代码：**

```javascript
/**
 * i18n Tag/Category Generator - 多语言版本
 * 为每种非默认语言生成标签和分类页面
 */

'use strict';

/**
 * 通用多语言标签生成器
 * @param {string} type - 'tag' 或 'category'
 */
function createI18nGenerator(type) {
  return function(locals) {
    const config = this.config;
    const languages = (config.language && Array.isArray(config.language)) 
      ? config.language 
      : [config.language || 'zh-CN'];
    const defaultLang = languages[0];
    const i18nLangs = languages.slice(1); // 非默认语言列表

    if (i18nLangs.length === 0) {
      return [];
    }

    const posts = locals.posts;
    const result = [];

    // 遍历每种非默认语言
    i18nLangs.forEach(lang => {
      // 获取该语言的文章
      const langPosts = posts.filter(post => post.lang === lang);
      
      if (langPosts.length === 0) {
        return;
      }

      // 收集标签或分类
      const items = new Map();
      const itemKey = type === 'tag' ? 'tags' : 'categories';

      langPosts.forEach(post => {
        if (post[itemKey] && post[itemKey].length > 0) {
          post[itemKey].toArray().forEach(item => {
            if (!items.has(item.name)) {
              items.set(item.name, {
                name: item.name,
                slug: item.slug,
                posts: []
              });
            }
            items.get(item.name).posts.push(post);
          });
        }
      });

      // 为每个标签/分类生成页面
      const pathPrefix = type === 'tag' ? 'tags' : 'categories';
      
      items.forEach((itemData, itemName) => {
        result.push({
          path: `${lang}/${pathPrefix}/${itemData.slug}/index.html`,
          layout: [type, 'index'],
          data: {
            [type]: itemName,
            lang: lang,
            posts: posts.filter(post => {
              return post.lang === lang && 
                     post[itemKey] && 
                     post[itemKey].some(t => t.name === itemName);
            })
          }
        });
      });

      hexo.log.info(`[i18n_${type}] Generated ${items.size} ${lang} ${pathPrefix} pages`);
    });

    return result;
  };
}

// 注册标签生成器
hexo.extend.generator.register('i18n_tag', createI18nGenerator('tag'));

// 注册分类生成器
hexo.extend.generator.register('i18n_category', createI18nGenerator('category'));
```

### 3.3 Helpers - 已支持 ✅

现有 Helpers 已动态处理：

| Helper | 支持情况 |
|--------|---------|
| `filter_posts_by_lang` | ✅ 动态支持 |
| `url_with_lang` | ✅ 动态支持 |
| `post_url_i18n` | ✅ 动态支持 |
| `get_i18n_post_nav` | ✅ 动态支持 |

---

## 四、韩语文章命名规范

### 4.1 命名规则

| 语言 | 文件命名 | Front Matter | URL 路径 |
|------|---------|--------------|---------|
| 中文（默认） | `xxx.md` | `lang: zh-CN` 或省略 | `/year/month/day/xxx/` |
| 英文 | `en-xxx.md` | `lang: en` | `/en/year/month/day/xxx/` |
| 韩文 | `ko-xxx.md` | `lang: ko` | `/ko/year/month/day/xxx/` |

### 4.2 文章目录结构

**方案 A：混合存放（推荐，与现有方案一致）**
```
source/_posts/
├── hermes-ai-dev-team.md          # 中文
├── en-hermes-ai-dev-team.md       # 英文
└── ko-hermes-ai-dev-team.md       # 韩文
```

**方案 B：独立目录**
```
source/_posts/           # 中文
source/en/_posts/       # 英文
source/ko/_posts/       # 韩文
```

**建议采用方案 A**，与现有英文文章处理方式一致。

### 4.3 韩语文章示例

**文件：** `source/_posts/ko-hermes-ai-dev-team.md`

```markdown
---
title: Hermes로 AI 개발팀 구축하기
date: 2026-06-03 10:00:00
lang: ko
categories:
  - 기술 실천
tags:
  - AI
  - Hermes
  - 개발팀
  - 자동화
---

AI 기술의 발전으로 더 많은 개발 작업을 AI가 지원할 수 있게 되었습니다...
```

---

## 五、实施步骤

### 阶段一：配置修改
1. ✅ 修改 `_config.yml` 添加 `ko` 到语言列表
2. ✅ 添加韩语菜单配置
3. ✅ 创建 `languages/ko.yml`

### 阶段二：脚本重构
1. ⚠️ 重构 `i18n_tag_generator.js` 为多语言版本
2. ✅ 可选：优化 `i18n_route_filter.js` 的硬编码

### 阶段三：文章翻译
1. 创建 `source/_posts/ko-xxx.md` 韩语文章
2. 添加 `lang: ko` Front Matter

### 阶段四：构建测试
```bash
npx hexo clean && npx hexo g
```

验证：
- `/ko/` 路径下文章可访问
- `/ko/tags/xxx/` 标签页面正常
- `/ko/categories/xxx/` 分类页面正常
- 语言切换正常

---

## 六、架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Hexo 多语言架构                           │
├─────────────────────────────────────────────────────────────┤
│  _config.yml                                                │
│  ├── language: [zh-CN, en, ko]                             │
│  └── theme_config.menu: {zh-CN, en, ko}                     │
├─────────────────────────────────────────────────────────────┤
│  scripts/                                                   │
│  ├── i18n_route_filter.js (after_generate Hook)            │
│  │   ├── 路由重写: lang=ko → /ko/path                      │
│  │   └── Helpers: filter_posts_by_lang, url_with_lang...   │
│  └── i18n_tag_generator.js                                 │
│      ├── i18n_tag generator → /ko/tags/xxx/                │
│      └── i18n_category generator → /ko/categories/xxx/     │
├─────────────────────────────────────────────────────────────┤
│  languages/                                                 │
│  ├── zh-CN.yml                                              │
│  ├── en.yml                                                 │
│  └── ko.yml (新增)                                          │
├─────────────────────────────────────────────────────────────┤
│  source/_posts/                                             │
│  ├── xxx.md          (zh-CN)                                │
│  ├── en-xxx.md       (en)                                   │
│  └── ko-xxx.md       (ko) (新增)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、符合 Hexo 最佳实践验证

| 最佳实践 | 现有方案 | 韩语扩展 | 状态 |
|---------|---------|---------|------|
| 使用 Filter Hook 而非覆盖 Generator | ✅ after_generate | ✅ 保持 | 符合 |
| 动态读取配置 | ✅ config.language | ✅ 保持 | 符合 |
| Helpers 复用 | ✅ 4个通用 Helpers | ✅ 保持 | 符合 |
| 标准语言代码 | ✅ zh-CN, en | ✅ ko (ISO 639-1) | 符合 |
| URL 路径规范 | ✅ /en/ | ✅ /ko/ | 符合 |
| 文章命名规范 | ✅ en- 前缀 | ✅ ko- 前缀 | 符合 |

---

## 八、附录

### 附录 A：i18n_route_filter.js 完整重构版

```javascript
/**
 * 多语言路由重写器 - 多语言通用版本
 * 
 * 支持任意数量的语言扩展
 */

'use strict';

hexo.extend.filter.register('after_generate', function() {
  const config = this.config;
  const route = this.route;
  const log = this.log || console;
  
  // 获取语言配置
  const languages = (config.language && Array.isArray(config.language)) 
    ? config.language 
    : [config.language || 'zh-CN'];
  const defaultLang = languages[0];
  const i18nLangs = languages.slice(1); // 非默认语言
  
  if (i18nLangs.length === 0) {
    log.info('[i18n_route] No i18n languages configured');
    return;
  }
  
  // 获取所有文章
  const posts = this.locals.get('posts');
  
  // 统计各语言文章数
  const langPostCounts = {};
  i18nLangs.forEach(lang => {
    langPostCounts[lang] = 0;
  });
  
  // 收集要移动的路由
  const routesToMove = [];
  
  posts.forEach(post => {
    const postLang = post.lang;
    
    // 只处理非默认语言的文章
    if (!postLang || postLang === defaultLang || !i18nLangs.includes(postLang)) {
      return;
    }
    
    langPostCounts[postLang]++;
    
    const originalPath = post.path;
    const formattedPath = route.format(originalPath);
    const newPath = route.format(postLang + '/' + originalPath);
    
    if (route.routes[formattedPath]) {
      routesToMove.push({
        originalPath: formattedPath,
        newPath,
        postLang,
        post
      });
    }
  });
  
  // 输出统计
  i18nLangs.forEach(lang => {
    if (langPostCounts[lang] > 0) {
      log.info(`[i18n_route] Found ${langPostCounts[lang]} ${lang} posts`);
    }
  });
  
  if (routesToMove.length === 0) {
    log.info('[i18n_route] No routes to relocate');
    return;
  }
  
  log.info(`[i18n_route] Moving ${routesToMove.length} routes...`);
  
  // 移动路由
  routesToMove.forEach(({ originalPath, newPath }) => {
    const routeData = route.routes[originalPath];
    
    if (routeData) {
      route.set(newPath, {
        data: routeData.data,
        modified: routeData.modified
      });
      route.remove(originalPath);
    }
  });
  
  log.info(`[i18n_route] Successfully relocated ${routesToMove.length} i18n posts`);
});

// Helper: 根据语言过滤文章
hexo.extend.helper.register('filter_posts_by_lang', function(posts, currentLang) {
  const languages = this.config.language;
  const defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  return posts.filter(post => {
    const postLang = post.lang || defaultLang;
    return postLang === currentLang;
  });
});

// Helper: 生成带语言前缀的 URL
hexo.extend.helper.register('url_with_lang', function(path, currentLang) {
  const languages = this.config.language;
  const defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  if (currentLang === defaultLang) {
    return this.url_for(path);
  }
  return this.url_for(currentLang + '/' + path);
});

// Helper: 获取文章的正确 URL
hexo.extend.helper.register('post_url_i18n', function(post) {
  const languages = this.config.language;
  const defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  const postLang = post.lang || defaultLang;
  
  if (postLang !== defaultLang) {
    return this.url_for(postLang + '/' + post.path);
  }
  return this.url_for(post.path);
});

// Helper: 获取同语言的文章导航
hexo.extend.helper.register('get_i18n_post_nav', function(post) {
  const languages = this.config.language;
  const defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  const postLang = post.lang || defaultLang;
  
  const posts = this.site.posts.sort('-date').toArray();
  const sameLangPosts = posts.filter(p => (p.lang || defaultLang) === postLang);
  const currentIndex = sameLangPosts.findIndex(p => p._id === post._id);
  
  return {
    prev: currentIndex > 0 ? sameLangPosts[currentIndex - 1] : null,
    next: currentIndex < sameLangPosts.length - 1 ? sameLangPosts[currentIndex + 1] : null
  };
});
```

---

**文档版本：** 1.0  
**创建日期：** 2026-06-10  
**作者：** SA Design Agent