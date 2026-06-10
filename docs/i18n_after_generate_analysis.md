# Hexo after_generate Filter 方案技术可行性分析

## 一、Hexo 生成流程分析

### 1.1 核心调用链

```
hexo generate 命令
  └── generateConsole() (plugins/console/generate.js)
        └── this.load() (hexo/index.js)
              ├── source.process() - 处理源文件
              ├── theme.process() - 处理主题
              └── _generate() - 生成路由
                    ├── emit('generateBefore')
                    ├── execFilter('before_generate')  ← 在此无法改变 generator 输出路径
                    ├── _runGenerators() - 运行所有 generators
                    ├── _routerRefresh() - 填充路由表
                    ├── emit('generateAfter')
                    └── execFilter('after_generate')   ← ★ 在此可以修改路由表
        └── generator.firstGenerate() - 将路由表写入文件系统
              └── route.list() → 读取路由表
              └── generateFile() → 写入文件
```

### 1.2 关键代码分析

**路由系统 (router.js)**:
```javascript
class Router {
  routes = {}  // 路由表存储
  
  set(path, data)    // 添加/更新路由
  remove(path)       // 删除路由
  get(path)          // 获取路由数据 (返回 RouteStream)
  list()             // 列出所有路由路径
}
```

**生成流程 (_generate 方法)**:
```javascript
_generate(options = {}) {
  // ...
  return this.execFilter('before_generate', null, { context: this })
    .then(() => this._routerRefresh(this._runGenerators(), useCache))
    .then(() => {
      this.emit('generateAfter');
      // ★ after_generate 在此执行，路由表已填充
      return this.execFilter('after_generate', null, { context: this });
    })
    .finally(() => {
      this._isGenerating = false;
    });
}
```

**文件写入 (firstGenerate)**:
```javascript
firstGenerate() {
  const routeList = route.list();  // 读取路由表
  // 写入文件到 public 目录
  routeList.map(path => this.generateFile(path))
}
```

## 二、after_generate 方案可行性

### 2.1 核心结论

**✅ 技术可行**：`after_generate` filter 可以修改路由表，且修改后的路由会在文件写入阶段生效。

### 2.2 可用的 API

在 `after_generate` filter 中，可以通过 `this` 或传入的 context 访问：

| API | 用途 |
|-----|------|
| `hexo.route.list()` | 获取所有路由路径 |
| `hexo.route.get(path)` | 获取路由数据（返回 Promise/Stream） |
| `hexo.route.set(path, data)` | 添加/更新路由 |
| `hexo.route.remove(path)` | 删除路由 |
| `hexo.log` | 日志输出 |

### 2.3 数据读取注意事项

`route.get(path)` 返回的是 `RouteStream`（Readable Stream），需要特殊处理：

```javascript
hexo.route.get(path)  // 返回 RouteStream (Readable)
  .on('data', chunk => { ... })
  .on('end', () => { ... })
```

或者将数据收集后使用：
```javascript
const stream = hexo.route.get(path);
const chunks = [];
await new Promise((resolve, reject) => {
  stream.on('data', chunk => chunks.push(chunk));
  stream.on('end', resolve);
  stream.on('error', reject);
});
const content = Buffer.concat(chunks);
```

## 三、方案设计

### 3.1 方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **方案A: after_generate 路由重写** | 不覆盖 generator，符合 Hexo 最佳实践 | 需要处理流数据，复杂度略高 |
| **方案B: 覆盖 generator（当前）** | 简单直接 | 需要复制 Hexo 内部逻辑，维护成本高 |

### 3.2 推荐方案：after_generate Filter

