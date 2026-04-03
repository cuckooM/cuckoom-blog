/**
 * English Posts Generator
 * Handles posts with lang: en in front-matter
 */

// Override default Hexo post generator to handle English posts
hexo.extend.generator.register('post', function(locals) {
  const allPosts = locals.posts.toArray();

  const result = [];

  allPosts.forEach(function(post) {
    // For English posts, modify path to add en/ prefix and remove en- from slug
    if (post.lang === 'en') {
      // Extract date components from the original path
      // Hexo default path format: YYYY/MM/DD/slug/
      const parts = post.path.split('/').filter(p => p);

      if (parts.length >= 4) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];

        // Get slug from the last part before trailing slash
        let slug = parts[3];

        // Remove 'en-' prefix if present
        if (slug.startsWith('en-')) {
          slug = slug.substring(3);
        }

        // Construct new path with en/ prefix
        const newPath = `en/${year}/${month}/${day}/${slug}/`;

        // Since post.path is a getter, use Object.defineProperty to override it
        Object.defineProperty(post, 'path', {
          value: newPath,
          writable: false,
          enumerable: true,
          configurable: true
        });

        // Also update the slug by defining a custom property
        // This ensures the slug is correct for API and internal use
        Object.defineProperty(post, 'slug', {
          value: slug,
          writable: false,
          enumerable: true,
          configurable: true
        });
      }
    }

    result.push({
      path: post.path,
      layout: post.layout,
      data: post
    });
  });

  return result;
});

// Generator for English posts index page
hexo.extend.generator.register('en_posts_index', function(locals) {
  const enPosts = locals.posts
    .toArray()
    .filter(post => post.lang === 'en');

  enPosts.sort((a, b) => b.date - a.date);

  // Get unique categories and tags from English posts
  const categories = {};
  const tags = {};
  enPosts.forEach(post => {
    let catArray = [];
    if (Array.isArray(post.categories)) {
      catArray = post.categories;
    } else if (post.categories && post.categories.toArray) {
      catArray = post.categories.toArray();
    }
    catArray.forEach(cat => {
      if (typeof cat === 'string') {
        categories[cat] = (categories[cat] || 0) + 1;
      } else if (typeof cat === 'object' && cat.name) {
        categories[cat.name] = (categories[cat.name] || 0) + 1;
      }
    });

    let tagArray = [];
    if (Array.isArray(post.tags)) {
      tagArray = post.tags;
    } else if (post.tags && post.tags.toArray) {
      tagArray = post.tags.toArray();
    }
    tagArray.forEach(tag => {
      if (typeof tag === 'string') {
        tags[tag] = (tags[tag] || 0) + 1;
      } else if (typeof tag === 'object' && tag.name) {
        tags[tag.name] = (tags[tag.name] || 0) + 1;
      }
    });
  });

  const enCategoryNames = Object.keys(categories).sort();
  const enTagNames = Object.keys(tags).sort();
  // Get actual tag objects for the tagcloud helper
  const enTagObjects = enTagNames.map(tagName => {
    const tag = locals.site?.tags?.find(t => t.name === tagName);
    return tag || { name: tagName, path: '/tags/' + tagName + '/', length: tags[tagName] };
  });

  return {
    path: 'en/index.html',
    layout: ['archive', 'index'],
    data: {
      posts: enPosts,
      type: 'archive',
      layout: 'archive',
      section: 'en',
      title: 'Home',
      category_names: enCategoryNames,
      tag_names: enTagObjects
    }
  };
});

// Generator for English posts archive pages
hexo.extend.generator.register('en_posts_archives', function(locals) {
  const enPosts = locals.posts
    .toArray()
    .filter(post => post.lang === 'en');

  // Get unique categories and tags from English posts (for sidebar)
  const categories = {};
  const tags = {};
  enPosts.forEach(post => {
    let catArray = [];
    if (Array.isArray(post.categories)) {
      catArray = post.categories;
    } else if (post.categories && post.categories.toArray) {
      catArray = post.categories.toArray();
    }
    catArray.forEach(cat => {
      if (typeof cat === 'string') {
        categories[cat] = (categories[cat] || 0) + 1;
      } else if (typeof cat === 'object' && cat.name) {
        categories[cat.name] = (categories[cat.name] || 0) + 1;
      }
    });

    let tagArray = [];
    if (Array.isArray(post.tags)) {
      tagArray = post.tags;
    } else if (post.tags && post.tags.toArray) {
      tagArray = post.tags.toArray();
    }
    tagArray.forEach(tag => {
      if (typeof tag === 'string') {
        tags[tag] = (tags[tag] || 0) + 1;
      } else if (typeof tag === 'object' && tag.name) {
        tags[tag.name] = (tags[tag.name] || 0) + 1;
      }
    });
  });

  // Group by year and month
  const archives = {};
  enPosts.forEach(post => {
    const year = post.date.year();
    const month = post.date.format('MM');

    if (!archives[year]) {
      archives[year] = {};
    }
    if (!archives[year][month]) {
      archives[year][month] = [];
    }
    archives[year][month].push(post);
  });

  const result = [];

  // Get actual tag objects for the tagcloud helper
  const enTagObjects = Object.keys(tags).sort().map(tagName => {
    const tag = locals.site?.tags?.find(t => t.name === tagName);
    return tag || { name: tagName, path: '/tags/' + tagName + '/', length: tags[tagName] };
  });

  // Generate monthly archive pages
  Object.keys(archives).forEach(year => {
    const months = archives[year];
    Object.keys(months).forEach(month => {
      months[month].sort((a, b) => b.date - a.date);
      result.push({
        path: `en/archives/${year}/${month}/index.html`,
        layout: ['archive', 'index'],
        data: {
          posts: months[month],
          type: 'archive',
          layout: 'archive',
          section: 'en',
          year: year,
          month: month,
          category_names: Object.keys(categories).sort(),
          tag_names: enTagObjects
        }
      });
    });

    // Generate yearly archive page
    const yearPosts = [];
    Object.keys(months).forEach(month => {
      yearPosts.push(...months[month]);
    });
    yearPosts.sort((a, b) => b.date - a.date);
    result.push({
      path: `en/archives/${year}/index.html`,
      layout: ['archive', 'index'],
      data: {
        posts: yearPosts,
        type: 'archive',
        layout: 'archive',
        section: 'en',
        year: year,
        category_names: Object.keys(categories).sort(),
        tag_names: enTagObjects
      }
    });
  });

  // Generate main archive index page (list of years)
  const allYears = Object.keys(archives).sort((a, b) => b - a);
  result.push({
    path: 'en/archives/index.html',
    layout: ['archive', 'index'],
    data: {
      posts: enPosts,
      type: 'archive',
      layout: 'archive',
      section: 'en',
      years: allYears,
      archives: archives,
      category_names: Object.keys(categories).sort(),
      tag_names: enTagObjects
    }
  });

  return result;
});

