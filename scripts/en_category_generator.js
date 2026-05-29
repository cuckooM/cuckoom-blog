/**
 * English Category Generator
 * Generates English versions of category pages for English posts
 */

hexo.extend.generator.register('en_category', function(locals) {
  const result = [];

  // Get English posts
  const enPosts = locals.posts.toArray().filter(post => post.lang === 'en');

  // Group English posts by category hierarchy
  const categoryMap = new Map();

  enPosts.forEach(post => {
    let catArray = [];
    if (Array.isArray(post.categories)) {
      catArray = post.categories;
    } else if (post.categories && post.categories.toArray) {
      catArray = post.categories.toArray();
    }

    // Process each category in the hierarchy
    for (let i = 0; i < catArray.length; i++) {
      const cats = catArray.slice(0, i + 1); // Get the hierarchical path
      const catPath = cats.map(c => typeof c === 'string' ? c : c.name).join('/');

      if (!categoryMap.has(catPath)) {
        categoryMap.set(catPath, []);
      }
      categoryMap.get(catPath).push(post);
    }
  });

  // Generate English category pages for each level
  for (const [catPath, posts] of categoryMap) {
    posts.sort((a, b) => b.date - a.date);

    // Replace spaces with hyphens and encode each segment separately
    const pathSegments = catPath.split('/').map(segment => {
      // Replace spaces with hyphens for cleaner URLs
      const cleanSegment = segment.replace(/\s+/g, '-');
      return encodeURIComponent(cleanSegment);
    });
    const encodedPath = pathSegments.join('/');

    result.push({
      path: `en/categories/${encodedPath}/index.html`,
      layout: ['category', 'archive', 'index'],
      data: {
        type: 'category',
        category: catPath, // Full path as category name
        posts: posts,
        title: catPath.split('/').pop(), // Last segment as title
        section: 'en',
        category_names: [...categoryMap.keys()], // Pass all category paths for sidebar
        tag_names: [] // Will be populated by tag generator if needed
      }
    });
  }

  return result;
});