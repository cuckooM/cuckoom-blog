// Filter posts by language based on path or front-matter
hexo.extend.filter.register('after_post_render', function(data) {
  // Check front-matter lang first
  if (data.lang && (data.lang === 'en' || data.lang === 'zh-CN')) {
    // Use lang from front-matter
  } else if (data.path && data.path.startsWith('en/')) {
    // Fallback to path-based detection
    data.lang = 'en';
  } else {
    // Default to Chinese
    data.lang = 'zh-CN';
  }

  // Update the post in site.posts collection
  if (this.site && this.site.posts) {
    this.site.posts.forEach(function(post) {
      if (post.path === data.path) {
        post.lang = data.lang;
      }
    });
  }

  return data;
});
