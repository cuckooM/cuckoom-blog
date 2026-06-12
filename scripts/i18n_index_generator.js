/**
 * i18n Index Generator
 * 为每个非默认语言生成首页 (如 /en/index.html, /ko/index.html, /ja/index.html)
 * 
 * 解决问题：
 * - 访问 cuckoom.com/en/ 等路径时返回 403 错误
 * - 原因是这些目录下没有 index.html 文件
 * 
 * 方案：注册 Generator，使用 index 布局模板为每个非默认语言生成首页
 * 模板会通过 page.lang 和 filter_posts_by_lang 自动过滤出对应语言的文章
 */

'use strict';

/**
 * 通用的 i18n 首页生成器工厂函数
 * @param {string} lang - 语言代码
 */
function createI18nIndexGenerator(lang) {
  return function(locals) {
    // 验证该语言有文章
    const posts = locals.posts;
    const langPosts = posts.filter(post => post.lang === lang);
    
    // 即使没有文章也生成首页（显示"暂无文章"提示）
    return [{
      path: `${lang}/index.html`,
      layout: 'index',
      data: {
        lang: lang,
        current: 1,
        total: 1
      }
    }];
  };
}

// 注册英文首页生成器
hexo.extend.generator.register('i18n_index_en', createI18nIndexGenerator('en'));

// 注册韩语首页生成器
hexo.extend.generator.register('i18n_index_ko', createI18nIndexGenerator('ko'));

// 注册日语首页生成器
hexo.extend.generator.register('i18n_index_ja', createI18nIndexGenerator('ja'));

hexo.log.info('[i18n_index] Registered index generators for en, ko, ja');
