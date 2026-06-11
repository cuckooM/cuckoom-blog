// 本地化站点标题
hexo.extend.helper.register('title_i18n', function() {
  const lang = (this.page && this.page.lang) || this.config.language || 'zh-CN'
  const titles = {
    'zh-CN': "CuckooM's Blog",
    'en': "CuckooM's Tech Blog",
    'ko': "CuckooM의 기술 블로그",
    'ja': "CuckooMの技術ブログ"
  }
  return titles[lang] || titles['zh-CN']
})
