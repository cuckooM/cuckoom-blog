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

// 从集中配置读取支持的语言，自动注册首页生成器
// 跳过默认语言（第一个语言），仅为非默认语言注册
const supportedLanguages = hexo.config.supported_languages || {};
const allLanguages = hexo.config.language;
const languages = Array.isArray(allLanguages) ? allLanguages : [allLanguages || 'zh-CN'];
const defaultLang = languages[0];

const langsToRegister = Object.keys(supportedLanguages).length > 0
  ? Object.keys(supportedLanguages).filter(l => l !== defaultLang)
  : languages.filter(l => l !== defaultLang);

langsToRegister.forEach(lang => {
  hexo.extend.generator.register('i18n_index_' + lang, createI18nIndexGenerator(lang));
});

hexo.log.info(`[i18n_index] Registered index generators for: ${langsToRegister.join(', ')}`);
