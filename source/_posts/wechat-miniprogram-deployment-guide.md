---
title: 微信小程序完整部署指南：从服务器搭建到发布上线
date: 2026-06-22 10:00:00
tags:
  - 微信小程序
  - 部署
  - SpringBoot
  - PostgreSQL
  - Nginx
categories:
  - 技术教程
---

微信小程序开发完成后，如何部署上线是许多开发者面临的第一个挑战。本文将详细介绍一个典型的微信小程序项目（前端 + SpringBoot 后端 + PostgreSQL 数据库）从服务器环境准备到最终发布上线的完整流程。

## 项目架构

本文以 `miniprogram-demo` 项目为例，项目结构如下：

```
miniprogram-demo/
├── miniprogram/        # 微信小程序前端
│   ├── app.js          # 小程序入口
│   ├── app.json        # 小程序配置
│   ├── pages/          # 页面目录
│   └── utils/          # 工具类
├── backend/            # SpringBoot 后端
│   ├── src/
│   └── pom.xml
└── docs/
    └── sql/            # 数据库初始化脚本
```

**技术栈**：
- 前端：微信小程序原生开发
- 后端：SpringBoot 2.7 + MyBatis-Plus
- 数据库：PostgreSQL
- 部署：Nginx + HTTPS

## 第一部分：服务器环境准备

### 1. 确认服务器配置

部署微信小程序需要以下环境：
- **Java 11+**（推荐 JDK 17）
- **PostgreSQL 12+**
- **Nginx**（用于反向代理和 HTTPS）
- **已备案的域名**（微信强制要求）

检查已安装的组件：
```bash
java -version
psql --version
nginx -v
```

### 2. 安装缺失组件

**Ubuntu/Debian 系统**：
```bash
sudo apt update
sudo apt install openjdk-17-jdk postgresql nginx -y
```

**CentOS/RHEL 系统**：
```bash
sudo yum install java-17-openjdk postgresql-server nginx -y
```

## 第二部分：数据库初始化

### 3. 创建数据库和用户

登录 PostgreSQL：
```bash
sudo -u postgres psql
```

执行以下 SQL 命令：
```sql
-- 创建数据库用户
CREATE USER demo WITH PASSWORD 'your_secure_password';

-- 创建数据库
CREATE DATABASE demo_db OWNER demo;

-- 授权
GRANT ALL PRIVILEGES ON DATABASE demo_db TO demo;

-- 退出
\q
```

### 4. 初始化数据库表结构

项目使用了 Liquibase 进行数据库版本管理，启动应用时会自动创建表结构。如果需要手动初始化：

```bash
psql -U demo -d demo_db -f docs/sql/init.sql
```

## 第三部分：后端部署

### 5. 配置生产环境

**重要提示**：生产环境的配置文件不要提交到 Git，避免泄露敏感信息。

在服务器上创建配置目录：
```bash
mkdir -p /opt/demo/config
```

创建生产环境配置文件 `/opt/demo/config/application.yml`：

```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/demo_db
    username: demo
    password: your_secure_password
    driver-class-name: org.postgresql.Driver
    hikari:
      minimum-idle: 5
      maximum-pool-size: 10
      connection-timeout: 30000
  liquibase:
    enabled: true
    change-log: classpath:db/changelog-master.xml
    drop-first: false

mybatis-plus:
  mapper-locations: classpath*:/mapper/**/*.xml
  type-aliases-package: com.demo.entity

wechat:
  appid: your_wechat_appid
  secret: your_wechat_secret
  code2session-url: https://api.weixin.qq.com/sns/jscode2session

jwt:
  secret: generate_a_complex_random_secret_key_here
  expiration: 604800000  # 7天

logging:
  level:
    com.demo: info
```

**关键配置项说明**：
- `wechat.appid` 和 `wechat.secret`：在微信小程序后台获取
- `jwt.secret`：生成一个复杂的随机密钥
- 生产环境日志级别改为 `info`，去掉调试输出

### 6. 编译打包

