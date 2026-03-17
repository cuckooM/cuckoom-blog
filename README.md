# CuckooM's Blog

[![Hexo Version](https://img.shields.io/badge/hexo-8.0+-blue.svg)](https://hexo.io)
[![License](https://img.shields.io/github/license/cuckoom/cuckoom-blog.svg)](LICENSE)

This is the source code for my personal blog [https://www.cuckoom.com](https://www.cuckoom.com).

## Features

- Built with [Hexo](https://hexo.io) - A fast, simple & powerful blog framework
- Custom theme designed for readability and modern UI
- Optimized for SEO and performance
- Responsive design for mobile and desktop
- Syntax highlighting for code snippets
- Full-text search support

## Directory Structure

```
cuckoom-blog/
├── .github/           # GitHub configuration
├── scaffolds/         # Post templates
├── source/            # Source files (posts, pages)
│   └── _posts/        # Blog posts
├── themes/            # Themes
│   └── custom/        # Custom theme
├── .gitignore
├── _config.yml        # Site configuration
├── package.json
└── README.md
```

## Installation

### Prerequisites

- Node.js (v14 or higher)
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/cuckoom/cuckoom-blog.git
cd cuckoom-blog

# Install dependencies
npm install
# or
yarn install
```

## Usage

### Development

```bash
# Start local server
npm run server
# or
hexo server

# Generate static files
npm run build
# or
hexo generate

# Clean cache
npm run clean
# or
hexo clean
```

### Create New Post

```bash
hexo new "My New Post"
```

This creates a new post in `source/_posts/` with metadata template:

```markdown
---
title: My New Post
date: 2024-01-01
updated: 2024-01-01
categories:
tags:
description: ''
keywords: ''
cover: ''
---

Your content here...
```

### Create New Page

```bash
hexo new page "About"
```

## Configuration

Edit `_config.yml` to customize your site:

```yaml
# Site settings
title: CuckooM's Blog
subtitle: ''
description: ''
keywords:
author: CuckooM
language: zh-CN
timezone: 'Asia/Shanghai'

# URL
url: https://www.cuckoom.com
root: /

# Deployment
deploy:
  type: git
  repo: <your-repository-url>
  branch: main
```

### Theme Configuration

Edit `themes/custom/_config.yml` to customize the theme:

```yaml
nav:
  home: /
  archives: /archives/
  categories: /categories/
  tags: /tags/
  about: /about/

social:
  github: https://github.com/yourname
  email: mailto:your.email@example.com
```

## Deployment

### Deploy to GitHub Pages

1. Update the `repo` field in `_config.yml` with your repository URL:

```yaml
deploy:
  type: git
  repo: https://github.com/yourusername/yourusername.github.io.git
  branch: main
```

2. Install the deployer:

```bash
npm install hexo-deployer-git --save
```

3. Deploy:

```bash
hexo clean
hexo generate
hexo deploy
```

### Deploy to Other Hosting

Copy the contents of the `public/` directory to your web server:

```bash
hexo generate
# Copy public/ to your web server
```

## Customization

### Modify Colors

Edit `themes/custom/source/css/style.css` and modify the color variables:

```css
:root {
  --primary-color: #4a90d9;
  --secondary-color: #357abd;
  --text-color: #333;
  --background-color: #f9f9f9;
}
```

### Add Social Links

Edit `themes/custom/layout/_partial/header.ejs` to add more social links.

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run server` | Start local development server |
| `npm run build` | Generate static files for production |
| `npm run clean` | Clean cache and generated files |
| `hexo new "Post Title"` | Create a new post |
| `hexo new page "Page Title"` | Create a new page |

## Plugins

- [hexo-generator-archive](https://github.com/hexojs/hexo-generator-archive) - Archive generator
- [hexo-generator-category](https://github.com/hexojs/hexo-generator-category) - Category generator
- [hexo-generator-index](https://github.com/hexojs/hexo-generator-index) - Index generator
- [hexo-generator-tag](https://github.com/hexojs/hexo-generator-tag) - Tag generator
- [hexo-renderer-ejs](https://github.com/hexojs/hexo-renderer-ejs) - EJS template renderer
- [hexo-renderer-marked](https://github.com/hexojs/hexo-renderer-marked) - Markdown renderer
- [hexo-renderer-stylus](https://github.com/hexojs/hexo-renderer-stylus) - Stylus renderer
- [hexo-server](https://github.com/hexojs/hexo-server) - Development server

## License

[MIT](LICENSE) © 2024 CuckooM