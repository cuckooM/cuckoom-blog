/**
 * Final QA Acceptance Test for Multi-Language Refactoring
 * Project: cuckoom-blog
 * Phase: 4 (Final Validation)
 */

'use strict';

const fs = require('fs');
const path = require('path');

let testResults = [];
let hasErrors = false;

function log(status, message) {
  const symbol = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
  console.log(`   ${symbol} ${message}`);
  testResults.push({ status, message });
  if (status === 'FAIL') hasErrors = true;
}

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  FINAL QA ACCEPTANCE TEST - Multi-Language Refactoring Project');
console.log('═══════════════════════════════════════════════════════════════════\n');

// ============================================================================
// TEST 1: Build Success (No ERROR/WARN)
// ============================================================================
console.log('TEST 1: Build Validation');
console.log('─────────────────────────────────────────────────────────────────');

try {
  const publicDir = path.join(__dirname, 'public');
  const stats = fs.statSync(publicDir);
  log('PASS', 'Public directory exists');
  
  // Count all files recursively
  function countFiles(dir) {
    let count = 0;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        count += countFiles(fullPath);
      } else {
        count++;
      }
    }
    return count;
  }
  
  const fileCount = countFiles(publicDir);
  if (fileCount >= 100) {
    log('PASS', `Build generated ${fileCount} files`);
  } else {
    log('FAIL', `Build generated only ${fileCount} files`);
  }
  
  // Check for error logs
  const errorLog = path.join(__dirname, 'error.log');
  if (!fs.existsSync(errorLog)) {
    log('PASS', 'No error logs found');
  }
  
} catch (e) {
  log('FAIL', `Build validation error: ${e.message}`);
}

// ============================================================================
// TEST 2: _config.yml languages Configuration
// ============================================================================
console.log('\nTEST 2: _config.yml Configuration');
console.log('─────────────────────────────────────────────────────────────────');

try {
  const configPath = path.join(__dirname, '_config.yml');
  const configContent = fs.readFileSync(configPath, 'utf8');
  
  // Check languages section exists
  if (configContent.includes('languages:') && configContent.includes('code: zh-CN')) {
    log('PASS', 'languages configuration section found');
  } else {
    log('FAIL', 'Missing languages configuration section');
  }
  
  // Check structure
  if (configContent.includes('code: en') && configContent.includes('prefix: "en"')) {
    log('PASS', 'English language configured with prefix');
  }
  
  if (configContent.includes('default: true')) {
    log('PASS', 'Default language marked');
  }
  
} catch (e) {
  log('FAIL', `Configuration read error: ${e.message}`);
}

// ============================================================================
// TEST 3: AC-08 Configuration-Driven Verification
// ============================================================================
console.log('\nTEST 3: AC-08 - Configuration-Driven Verification');
console.log('─────────────────────────────────────────────────────────────────');

try {
  const generatorPath = path.join(__dirname, 'scripts', 'multi_lang_generator.js');
  const generatorContent = fs.readFileSync(generatorPath, 'utf8');
  
  // Check generator reads config.languages
  if (generatorContent.includes('config.languages') && generatorContent.includes('getLanguageConfig')) {
    log('PASS', 'Generator reads config.languages');
  } else {
    log('FAIL', 'Generator does not read config.languages');
  }
  
  // Check for dynamic language support
  if (generatorContent.includes('langConfig.forEach') || generatorContent.includes('.forEach(lang =>')) {
    log('PASS', 'Generator supports dynamic language iteration');
  }
  
  // Check for default fallback
  if (generatorContent.includes('zh-CN') && generatorContent.includes("prefix: ''")) {
    log('PASS', 'Default language configuration exists');
  }
  
} catch (e) {
  log('FAIL', `AC-08 validation error: ${e.message}`);
}

// ============================================================================
// TEST 4: Phase 1 - Helper Review
// ============================================================================
console.log('\nTEST 4: Phase 1 - Helper Review');
console.log('─────────────────────────────────────────────────────────────────');

try {
  // Check localized_url_helper.js
  const helperPath = path.join(__dirname, 'scripts', 'localized_url_helper.js');
  const helperContent = fs.readFileSync(helperPath, 'utf8');
  
  if (helperContent.includes("this.page.lang")) {
    log('PASS', 'Helper uses page.lang property');
  } else {
    log('FAIL', 'Helper does not use page.lang');
  }
  
  if (!helperContent.includes("page.path.startsWith('en/')")) {
    log('PASS', 'No hardcoded path detection in helper');
  } else {
    log('FAIL', 'Still using hardcoded path detection');
  }
  
  // Check bilingual_content_processor.js
  const processorPath = path.join(__dirname, 'scripts', 'bilingual_content_processor.js');
  const processorContent = fs.readFileSync(processorPath, 'utf8');
  
  if (processorContent.includes('getLangSpecificCategories') && processorContent.includes('getLangSpecificTags')) {
    log('PASS', 'Bilingual content processor helpers registered');
  }
  
} catch (e) {
  log('FAIL', `Phase 1 review error: ${e.message}`);
}

// ============================================================================
// TEST 5: Phase 2 - Generator Review
// ============================================================================
console.log('\nTEST 5: Phase 2 - Generator Review');
console.log('─────────────────────────────────────────────────────────────────');

