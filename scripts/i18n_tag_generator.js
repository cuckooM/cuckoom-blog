/**
 * i18n Tag Generator
 * 为每个非默认语言的标签生成独立的页面 (如 /en/tags/xxx/, /ko/tags/xxx/)
 * 
 * 解决 hexo-generator-i18n 的限制：
 * - i18n generator 只生成 /en/tags/index.html（列表页）
 * - 不生成具体的 /en/tags/PostgreSQL/ 页面
 * 
 * 本脚本注册自定义 generator，为所有非默认语言生成标签和分类页面
 */

'use strict';

/**
 * 通用的 i18n 标签生成器工厂函数
 * @param {string} lang - 语言代码
 */
function createI18nTagGenerator(lang) {
  return function(locals) {
    const posts = locals.posts;
    
    // 获取该语言的文章
    const langPosts = posts.filter(post => post.lang === lang);
    
    if (langPosts.length === 0) {
      return [];
    }
    
    // 收集该语言文章的所有标签
    const langTags = new Map();
    
    langPosts.forEach(post => {
      if (post.tags && post.tags.length > 0) {
        post.tags.toArray().forEach(tag => {
          if (!langTags.has(tag.name)) {
            langTags.set(tag.name, {
              name: tag.name,
              slug: tag.slug,
              posts: []
            });
          }
          langTags.get(tag.name).posts.push(post);
        });
      }
    });
    
    // 为每个标签生成页面
    const result = [];
    
    langTags.forEach((tagData, tagName) => {
      result.push({
        path: `${lang}/tags/${tagData.slug}/index.html`,
        layout: ['tag', 'index'],
        data: {
          tag: tagName,
          lang: lang,
          posts: locals.posts.filter(post => {
            return post.lang === lang && 
                   post.tags && 
                   post.tags.some(t => t.name === tagName);
          })
        }
      });
    });
    
    hexo.log.info(`[i18n_tag_${lang}] Generated ${result.length} ${lang.toUpperCase()} tag pages`);
    
    return result;
  };
}

/**
 * 通用的 i18n 分类生成器工厂函数
 * @param {string} lang - 语言代码
 */
function createI18nCategoryGenerator(lang) {
  return function(locals) {
    const posts = locals.posts;
    
    // 获取该语言的文章
    const langPosts = posts.filter(post => post.lang === lang);
    
    if (langPosts.length === 0) {
      return [];
    }
    
    // 收集该语言文章的所有分类
    const langCategories = new Map();
    
    langPosts.forEach(post => {
      if (post.categories && post.categories.length > 0) {
        post.categories.toArray().forEach(cat => {
          if (!langCategories.has(cat.name)) {
            langCategories.set(cat.name, {
              name: cat.name,
              slug: cat.slug,
              posts: []
            });
          }
          langCategories.get(cat.name).posts.push(post);
        });
      }
    });
    
    // 为每个分类生成页面
    const result = [];
    
    langCategories.forEach((catData, catName) => {
      result.push({
        path: `${lang}/categories/${catData.slug}/index.html`,
        layout: ['category', 'index'],
        data: {
          category: catName,
          lang: lang,
          posts: locals.posts.filter(post => {
            return post.lang === lang && 
                   post.categories && 
                   post.categories.some(c => c.name === catName);
          })
        }
      });
    });
    
    hexo.log.info(`[i18n_category_${lang}] Generated ${result.length} ${lang.toUpperCase()} category pages`);
    
    return result;
  };
}

// 注册英文标签和分类生成器
hexo.extend.generator.register('i18n_tag_en', createI18nTagGenerator('en'));
hexo.extend.generator.register('i18n_category_en', createI18nCategoryGenerator('en'));

// 注册韩语标签和分类生成器
hexo.extend.generator.register('i18n_tag_ko', createI18nTagGenerator('ko'));
hexo.extend.generator.register('i18n_category_ko', createI18nCategoryGenerator('ko'));