```javascript
// scripts/i18n_route_filter.js

hexo.extend.filter.register('after_generate', async function() {
  const log = this.log;
  const route = this.route;
  
  // 配置
  const defaultLang = 'zh-CN';
  const targetLang = 'en';
  
  // 获取所有路由
  const routeList = route.list();
  
  // 找出需要移动的英文文章
  const enRoutes = routeList.filter(path => {
    // 匹配文章路径（排除已经带 en/ 前缀的）
    // 例如: 2026/06/03/some-post/index.html
    return !path.startsWith('en/') && 
           /^\d{4}\/\d{2}\/\d{2}\//.test(path);
  });
  
  // 需要关联处理的路径组（文章可能有多个资源）
  // 文章主文件: post-slug/index.html
  // 文章资源: post-slug/images/xxx.jpg 等
  
  for (const path of enRoutes) {
    // 1. 读取原始数据
    const stream = route.get(path);
    const chunks = [];
    await new Promise((resolve, reject) => {
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const content = Buffer.concat(chunks);
    
    // 2. 判断是否为英文文章（需要额外信息源）
    // 方案：通过路径关联 Post 数据库记录
    // ...
    
    // 3. 设置新路径
    const newPath = `en/${path}`;
    route.set(newPath, content);
    
    // 4. 删除旧路径
    route.remove(path);
    
    log.debug(`Moved: ${path} -> ${newPath}`);
  }
});
```

### 3.3 增强方案：结合 Post 数据判断语言

```javascript
hexo.extend.filter.register('after_generate', async function() {
  const route = this.route;
  const posts = this.locals.get('posts');
  
  // 构建路径到文章的映射
  const postByPath = new Map();
  posts.forEach(post => {
    postByPath.set(post.path, post);
  });
  
  // 处理路由
  for (const path of route.list()) {
    // 查找对应的文章
    const post = postByPath.get(path);
    
    if (post && post.lang === 'en') {
      // 读取内容
      const stream = route.get(path);
      const content = await streamToBuffer(stream);
      
      // 移动到 en/ 路径
      const newPath = `en/${path}`;
      route.set(newPath, content);
      route.remove(path);
    }
  }
});

// 辅助函数
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
```

## 四、风险评估

### 4.1 技术风险

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 流数据处理复杂性 | 中 | 封装 streamToBuffer 工具函数 |
| 资源文件关联（图片等） | 高 | 需要同时移动同目录下的所有资源 |
| hexo server 热更新 | 中 | 测试 watch 模式下的行为 |
| 第三方插件兼容性 | 低 | 大多数插件不操作路由表 |

### 4.2 复杂度评估

| 维度 | 覆盖 generator 方案 | after_generate 方案 |
|------|---------------------|---------------------|
| 代码行数 | ~150 行 | ~80 行 |
| 依赖 Hexo 内部 API | 高 | 低 |
| 维护成本 | 高（需跟踪 Hexo 更新） | 低 |
| 功能完整性 | 完全控制 | 满足需求 |

### 4.3 边界情况

1. **文章资源文件**：需要同时移动 `post-slug/` 下的所有文件
2. **分页和归档**：这些由 hexo-generator-archive 等处理，需要单独配置
3. **内部链接**：需要配合 helper 函数生成正确的 URL

## 五、实现步骤

### 5.1 第一阶段：基础实现

1. 创建 `scripts/i18n_route_filter.js`
2. 实现 `after_generate` filter
3. 实现流到 Buffer 的转换
4. 实现基于 `locals.get('posts')` 的语言判断

### 5.2 第二阶段：完善功能

1. 处理文章资源文件（同目录移动）
2. 配合 `url_for` helper 生成正确链接
3. 处理分页和归档页面

### 5.3 第三阶段：测试验证

1. 单元测试
2. hexo server 模式测试
3. hexo generate 模式测试
4. 部署验证

## 六、结论

**after_generate Filter 方案技术可行**，相比覆盖 generator 方案：

1. **更符合 Hexo 最佳实践**：通过扩展点而非覆盖实现功能
2. **更低的维护成本**：不依赖 Hexo 内部实现细节
3. **更清晰的职责分离**：generator 负责生成，filter 负责后处理

建议采用此方案重构现有多语言实现。