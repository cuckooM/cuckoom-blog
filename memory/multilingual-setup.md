# Multilingual Setup - CuckooM Blog

## Files Modified

### themes/landscape/layout/_partial/header.ejs
- Determines current language from `page.path`
- Passes `currentLang` to language-switcher partial
- Selects menu based on current language

### themes/landscape/layout/_partial/language-switcher.ejs
- Shows current language based on page context
- JavaScript to change language by modifying URL

### _config.yml
- Theme config with menu per language (zh-CN, en)
- Links configuration

### languages/zh-CN.yml, languages/en.yml
- Language files for UI text translation

## Directory Structure

```
source/
  _posts/          # Chinese articles (default lang)
  en/
    index.md       # English home
    about/
    archives/
    categories/
    tags/
    _posts/        # English articles (if any)
```

## Key Configuration

- **Language detection**: Based on `page.path` prefix (`en/`, `zh-TW/`, default `zh-CN`)
- **Menu**: Defined per language in `_config.yml` under `theme_config.menu`
- **Language switcher**: Uses JavaScript to navigate between language versions

## How It Works

1. Header determines current language from URL path
2. Menu renders based on current language
3. Language switcher shows current language and navigates to other languages
4. i18n plugin handles page.path routing
