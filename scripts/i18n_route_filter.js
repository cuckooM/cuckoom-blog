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
    
    // 检查原始路由是否存在
    if (route.routes[formattedPath]) {
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
  
  // 移动路由
  routesToMove.forEach(({ originalPath, newPath }) => {
    // 获取原始路由数据
    const routeData = route.routes[originalPath];
    
    if (routeData) {
      // 创建新路由（在语言前缀路径）
      route.set(newPath, {
        data: routeData.data,
        modified: routeData.modified
      });
      
      // 删除旧路由（在根路径）
      route.remove(originalPath);
      
      log.debug(`[i18n_route] Moved: ${originalPath} → ${newPath}`);
    }
  });
  
  log.info(`[i18n_route] Successfully relocated ${routesToMove.length} non-default language posts`);
  
  // 处理 pages（如 about 页面）
  // hexo-generator-i18n 生成的多语言页面路径有问题：
  // - /en/about/ko-index.html 是韩语内容，但路径错误
  // - /ko/about/index.html 是默认内容，但应该替换为韩语
  const pages = this.locals.get('pages');
  const nonDefaultPages = pages.toArray().filter(page => page.lang && page.lang !== defaultLang);
  
  if (nonDefaultPages.length > 0) {
    log.info(`[i18n_route] Found ${nonDefaultPages.length} non-default language pages to fix`);
    
    nonDefaultPages.forEach(page => {
      // 获取页面目录名（如 about）
      const pageDir = page.source.replace('source/', '').replace(/ko-.*\.md/, '').replace(/\/$/, '').replace('.md', '');
      
      // 查找 hexo-generator-i18n 生成的韩语内容（在错误位置）
      const wrongPath = `en/${pageDir}/ko-index.html`;
      
      // 正确的目标路径
      const correctPath = `ko/${pageDir}/index.html`;
      
      if (route.routes[wrongPath]) {
        const routeData = route.routes[wrongPath];
        
        // 在正确位置设置韩语内容
        route.set(correctPath, {
          data: routeData.data,
          modified: routeData.modified
        });
        
        // 删除错误位置的文件
        route.remove(wrongPath);
        
        log.info(`[i18n_route] Fixed page: ${wrongPath} → ${correctPath}`);
      }
    });
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