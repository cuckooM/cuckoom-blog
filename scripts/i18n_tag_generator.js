/**
 * i18n Tag Generator
 * 为每个英文标签生成独立的 /en/tags/xxx/ 页面
 * 
 * 解决 hexo-generator-i18n 的限制：
 * - i18n generator 只生成 /en/tags/index.html（列表页）
 * - 不生成具体的 /en/tags/PostgreSQL/ 页面
 * 
 * 本脚本注册自定义 generator，直接生成英文标签页面：
 * - 收集所有英文文章的标签
 * - 为每个标签生成独立的英文页面
 * - 使用 tag.ejs 模板渲染
 */

'use strict';

hexo.extend.generator.register('i18n_tag', function(locals) {
  const config = this.config;
  const posts = locals.posts;
  
  // 获取所有英文文章
  const englishPosts = posts.filter(post => post.lang === 'en');
  
  if (englishPosts.length === 0) {
    return [];
  }
  
  // 收集英文文章的所有标签
  const englishTags = new Map();
  
  englishPosts.forEach(post => {
    if (post.tags && post.tags.length > 0) {
      post.tags.toArray().forEach(tag => {
        if (!englishTags.has(tag.name)) {
          englishTags.set(tag.name, {
            name: tag.name,
            slug: tag.slug,
            posts: []
          });
        }
        englishTags.get(tag.name).posts.push(post);
      });
    }
  });
  
  // 为每个英文标签生成页面
  const result = [];
  
  englishTags.forEach((tagData, tagName) => {
    result.push({
      path: `en/tags/${tagData.slug}/index.html`,
      layout: ['tag', 'index'],
      data: {
        tag: tagName,
        lang: 'en',
        posts: locals.posts.filter(post => {
          return post.lang === 'en' && 
                 post.tags && 
                 post.tags.some(t => t.name === tagName);
        })
      }
    });
  });
  
  hexo.log.info(`[i18n_tag] Generated ${result.length} English tag pages`);
  
  return result;
});

/**
 * 同样为英文分类生成页面（如果 hexo-generator-i18n 没有生成）
 */
hexo.extend.generator.register('i18n_category', function(locals) {
  const config = this.config;
  const posts = locals.posts;
  
  // 获取所有英文文章
  const englishPosts = posts.filter(post => post.lang === 'en');
  
  if (englishPosts.length === 0) {
    return [];
  }
  
  // 收集英文文章的所有分类
  const englishCategories = new Map();
  
  englishPosts.forEach(post => {
    if (post.categories && post.categories.length > 0) {
      post.categories.toArray().forEach(cat => {
        if (!englishCategories.has(cat.name)) {
          englishCategories.set(cat.name, {
            name: cat.name,
            slug: cat.slug,
            posts: []
          });
        }
        englishCategories.get(cat.name).posts.push(post);
      });
    }
  });
  
  // 为每个英文分类生成页面
  const result = [];
  
  englishCategories.forEach((catData, catName) => {
    result.push({
      path: `en/categories/${catData.slug}/index.html`,
      layout: ['category', 'index'],
      data: {
        category: catName,
        lang: 'en',
        posts: locals.posts.filter(post => {
          return post.lang === 'en' && 
                 post.categories && 
                 post.categories.some(c => c.name === catName);
        })
      }
    });
  });
  
  hexo.log.info(`[i18n_category] Generated ${result.length} English category pages`);
  
  return result;
});