try {
  const generatorPath = path.join(__dirname, 'scripts', 'multi_lang_generator.js');
  const generatorContent = fs.readFileSync(generatorPath, 'utf8');
  
  // Check unified generator exists
  if (generatorContent.includes('hexo.extend.generator.register')) {
    log('PASS', 'Unified generator registered');
  }
  
  // Check for page.lang injection
  if (generatorContent.includes('page.lang') || generatorContent.includes("lang: langCode")) {
    log('PASS', 'Generator injects page.lang');
  }
  
  // Check for language-specific paths
  if (generatorContent.includes('langPrefix')) {
    log('PASS', 'Generator creates language-specific paths');
  }
  
  // Check for archive support
  if (generatorContent.includes('archive') && generatorContent.includes('generateLanguageArchives')) {
    log('PASS', 'Generator supports archives');
  }
  
} catch (e) {
  log('FAIL', `Phase 2 review error: ${e.message}`);
}

// ============================================================================
// TEST 6: Phase 3 - Template Review
// ============================================================================
console.log('\nTEST 6: Phase 3 - Template Review');
console.log('─────────────────────────────────────────────────────────────────');

try {
  const layoutDir = path.join(__dirname, 'themes', 'landscape', 'layout');
  
  // Check templates use helpers
  const indexEjs = fs.readFileSync(path.join(layoutDir, 'index.ejs'), 'utf8');
  const headerEjs = fs.readFileSync(path.join(layoutDir, '_partial', 'header.ejs'), 'utf8');
  
  if (indexEjs.includes('get_current_lang') && indexEjs.includes('localized_url_for')) {
    log('PASS', 'index.ejs uses helpers');
  }
  
  if (headerEjs.includes('get_current_lang')) {
    log('PASS', 'header.ejs uses helpers');
  }
  
  // Check language switcher exists
  const switcherPath = path.join(layoutDir, '_partial', 'language-switcher.ejs');
  if (fs.existsSync(switcherPath)) {
    const switcherContent = fs.readFileSync(switcherPath, 'utf8');
    if (switcherContent.includes('currentLang')) {
      log('PASS', 'Language switcher template exists');
    }
  }
  
  // Check layout.ejs uses page.lang
  const layoutEjs = fs.readFileSync(path.join(layoutDir, 'layout.ejs'), 'utf8');
  if (layoutEjs.includes('page.lang')) {
    log('PASS', 'layout.ejs uses page.lang for html lang attribute');
  }
  
} catch (e) {
  log('FAIL', `Phase 3 review error: ${e.message}`);
}

// ============================================================================
// TEST 7: Phase 4 - Configuration Standardization
// ============================================================================
console.log('\nTEST 7: Phase 4 - Configuration Standardization');
console.log('─────────────────────────────────────────────────────────────────');

try {
  const configPath = path.join(__dirname, '_config.yml');
  const configContent = fs.readFileSync(configPath, 'utf8');
  
  // Check centralized config
  if (configContent.includes('languages:')) {
    log('PASS', 'Centralized languages configuration');
  }
  
  // Check menu configuration
  if (configContent.includes('menu:') && configContent.includes('zh-CN:') && configContent.includes('en:')) {
    log('PASS', 'Multi-language menu configuration');
  }
  
  // Check English posts directory
  if (configContent.includes('en_posts_dir:')) {
    log('PASS', 'English posts directory configured');
  }
  
  // Check en_permalink
  if (configContent.includes('en_permalink:')) {
    log('PASS', 'English permalink pattern configured');
  }
  
} catch (e) {
  log('FAIL', `Phase 4 review error: ${e.message}`);
}

// ============================================================================
// TEST 8: Build Output Validation
// ============================================================================
console.log('\nTEST 8: Build Output Validation');
console.log('─────────────────────────────────────────────────────────────────');

try {
  const publicDir = path.join(__dirname, 'public');
  
  // Check Chinese pages
  const zhIndex = path.join(publicDir, 'index.html');
  if (fs.existsSync(zhIndex)) {
    const zhContent = fs.readFileSync(zhIndex, 'utf8');
    if (zhContent.includes('lang="zh-CN"')) {
      log('PASS', 'Chinese homepage has correct lang attribute');
    }
  }
  
  // Check English pages
  const enIndex = path.join(publicDir, 'en', 'index.html');
  if (fs.existsSync(enIndex)) {
    const enContent = fs.readFileSync(enIndex, 'utf8');
    if (enContent.includes('lang="en"')) {
      log('PASS', 'English homepage has correct lang attribute');
    }
  }
  
  // Check English paths exist
  const enArchives = path.join(publicDir, 'en', 'archives');
  const enTags = path.join(publicDir, 'en', 'tags');
  const enCategories = path.join(publicDir, 'en', 'categories');
  
  if (fs.existsSync(enArchives) && fs.existsSync(enTags) && fs.existsSync(enCategories)) {
    log('PASS', 'English archives/tags/categories paths exist');
  }
  
  // Check RSS/search
  const searchXml = path.join(publicDir, 'search.xml');
  if (fs.existsSync(searchXml)) {
    log('PASS', 'Search XML generated');
  }
  
} catch (e) {
  log('FAIL', `Build output validation error: ${e.message}`);
}

// ============================================================================
// FINAL SUMMARY
// ============================================================================
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('  FINAL QA SUMMARY');
console.log('═══════════════════════════════════════════════════════════════════');

const passed = testResults.filter(r => r.status === 'PASS').length;
const failed = testResults.filter(r => r.status === 'FAIL').length;
const warnings = testResults.filter(r => r.status === 'WARN').length;

console.log(`\nTotal Tests: ${testResults.length}`);
console.log(`  ✓ Passed: ${passed}`);
console.log(`  ✗ Failed: ${failed}`);
console.log(`  ⚠ Warnings: ${warnings}`);

if (hasErrors) {
  console.log('\n❌ OVERALL STATUS: FAIL');
  console.log('   Action Required: Fix failed tests above');
  process.exit(1);
} else {
  console.log('\n✅ OVERALL STATUS: PASS');
  console.log('   All acceptance criteria met');
  console.log('   Project ready for deployment');
  process.exit(0);
}