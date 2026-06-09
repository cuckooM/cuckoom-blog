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

  // Normalize path to always start with /
  const normalizedPath = path.startsWith('/') ? path : '/' + path;

  // Debug output (can be removed after verification)
  console.log(`[localized_url_for] currentPath: ${currentPath}, isEnglishPage: ${isEnglishPage}, inputPath: ${path}, normalizedPath: ${normalizedPath}`);

  // Handle various path transformations based on current page language
  if (isEnglishPage) {
    // If we're on an English page and the path is a Chinese category or tag path
    // This handles both /categories/ and /tags/ with or without specific names
    if (normalizedPath.startsWith('/categories/') || normalizedPath.startsWith('/tags/')) {
      // Convert to English version
      if (normalizedPath.startsWith('/categories/')) {
        const result = this.url_for(normalizedPath.replace('/categories/', '/en/categories/'));
        console.log(`[localized_url_for] Converting Chinese category to English: ${normalizedPath} -> ${result}`);
        return result;
      } else if (normalizedPath.startsWith('/tags/')) {
        const result = this.url_for(normalizedPath.replace('/tags/', '/en/tags/'));
        console.log(`[localized_url_for] Converting Chinese tag to English: ${normalizedPath} -> ${result}`);
        return result;
      }
    }
    // If path is already an English path, return it as-is
    else if (normalizedPath.startsWith('/en/categories/') || normalizedPath.startsWith('/en/tags/')) {
      const result = this.url_for(normalizedPath);
      console.log(`[localized_url_for] Already English path: ${normalizedPath} -> ${result}`);
      return result;
    }
    // For other paths on English pages, return them as-is if they're already English
    else if (normalizedPath.startsWith('/en/')) {
      return this.url_for(normalizedPath);
    }
    // For other paths that should be English (like /archives/, /about/, etc.), prepend /en/
    else if (normalizedPath.startsWith('/') && !normalizedPath.startsWith('/en/')) {
      // Check if this is a standard site path that should have /en/ prefix in English context
      if (normalizedPath === '/' || normalizedPath.startsWith('/archives/') || normalizedPath.startsWith('/about') || normalizedPath.startsWith('/search/')) {
        return this.url_for('/en' + (normalizedPath === '/' ? '' : normalizedPath));
      }
    }
  } else {
    // If we're on a Chinese page and the path is an English path, convert back to Chinese
    if (normalizedPath.startsWith('/en/categories/')) {
      return this.url_for(normalizedPath.replace('/en/categories/', '/categories/'));
    } else if (normalizedPath.startsWith('/en/tags/')) {
      return this.url_for(normalizedPath.replace('/en/tags/', '/tags/'));
    } else if (normalizedPath.startsWith('/en/archives/')) {
      return this.url_for(normalizedPath.replace('/en/archives/', '/archives/'));
    } else if (normalizedPath.startsWith('/en/about')) {
      return this.url_for(normalizedPath.replace('/en/about', '/about'));
    } else {
      return this.url_for(normalizedPath);
    }
  }

  // Otherwise return the original path through url_for
  const fallbackResult = this.url_for(normalizedPath);
  console.log(`[localized_url_for] Fallback: ${normalizedPath} -> ${fallbackResult}`);
  return fallbackResult;
});