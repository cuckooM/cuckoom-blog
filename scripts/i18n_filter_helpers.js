/**
 * 多语言过滤 Helper 函数
 * 
 * 遵循 Hexo 最佳实践：使用 Helper 注册可复用的模板逻辑
 * 替代模板中硬编码的 Unicode 范围过滤和 currentLang 三元链
 */

'use strict';

// 获取当前语言的默认语言代码
hexo.extend.helper.register('get_default_lang', function() {
  var languages = this.config.language;
  return (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
});

// 判断文章是否属于指定语言
hexo.extend.helper.register('is_post_lang', function(post, lang) {
  var defaultLang = this.config.language;
  if (Array.isArray(defaultLang)) defaultLang = defaultLang[0];
  defaultLang = defaultLang || 'zh-CN';
  
  var postLang = post.lang || defaultLang;
  return postLang === lang;
});

// 按语言过滤分类列表（返回含 name/path/length 的对象数组）
hexo.extend.helper.register('filter_categories_by_lang', function(categories, currentLang) {
  var defaultLang = this.config.language;
  if (Array.isArray(defaultLang)) defaultLang = defaultLang[0];
  defaultLang = defaultLang || 'zh-CN';
  
  return categories.toArray()
    .map(function(cat) {
      var filteredPosts = cat.posts.toArray().filter(function(post) {
        var postLang = post.lang || defaultLang;
        return postLang === currentLang;
      });
      return {
        name: cat.name,
        path: cat.path,
        length: filteredPosts.length
      };
    })
    .filter(function(cat) {
      return cat.length > 0;
    });
});

// 按语言过滤标签列表（返回含 name/path/length 的对象数组）
hexo.extend.helper.register('filter_tags_by_lang', function(tags, currentLang) {
  var defaultLang = this.config.language;
  if (Array.isArray(defaultLang)) defaultLang = defaultLang[0];
  defaultLang = defaultLang || 'zh-CN';
  
  return tags.toArray()
    .map(function(tag) {
      var filteredPosts = tag.posts.toArray().filter(function(post) {
        var postLang = post.lang || defaultLang;
        return postLang === currentLang;
      });
      return {
        name: tag.name,
        path: tag.path,
        length: filteredPosts.length
      };
    })
    .filter(function(tag) {
      return tag.length > 0;
    });
});

// 按语言过滤文章列表
hexo.extend.helper.register('filter_posts_by_lang', function(posts, currentLang) {
  var defaultLang = this.config.language;
  if (Array.isArray(defaultLang)) defaultLang = defaultLang[0];
  defaultLang = defaultLang || 'zh-CN';
  
  return posts.filter(function(post) {
    var postLang = post.lang || defaultLang;
    return postLang === currentLang;
  });
});

// 获取语言前缀（用于 URL 构建）
hexo.extend.helper.register('get_lang_prefix', function(currentLang) {
  var defaultLang = this.config.language;
  if (Array.isArray(defaultLang)) defaultLang = defaultLang[0];
  defaultLang = defaultLang || 'zh-CN';
  
  if (currentLang === defaultLang) return '';
  return currentLang + '/';
});

// 获取月份名称数组
hexo.extend.helper.register('get_month_names', function(currentLang) {
  if (currentLang === 'en') {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  } else if (currentLang === 'ko') {
    return ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  } else if (currentLang === 'ja') {
    return ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  } else {
    return ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  }
});

// 获取支持的语言列表（从 _config.yml 的 supported_languages 读取）
hexo.extend.helper.register('get_supported_languages', function() {
  var supported = this.config.supported_languages;
  if (supported && typeof supported === 'object') {
    var result = {};
    Object.keys(supported).forEach(function(lang) {
      result[lang] = {
        label: supported[lang].label || lang,
        path: supported[lang].path || (lang === this.config.language[0] ? '/' : '/' + lang + '/')
      };
    }.bind(this));
    return result;
  }
  // Fallback: derive from config.language
  var languages = this.config.language;
  if (!Array.isArray(languages)) {
    languages = [languages || 'zh-CN'];
  }
  var fallback = {};
  languages.forEach(function(lang, i) {
    fallback[lang] = {
      label: lang,
      path: i === 0 ? '/' : '/' + lang + '/'
    };
  });
  return fallback;
});

// 生成带语言前缀的 URL
hexo.extend.helper.register('url_with_lang', function(path, currentLang) {
  var languages = this.config.language;
  var defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  if (currentLang === defaultLang) {
    return this.url_for(path);
  }
  return this.url_for(currentLang + '/' + path);
});

// 获取文章的正确 URL（考虑语言前缀）
hexo.extend.helper.register('post_url_i18n', function(post) {
  if (!post) return '';
  var languages = this.config.language;
  var defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  var postLang = post.lang || defaultLang;
  
  // 非默认语言文章：URL 带语言前缀
  if (postLang !== defaultLang) {
    return this.url_for(postLang + '/' + post.path);
  }
  
  // 默认语言文章：URL 无前缀
  return this.url_for(post.path);
});

// 获取同语言的文章导航（上一篇/下一篇）
hexo.extend.helper.register('get_i18n_post_nav', function(post) {
  var languages = this.config.language;
  var defaultLang = (Array.isArray(languages) ? languages[0] : languages) || 'zh-CN';
  var postLang = post.lang || defaultLang;
  
  // 获取所有文章并按日期排序（与 Hexo 默认行为一致）
  var posts = this.site.posts.sort('-date').toArray();
  
  // 过滤出同语言的文章
  var sameLangPosts = posts.filter(function(p) { return (p.lang || defaultLang) === postLang; });
  
  // 找到当前文章在过滤列表中的索引
  var currentIndex = sameLangPosts.findIndex(function(p) { return p._id === post._id; });
  
  // 返回同语言的上一篇和下一篇
  return {
    prev: currentIndex > 0 ? sameLangPosts[currentIndex - 1] : null,
    next: currentIndex < sameLangPosts.length - 1 ? sameLangPosts[currentIndex + 1] : null
  };
});
