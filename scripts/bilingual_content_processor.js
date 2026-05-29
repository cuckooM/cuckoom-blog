/**
 * Bilingual Content Processor
 * Creates separate category and tag collections for English and Chinese content
 */

// Extend helper to get language-specific content
hexo.extend.helper.register('getLangSpecificCategories', function() {
  // Determine language based on current page
  const currentPagePath = this.page.path || '';
  const isEnglishPage = currentPagePath.startsWith('en/');

  if (isEnglishPage) {
    // Get English posts and their categories
    const englishPosts = this.site.posts.toArray().filter(post => post.lang === 'en');

    // Group categories by their full path to preserve hierarchy
    const categoryPaths = {};

    englishPosts.forEach(post => {
      let catArray = [];
      if (Array.isArray(post.categories)) {
        catArray = post.categories;
      } else if (post.categories && post.categories.toArray) {
        catArray = post.categories.toArray();
      }

      // Generate all hierarchical paths for this post
      for (let i = 1; i <= catArray.length; i++) {
        const subCategories = catArray.slice(0, i);
        const catNames = subCategories.map(cat => typeof cat === 'string' ? cat : cat.name);
        const fullPath = catNames.join('/');

        if (!categoryPaths[fullPath]) {
          // Generate the correct English path based on the full hierarchy with spaces replaced by hyphens
          const pathSegments = catNames.map(segment => {
            // Replace spaces with hyphens for cleaner URLs
            const cleanSegment = encodeURIComponent(segment.replace(/\s+/g, '-'));
            return cleanSegment;
          });
          const englishPath = `/en/categories/${pathSegments.join('/')}/`;

          categoryPaths[fullPath] = {
            name: catNames[i-1],  // Name of the current level
            path: englishPath,
            fullPath: fullPath,   // Full path for grouping
            length: 0
          };
        }
        categoryPaths[fullPath].length++;
      }
    });

    return Object.values(categoryPaths);
  } else {
    // For Chinese page, return Chinese categories (those with Chinese characters)
    const allCategories = this.site.categories.toArray();
    return allCategories.filter(category => /[\u4e00-\u9fa5]/.test(category.name));
  }
});

hexo.extend.helper.register('getLangSpecificTags', function() {
  // Determine language based on current page
  const currentPagePath = this.page.path || '';
  const isEnglishPage = currentPagePath.startsWith('en/');

  if (isEnglishPage) {
    // Get English posts and their tags
    const englishPosts = this.site.posts.toArray().filter(post => post.lang === 'en');
    const englishTags = {};

    englishPosts.forEach(post => {
      let tagArray = [];
      if (Array.isArray(post.tags)) {
        tagArray = post.tags;
      } else if (post.tags && post.tags.toArray) {
        tagArray = post.tags.toArray();
      }

      tagArray.forEach(tag => {
        const tagName = typeof tag === 'string' ? tag : tag.name;
        if (!englishTags[tagName]) {
          // Generate the correct English path with spaces replaced by hyphens
          const cleanTagName = encodeURIComponent(tagName.replace(/\s+/g, '-'));
          const englishPath = `/en/tags/${cleanTagName}/`;

          englishTags[tagName] = {
            name: tagName,
            path: englishPath,
            length: 0
          };
        }
        englishTags[tagName].length++;
      });
    });

    return Object.values(englishTags);
  } else {
    // For Chinese page, return Chinese tags (those with Chinese characters)
    const allTags = this.site.tags.toArray();
    return allTags.filter(tag => /[\u4e00-\u9fa5]/.test(tag.name));
  }
});