在本地开发环境编译：
```bash
cd backend
mvn clean package -DskipTests
```

打包完成后，JAR 文件位于：`backend/target/miniprogram-demo-1.0.0-SNAPSHOT.jar`

### 7. 上传到服务器

使用 `scp` 命令上传文件：
```bash
# 上传 JAR 包
scp backend/target/miniprogram-demo-1.0.0-SNAPSHOT.jar user@server:/opt/demo/

# 上传配置文件
scp /opt/demo/config/application.yml user@server:/opt/demo/config/
```

### 8. 创建系统服务（推荐）

为了让后端服务开机自启并支持崩溃自动重启，创建 systemd 服务：

```bash
sudo vim /etc/systemd/system/demo.service
```

写入以下内容：
```ini
[Unit]
Description=Demo Backend Service
After=postgresql.service

[Service]
User=your_user
WorkingDirectory=/opt/demo
ExecStart=/usr/bin/java -jar /opt/demo/miniprogram-demo-1.0.0-SNAPSHOT.jar --spring.config.location=/opt/demo/config/application.yml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable demo          # 开机自启
sudo systemctl start demo           # 启动服务
sudo systemctl status demo          # 查看状态
```

常用管理命令：
```bash
sudo systemctl stop demo            # 停止服务
sudo systemctl restart demo         # 重启服务
journalctl -u demo -f              # 查看实时日志
```

## 第四部分：配置 HTTPS

微信小程序强制要求后端接口必须使用 HTTPS，这一步至关重要。

### 9. 申请 SSL 证书

**方式一：使用 Let's Encrypt（免费，推荐）**

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 申请证书并自动配置 Nginx
sudo certbot --nginx -d your-domain.com
```

**方式二：使用已有证书**

如果已有 SSL 证书，将其放到服务器指定位置：
```bash
sudo mkdir -p /etc/ssl/certs
sudo mkdir -p /etc/ssl/private
# 将证书文件复制到上述目录
```

### 10. 配置 Nginx 反向代理

创建 Nginx 配置文件：
```bash
sudo vim /etc/nginx/sites-available/demo
```

写入以下内容：
```nginx
# HTTPS 配置
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL 优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

启用配置并重启 Nginx：
```bash
sudo ln -s /etc/nginx/sites-available/demo /etc/nginx/sites-enabled/
sudo nginx -t          # 测试配置是否正确
sudo systemctl reload nginx
```

### 11. 验证后端接口

```bash
curl https://your-domain.com/api/user/profile
```

应该返回 JSON 响应（未登录会返回错误码，说明后端正常运行）。

## 第五部分：微信小程序配置

### 12. 修改小程序后端地址

编辑 `miniprogram/app.js`，将 `baseUrl` 改为生产环境域名：

```javascript
App({
  globalData: {
    baseUrl: 'https://your-domain.com',  // 改为 HTTPS 域名
    token: '',
    userInfo: null
  },
  // ... 其他代码
});
```

**注意**：小程序正式环境必须使用 HTTPS，不能使用 HTTP 或 IP 地址。

### 13. 配置服务器域名