// Generator for English categories page
hexo.extend.generator.register('en_categories', function(locals) {
  const enPosts = locals.posts
    .toArray()
    .filter(post => post.lang === 'en');

  // Get unique categories and tags from English posts
  const categories = {};
  const tags = {};
  enPosts.forEach(post => {
    let catArray = [];
    if (Array.isArray(post.categories)) {
      catArray = post.categories;
    } else if (post.categories && post.categories.toArray) {
      catArray = post.categories.toArray();
    }
    catArray.forEach(cat => {
      if (typeof cat === 'string') {
        categories[cat] = (categories[cat] || 0) + 1;
      } else if (typeof cat === 'object' && cat.name) {
        categories[cat.name] = (categories[cat.name] || 0) + 1;
      }
    });

    let tagArray = [];
    if (Array.isArray(post.tags)) {
      tagArray = post.tags;
    } else if (post.tags && post.tags.toArray) {
      tagArray = post.tags.toArray();
    }
    tagArray.forEach(tag => {
      if (typeof tag === 'string') {
        tags[tag] = (tags[tag] || 0) + 1;
      } else if (typeof tag === 'object' && tag.name) {
        tags[tag.name] = (tags[tag.name] || 0) + 1;
      }
    });
  });

  const enCategoryNames = Object.keys(categories).sort();
  const enTagNames = Object.keys(tags).sort();
  // Get actual tag objects for the tagcloud helper
  const enTagObjects = enTagNames.map(tagName => {
    const tag = locals.site?.tags?.find(t => t.name === tagName);
    return tag || { name: tagName, path: '/tags/' + tagName + '/', length: tags[tagName] };
  });

  // Generate main categories index page (list of categories)
  // Store category names in data for template
  return {
    path: 'en/categories/index.html',
    layout: ['categories', 'index'],
    data: {
      type: 'categories',
      title: 'Categories',
      section: 'en',
      category_names: enCategoryNames,
      tag_names: enTagObjects
    }
  };
});

// Generator for English tags page
hexo.extend.generator.register('en_tags', function(locals) {
  const enPosts = locals.posts
    .toArray()
    .filter(post => post.lang === 'en');

  // Get unique categories and tags from English posts
  const categories = {};
  const tags = {};
  enPosts.forEach(post => {
    let catArray = [];
    if (Array.isArray(post.categories)) {
      catArray = post.categories;
    } else if (post.categories && post.categories.toArray) {
      catArray = post.categories.toArray();
    }
    catArray.forEach(cat => {
      if (typeof cat === 'string') {
        categories[cat] = (categories[cat] || 0) + 1;
      } else if (typeof cat === 'object' && cat.name) {
        categories[cat.name] = (categories[cat.name] || 0) + 1;
      }
    });

    let tagArray = [];
    if (Array.isArray(post.tags)) {
      tagArray = post.tags;
    } else if (post.tags && post.tags.toArray) {
      tagArray = post.tags.toArray();
    }
    tagArray.forEach(tag => {
      if (typeof tag === 'string') {
        tags[tag] = (tags[tag] || 0) + 1;
      } else if (typeof tag === 'object' && tag.name) {
        tags[tag.name] = (tags[tag.name] || 0) + 1;
      }
    });
  });

  const enCategoryNames = Object.keys(categories).sort();
  const enTagNames = Object.keys(tags).sort();
  // Get actual tag objects for the tagcloud helper
  const enTagObjects = enTagNames.map(tagName => {
    const tag = locals.site?.tags?.find(t => t.name === tagName);
    return tag || { name: tagName, path: '/tags/' + tagName + '/', length: tags[tagName] };
  });

  // Generate main tags index page (list of tags)
  return {
    path: 'en/tags/index.html',
    layout: ['tags', 'index'],
    data: {
      type: 'tags',
      title: 'Tags',
      section: 'en',
      category_names: enCategoryNames,
      tag_names: enTagObjects
    }
  };
});

// Generator for English about page
// Let Hexo's default page generator handle about pages
// The source/en/about/index.md file will be processed normally
