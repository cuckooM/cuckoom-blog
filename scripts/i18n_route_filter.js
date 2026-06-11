/**
 * 多语言路由重写器
 * 
 * 方案：使用 after_generate Filter Hook 重写路由
 * 
 * 流程：
 * 1. 默认 post generator 生成所有文章到根路径
 * 2. after_generate filter 在路由构建完成后执行
 * 3. 识别英文文章，移动其路由到 /en/ 路径，删除根路径路由
 * 
 * 符合 Hexo 最佳实践：使用 Filter Hook 而非覆盖 Generator
 * 使用 Hexo 公开 Route API（route.list/get/set/remove），避免直接操作内部 route.routes
 */

'use strict';

hexo.extend.filter.register('after_generate', async function() {
  const config = this.config;
  const route = this.route;
  const log = this.log || console;
  
  // 获取语言配置
  const languages = (config.language && Array.isArray(config.language)) 
    ? config.language 
    : [config.language || 'zh-CN'];
  const defaultLang = languages[0];
  
  // 获取所有文章
  const posts = this.locals.get('posts');
  
  // 找出需要移动的非默认语言文章（英文和韩文）
  const nonDefaultPosts = posts.filter(post => post.lang && post.lang !== defaultLang);
  
  if (nonDefaultPosts.length === 0) {
    log.info('[i18n_route] No non-default language posts to relocate');
    return;
  }
  
  log.info(`[i18n_route] Found ${nonDefaultPosts.length} non-default language posts to relocate`);
  
  // 收集要移动的路由
  const routesToMove = [];
  
  nonDefaultPosts.forEach(post => {
    // 原始路径（由默认 generator 生成到根路径）
    const originalPath = post.path;
    
    // 格式化后的路径（带 index.html）
    const formattedPath = route.format(originalPath);
    
    // 新路径（带语言前缀，如 /en/ 或 /ko/）
    const langPrefix = post.lang + '/';
    const newPath = route.format(langPrefix + originalPath);
    
    // 检查原始路由是否存在（使用公开 API route.list）
    if (route.list().includes(formattedPath)) {
      routesToMove.push({
        originalPath: formattedPath,
        newPath,
        post
      });
    }
  });
  
  if (routesToMove.length === 0) {
    log.info('[i18n_route] No routes found to relocate (maybe already moved)');
    return;
  }
  
  log.info(`[i18n_route] Moving ${routesToMove.length} routes...`);
  
  // 从路由流中读取内容的辅助函数
  function readRouteContent(path) {
    return new Promise((resolve, reject) => {
      const stream = route.get(path);
      if (!stream) {
        resolve(null);
        return;
      }
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
  
  // 移动路由（使用公开 API route.set 和 route.remove）
  for (const { originalPath, newPath } of routesToMove) {
    // 通过公开 API route.get 读取原始路由内容
    const content = await readRouteContent(originalPath);
    
    if (content !== null) {
      // 创建新路由（在语言前缀路径），使用公开 API route.set
      route.set(newPath, content);
      
      // 删除旧路由（在根路径），使用公开 API route.remove
      route.remove(originalPath);
      
      log.debug(`[i18n_route] Moved: ${originalPath} → ${newPath}`);
    }
  }
  
  log.info(`[i18n_route] Successfully relocated ${routesToMove.length} non-default language posts`);
  
  // 处理分页：删除多余的分页页面
  const perPage = config.per_page || 10;
  const langs = languages.filter(l => l !== defaultLang); // 非默认语言列表
  
  // 统计每种语言的文章数
  const langPostCounts = {};
  
  // 默认语言文章数（没有 lang 属性，或 lang 不是 en/ko/ja）
  langPostCounts[defaultLang] = posts.filter(p => !p.lang || !langs.includes(p.lang)).length;
  
  // 其他语言文章数
  langs.forEach(lang => {
    langPostCounts[lang] = posts.filter(p => p.lang === lang).length;
  });
  
  log.info(`[i18n_route] Post counts by language: ${JSON.stringify(langPostCounts)}`);
  
  // 删除超出实际分页数的页面
  let removedPages = 0;
  
  Object.entries(langPostCounts).forEach(([lang, count]) => {
    const totalPages = Math.ceil(count / perPage) || 1;
    const langPrefix = lang === defaultLang ? '' : lang + '/';
    
    // 获取该语言的所有分页路由（使用公开 API route.list）
    const pageRoutes = route.list().filter(path => {
      // 匹配分页路径：page/2/, page/3/ 或 en/page/2/, ko/page/2/ 等
      const pagePattern = langPrefix + 'page/';
      return path.startsWith(pagePattern);
    });
    
    pageRoutes.forEach(path => {
      // 提取页码
      const pageNumMatch = path.match(/page\/(\d+)/);
      if (pageNumMatch) {
        const pageNum = parseInt(pageNumMatch[1]);
        if (pageNum > totalPages) {
          route.remove(path);
          log.info(`[i18n_route] Removed excess pagination: ${path} (lang ${lang} has ${count} posts, needs only ${totalPages} page(s))`);
          removedPages++;
        }
      }
    });
  });
  
  if (removedPages > 0) {
    log.info(`[i18n_route] Removed ${removedPages} excess pagination page(s)`);
  }
  
  // 处理 pages（如 about 页面）
  // hexo-generator-i18n 在每个语言目录下生成了所有语言的 about 页面：
  // - /ja/about/ja-index.html 是日语内容（正确标题和正文）
  // - /ja/about/index.html 是默认中文内容（需要替换为日语内容）
  // - /ko/about/ko-index.html 是韩语内容
  // - /ko/about/index.html 是默认中文内容（需要替换为韩语内容）
  const pages = this.locals.get('pages');
  const nonDefaultLangs = languages.filter(l => l !== defaultLang);
  
  if (nonDefaultLangs.length > 0) {
    // 找出所有有非默认语言版本的页面目录
    const nonDefaultPages = pages.toArray().filter(page => page.lang && page.lang !== defaultLang);
    
    if (nonDefaultPages.length > 0) {
      log.info(`[i18n_route] Found ${nonDefaultPages.length} non-default language pages to fix`);
      
      // 获取所有页面目录（如 about）
      const pageDirs = [...new Set(nonDefaultPages.map(page => {
        return page.source.replace('source/', '').replace(/\/(ko|ja|en)-index\.md$/, '').replace(/\/$/, '');
      }))];
      
      // 对每个非默认语言和页面目录，用正确语言的内容替换 index.html
      for (const lang of nonDefaultLangs) {
        for (const pageDir of pageDirs) {
          const localizedFile = `${lang}/${pageDir}/${lang}-index.html`;
          const indexFile = `${lang}/${pageDir}/index.html`;
          
          // 使用公开 API route.list 检查路由是否存在
          if (route.list().includes(localizedFile)) {
            // 通过公开 API route.get 读取本地化内容
            const content = await readRouteContent(localizedFile);
            
            if (content !== null) {
              // 将本地化内容设置为 index.html（使用公开 API route.set）
              route.set(indexFile, content);
              
              // 删除本地化文件名（如 ja-index.html，使用公开 API route.remove）
              route.remove(localizedFile);
              
              log.info(`[i18n_route] Fixed page: ${localizedFile} → ${indexFile}`);
            }
          }
          
          // 删除其他语言的错误放置文件（如 /ko/about/ja-index.html）
          for (const otherLang of nonDefaultLangs) {
            if (otherLang !== lang) {
              const wrongFile = `${lang}/${pageDir}/${otherLang}-index.html`;
              if (route.list().includes(wrongFile)) {
                route.remove(wrongFile);
                log.debug(`[i18n_route] Removed misplaced: ${wrongFile}`);
              }
            }
          }
          
          // 删除默认路径下的残留 xx-index.html（如 /about/ja-index.html）
          const residueFile = `${pageDir}/${lang}-index.html`;
          if (route.list().includes(residueFile)) {
            route.remove(residueFile);
            log.info(`[i18n_route] Removed residue: ${residueFile}`);
          }
        }
      }
    }
  }
});

// 注册 helper 函数：根据当前语言过滤文章列表
hexo.extend.helper.register('filter_posts_by_lang', function(posts, currentLang) {
  const languages = this.config.language;
  const defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  return posts.filter(post => {
    const postLang = post.lang || defaultLang;
    return postLang === currentLang;
  });
});

// 注册 helper 函数：生成带语言前缀的 URL
hexo.extend.helper.register('url_with_lang', function(path, currentLang) {
  const languages = this.config.language;
  const defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  if (currentLang === defaultLang) {
    return this.url_for(path);
  }
  return this.url_for(currentLang + '/' + path);
});

// 注册 helper 函数：获取文章的正确 URL（考虑语言前缀）
hexo.extend.helper.register('post_url_i18n', function(post) {
  const languages = this.config.language;
  const defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  const postLang = post.lang || defaultLang;
  
  // 英文文章：URL 带 /en/ 前缀
  if (postLang !== defaultLang) {
    return this.url_for(postLang + '/' + post.path);
  }
  
  // 默认语言文章：URL 无前缀
  return this.url_for(post.path);
});

// 注册 helper 函数：获取同语言的文章导航（上一篇/下一篇）
// 解决跨语言导航问题
hexo.extend.helper.register('get_i18n_post_nav', function(post) {
  const languages = this.config.language;
  const defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  const postLang = post.lang || defaultLang;
  
  // 获取所有文章并按日期排序（与 Hexo 默认行为一致）
  const posts = this.site.posts.sort('-date').toArray();
  
  // 过滤出同语言的文章
  const sameLangPosts = posts.filter(p => (p.lang || defaultLang) === postLang);
  
  // 找到当前文章在过滤列表中的索引
  const currentIndex = sameLangPosts.findIndex(p => p._id === post._id);
  
  // 返回同语言的上一篇和下一篇
  return {
    prev: currentIndex > 0 ? sameLangPosts[currentIndex - 1] : null,
    next: currentIndex < sameLangPosts.length - 1 ? sameLangPosts[currentIndex + 1] : null
  };
});