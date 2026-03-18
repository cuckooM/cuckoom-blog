/**
 * English TagCloud Helper
 * Generates tagcloud HTML for English posts
 */

hexo.extend.helper.register('generateEnglishTagcloud', function(tagObjects) {
  if (!tagObjects || !Array.isArray(tagObjects) || tagObjects.length === 0) {
    return '';
  }

  const min = 10;
  const max = 20;
  const amount = 100;
  const color = true;
  const startColor = '#ccc';
  const endColor = '#111';

  // Sort tags by name
  tagObjects.sort((a, b) => a.name.localeCompare(b.name));

  // Limit the number of tags
  const limitedTags = tagObjects.slice(0, amount);

  // Calculate font sizes based on tag frequency (length property)
  const sizes = [];
  limitedTags.forEach(tag => {
    const count = tag.length || 1;
    if (!sizes.includes(count)) {
      sizes.push(count);
    }
  });

  sizes.sort((a, b) => a - b);
  const maxCount = sizes[sizes.length - 1] || 1;
  const minCount = sizes[0] || 1;
  const countRange = maxCount - minCount || 1;

  const result = [];

  limitedTags.forEach(tag => {
    const count = tag.length || 1;
    const ratio = countRange ? (count - minCount) / countRange : 0;
    const size = min + ((max - min) * ratio);

    let style = `font-size: ${parseFloat(size.toFixed(2))}px;`;
    if (color) {
      // Simple color interpolation between startColor and endColor
      // Handle both #RGB and #RRGGBB formats
      const parseHex = (hex) => {
        if (hex.length === 4) { // #RGB format
          return {
            r: parseInt(hex[1] + hex[1], 16),
            g: parseInt(hex[2] + hex[2], 16),
            b: parseInt(hex[3] + hex[3], 16)
          };
        } else { // #RRGGBB format
          return {
            r: parseInt(hex.substring(1, 3), 16),
            g: parseInt(hex.substring(3, 5), 16),
            b: parseInt(hex.substring(5, 7), 16)
          };
        }
      };

      const c1 = parseHex(startColor);
      const c2 = parseHex(endColor);

      const red = Math.min(255, Math.max(0, Math.round(c1.r + (c2.r - c1.r) * ratio)));
      const green = Math.min(255, Math.max(0, Math.round(c1.g + (c2.g - c1.g) * ratio)));
      const blue = Math.min(255, Math.max(0, Math.round(c1.b + (c2.b - c1.b) * ratio)));

      const redHex = red.toString(16).padStart(2, '0');
      const greenHex = green.toString(16).padStart(2, '0');
      const blueHex = blue.toString(16).padStart(2, '0');

      style += ` color: #${redHex}${greenHex}${blueHex}`;
    }

    // Fix URL path - ensure it starts with / but not //
    const path = tag.path.replace('/tags/', '/en/tags/');
    const url = path.startsWith('/') ? path : '/' + path;
    result.push(`<a href="${url}" style="${style}">${tag.name}</a>`);
  });

  return result.join(' ');
});
