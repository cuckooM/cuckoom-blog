/**
 * English Tag Generator
 * Generates English versions of tag pages for English posts
 */

hexo.extend.generator.register('en_tag', function(locals) {
  const result = [];

  // Get English posts
  const enPosts = locals.posts.toArray().filter(post => post.lang === 'en');

  // Group English posts by tag
  const tags = {};
  enPosts.forEach(post => {
    let tagArray = [];
    if (Array.isArray(post.tags)) {
      tagArray = post.tags;
    } else if (post.tags && post.tags.toArray) {
      tagArray = post.tags.toArray();
    }

    tagArray.forEach(tag => {
      const tagName = typeof tag === 'string' ? tag : tag.name;
      if (!tags[tagName]) {
        tags[tagName] = {
          name: tagName,
          posts: []
        };
      }
      tags[tagName].posts.push(post);
    });
  });

  // Generate English tag pages
  Object.keys(tags).forEach(tagName => {
    const tag = tags[tagName];
    tag.posts.sort((a, b) => b.date - a.date);

    // Replace spaces with hyphens for cleaner URLs
    const cleanTagName = tagName.replace(/\s+/g, '-');
    const encodedTagName = encodeURIComponent(cleanTagName);

    result.push({
      path: `en/tags/${encodedTagName}/index.html`,
      layout: ['tag', 'archive', 'index'],
      data: {
        type: 'tag',
        tag: tagName,
        posts: tag.posts,
        title: tagName,
        section: 'en',
        category_names: [], // Will be populated by category generator if needed
        tag_names: Object.keys(tags) // Pass tag names for sidebar
      }
    });
  });

  return result;
});