登录 [微信公众平台](https://mp.weixin.qq.com)，进入：
- **开发管理** → **开发设置** → **服务器域名**
- 在 **request 合法域名** 中添加：`https://your-domain.com`

**重要提示**：
- 域名必须已完成 ICP 备案
- 域名必须支持 HTTPS
- 配置后需要等待几分钟生效

### 14. 获取微信小程序 AppID 和 Secret

在微信公众平台：
- **开发管理** → **开发设置** → **开发者ID**
- 复制 AppID 和 AppSecret（Secret 只显示一次，务必保存）

将这两个值填入后端配置文件：
```yaml
wechat:
  appid: wx1234567890abcdef
  secret: your_appsecret_here
```

然后重启后端服务：
```bash
sudo systemctl restart demo
```

## 第六部分：小程序发布

### 15. 使用微信开发者工具上传

1. **打开微信开发者工具**
   - 下载地址：[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)

2. **导入项目**
   - 选择 `miniprogram/` 目录
   - 填入正确的 AppID

3. **本地测试**
   - 点击「编译」按钮
   - 在模拟器中测试所有功能
   - 使用「真机调试」在手机上测试

4. **上传代码**
   - 点击右上角「上传」按钮
   - 填写版本号（如 1.0.0）
   - 填写版本说明

### 16. 提交审核并发布

登录微信公众平台：
1. 进入 **版本管理**
2. 找到刚上传的「开发版本」
3. 点击「提交审核」
4. 填写审核说明（功能介绍、测试账号等）
5. 等待审核（通常 1-3 个工作日）
6. 审核通过后，点击「发布」

## 第七部分：验证清单

发布前请逐项检查：

- [ ] PostgreSQL 正常运行，数据库可连接
- [ ] 后端服务启动正常（`systemctl status demo`）
- [ ] HTTPS 可访问（`curl https://your-domain.com/`）
- [ ] 微信后台已配置合法域名
- [ ] 小程序 `baseUrl` 已改为 HTTPS 域名
- [ ] AppID 和 Secret 已正确填写
- [ ] 本地测试功能正常
- [ ] 真机测试功能正常
- [ ] 小程序已上传、审核通过并发布

## 常见问题解答

### Q1: 小程序真机调试报 "不在以下 request 合法域名列表中"

**解决方法**：
登录微信公众平台 → 开发管理 → 开发设置 → 服务器域名，添加你的域名。配置后需要等待几分钟生效。

### Q2: 后端启动报数据库连接失败

**排查步骤**：
1. 检查 PostgreSQL 是否运行：`sudo systemctl status postgresql`
2. 检查数据库用户名密码是否正确
3. 检查数据库是否已创建：`psql -U postgres -l | grep demo_db`
4. 检查数据库连接 URL 是否正确

### Q3: 小程序调用 wx.getUserProfile 报错

**原因**：该接口在 2022 年后已被废弃。

**解决方法**：改用「头像昵称填写组件」，参考 [微信官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html)。

### Q4: 域名没有备案

**解决方案**：
1. 通过域名服务商提交备案申请
2. 备案审核通常需要 7-20 个工作日
3. 备案期间可以先使用测试号进行开发调试

### Q5: 服务器内存不足（2GB 小型服务器）

**优化建议**：
- PostgreSQL + Java 大约需要 800MB-1.2GB 内存
- 配置 Swap 空间防止 OOM：
  ```bash
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- 调整 JVM 内存参数：在启动命令中添加 `-Xmx512m -Xms256m`

### Q6: HTTPS 证书过期

**解决方法**：
Let's Encrypt 证书有效期为 90 天，需要定期续期：
```bash
sudo certbot renew --dry-run  # 测试续期
sudo certbot renew            # 实际续期
```

建议设置定时任务自动续期：
```bash
sudo crontab -e
# 添加以下行（每天凌晨 3 点检查续期）
0 3 * * * certbot renew --quiet && systemctl reload nginx
```

## 总结

微信小程序的部署涉及多个环节：服务器环境搭建、数据库配置、后端部署、HTTPS 配置、小程序配置和最终发布。整个流程看似复杂，但只要按步骤逐一完成，就能顺利上线。

**关键要点**：
1. 域名必须已备案且支持 HTTPS
2. 生产环境配置要独立管理，不要提交到 Git
3. 使用 systemd 管理服务，实现开机自启和崩溃重启
4. 小程序发布前务必进行充分的真机测试
5. 定期续期 SSL 证书，确保服务稳定

希望本文能帮助你顺利完成微信小程序的部署上线！如果遇到问题，欢迎在评论区交流讨论。

---

**相关文章推荐**：
- [Spring Security 方法级权限控制详解](/springsecurity-method-security/)
- [PostgreSQL 外部表性能优化指南](/postgresql-foreign-table-performance/)
- [MAT JVM 内存分析工具使用教程](/mat-jvm-memory-analysis-tool/)
