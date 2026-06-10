/**
 * 多语言文章生成器
 * 
 * 解决方案：
 * - 英文文章（lang: en）只在 /en/ 路径生成
 * - 中文文章（无 lang 或 lang: zh-CN）只在根路径生成
 * 
 * 实现方式：
 * 覆盖 Hexo 默认的 post generator，根据文章语言分发到不同路径
 */

'use strict';

hexo.extend.generator.register('post', function(locals) {
  const config = this.config;
  const log = this.log || console;
  
  // 获取语言配置
  const languages = (config.language && Array.isArray(config.language)) 
    ? config.language 
    : [config.language || 'zh-CN'];
  const defaultLang = languages[0];
  
  log.info('=== i18n post generator: default language is', defaultLang, '===');
  
  // 分类文章
  const posts = locals.posts.sort('-date');
  
  // 默认语言文章（中文）
  const defaultLangPosts = posts.filter(post => {
    const postLang = post.lang;
    // 无 lang 字段视为默认语言
    if (!postLang) return true;
    // lang 为默认语言
    if (postLang === defaultLang) return true;
    // lang 为 zh-CN 也视为中文
    if (postLang === 'zh-CN') return true;
    return false;
  });
  
  // 其他语言文章（英文）
  const otherLangPosts = {};
  languages.slice(1).forEach(lang => {
    otherLangPosts[lang] = posts.filter(post => post.lang === lang);
  });
  
  log.info('Posts by language:');
  log.info('  - Default (', defaultLang, '):', defaultLangPosts.length, 'posts');
  Object.keys(otherLangPosts).forEach(lang => {
    log.info('  -', lang, ':', otherLangPosts[lang].length, 'posts');
  });
  
  // 生成结果
  const result = [];
  
  // 生成默认语言文章页面（根路径）
  defaultLangPosts.forEach(post => {
    const layouts = ['post', 'page', 'index'];
    if (post.layout && post.layout !== 'post') {
      layouts.unshift(post.layout);
    }
    result.push({
      path: post.path,
      layout: layouts,
      data: post
    });
  });
  
  // 生成其他语言文章页面（带语言前缀路径）
  Object.keys(otherLangPosts).forEach(lang => {
    otherLangPosts[lang].forEach(post => {
      const layouts = ['post', 'page', 'index'];
      if (post.layout && post.layout !== 'post') {
        layouts.unshift(post.layout);
      }
      
      // 构建带语言前缀的路径
      // 原始路径如: 2026/06/03/en-hermes-ai-dev-team/index.html
      // 转换为: en/2026/06/03/en-hermes-ai-dev-team/index.html
      const langPath = lang + '/' + post.path;
      
      // 创建文章数据对象，包含正确的路径信息
      // 注意：post.path 是只读的 getter，不能直接修改
      // 但我们可以在 data 对象上设置 _i18n_path 属性供 helper 使用
      const postData = Object.assign({}, post, {
        lang: lang,
        _i18n_path: langPath  // 保存正确的路径供 helper 使用
      });
      
      log.debug('Generating', lang, 'post:', langPath);
      
      result.push({
        path: langPath,
        layout: layouts,
        data: postData
      });
    });
  });
  
  log.info('Total generated posts:', result.length);
  
  return result;
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
  
  // 如果文章有 _i18n_path，使用它
  if (post._i18n_path) {
    return this.url_for(post._i18n_path);
  }
  
  // 否则根据文章语言添加前缀
  if (postLang === defaultLang) {
    return this.url_for(post.path);
  }
  return this.url_for(postLang + '/' + post.path);
});