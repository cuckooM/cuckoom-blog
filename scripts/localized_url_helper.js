/**
 * Custom URL helper to handle multilingual routing
 * Modifies url_for behavior based on current page language context
 * 
 * This helper is used to automatically convert tag and category paths
 * to their language-specific versions (e.g., /tags/AI/ -> /en/tags/AI/)
 */
hexo.extend.helper.register('localized_url_for', function(path) {
  // Get current page context
  const currentPath = this.page.path || '';
  const isEnglishPage = currentPath.startsWith('en/');

  // Handle various path transformations based on current page language
  if (isEnglishPage) {
    // If we're on an English page and the path is a Chinese category or tag path
    // This handles both /categories/ and /tags/ with or without specific names
    if (path.startsWith('/categories/') || path.startsWith('/tags/')) {
      // Convert to English version
      if (path.startsWith('/categories/')) {
        return this.url_for(path.replace('/categories/', '/en/categories/'));
      } else if (path.startsWith('/tags/')) {
        return this.url_for(path.replace('/tags/', '/en/tags/'));
      }
    }
    // If path is already an English path, return it as-is
    else if (path.startsWith('/en/categories/') || path.startsWith('/en/tags/')) {
      return this.url_for(path);
    }
    // For other paths on English pages, return them as-is if they're already English
    else if (path.startsWith('/en/')) {
      return this.url_for(path);
    }
    // For other paths that should be English (like /archives/, /about/, etc.), prepend /en/
    else if (path.startsWith('/') && !path.startsWith('/en/')) {
      // Check if this is a standard site path that should have /en/ prefix in English context
      if (path === '/' || path.startsWith('/archives/') || path.startsWith('/about') || path.startsWith('/search/')) {
        return this.url_for('/en' + (path === '/' ? '' : path));
      }
    }
  } else {
    // If we're on a Chinese page and the path is an English path, convert back to Chinese
    if (path.startsWith('/en/categories/')) {
      return this.url_for(path.replace('/en/categories/', '/categories/'));
    } else if (path.startsWith('/en/tags/')) {
      return this.url_for(path.replace('/en/tags/', '/tags/'));
    } else if (path.startsWith('/en/archives/')) {
      return this.url_for(path.replace('/en/archives/', '/archives/'));
    } else if (path.startsWith('/en/about')) {
      return this.url_for(path.replace('/en/about', '/about'));
    } else {
      return this.url_for(path);
    }
  }

  // Otherwise return the original path through url_for
  return this.url_for(path);
});