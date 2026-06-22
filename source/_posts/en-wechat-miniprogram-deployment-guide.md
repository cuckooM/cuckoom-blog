---
title: "Complete Guide to Deploying WeChat Mini Program: From Server Setup to Launch"
date: 2026-06-22 10:00:00
tags:
  - WeChat Mini Program
  - Deployment
  - SpringBoot
  - PostgreSQL
  - Nginx
categories:
  - Tutorial
lang: en
---

After developing a WeChat Mini Program, how to deploy it is the first challenge many developers face. This article provides a detailed walkthrough of deploying a typical WeChat Mini Program project (frontend + SpringBoot backend + PostgreSQL database) from server environment preparation to final launch.

## Project Architecture

This article uses the `miniprogram-demo` project as an example, with the following structure:

```
miniprogram-demo/
├── miniprogram/        # WeChat Mini Program Frontend
│   ├── app.js          # Entry point
│   ├── app.json        # Configuration
│   ├── pages/          # Pages
│   └── utils/          # Utilities
├── backend/            # SpringBoot Backend
│   ├── src/
│   └── pom.xml
└── docs/
    └── sql/            # Database initialization scripts
```

**Tech Stack**:
- Frontend: Native WeChat Mini Program
- Backend: SpringBoot 2.7 + MyBatis-Plus
- Database: PostgreSQL
- Deployment: Nginx + HTTPS

## Part 1: Server Environment Preparation

### 1. Verify Server Requirements

Deploying a WeChat Mini Program requires:
- **Java 11+** (JDK 17 recommended)
- **PostgreSQL 12+**
- **Nginx** (for reverse proxy and HTTPS)
- **A domain with ICP filing** (mandatory by WeChat)

Check installed components:
```bash
java -version
psql --version
nginx -v
```

### 2. Install Missing Components

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install openjdk-17-jdk postgresql nginx -y
```

**CentOS/RHEL**:
```bash
sudo yum install java-17-openjdk postgresql-server nginx -y
```

## Part 2: Database Initialization

### 3. Create Database and User

Log into PostgreSQL:
```bash
sudo -u postgres psql
```

Execute the following SQL:
```sql
CREATE USER demo WITH PASSWORD 'your_secure_password';
CREATE DATABASE demo_db OWNER demo;
GRANT ALL PRIVILEGES ON DATABASE demo_db TO demo;
\q
```

### 4. Initialize Database Schema

The project uses Liquibase for database version management. Tables are created automatically on startup. For manual initialization:

```bash
psql -U demo -d demo_db -f docs/sql/init.sql
```

## Part 3: Backend Deployment

### 5. Production Configuration

**Important**: Never commit production config files to Git to avoid leaking sensitive information.

Create config directory on server:
```bash
mkdir -p /opt/demo/config
```

Create production config `/opt/demo/config/application.yml`:

```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/demo_db
    username: demo
    password: your_actual_password
    driver-class-name: org.postgresql.Driver

wechat:
  appid: your_appid
  secret: your_appsecret
  code2session-url: https://api.weixin.qq.com/sns/jscode2session

jwt:
  secret: your_complex_random_secret_key
  expiration: 604800000

logging:
  level:
    com.checkin: info
```

### 6. Build JAR Package

```bash
cd ~/work/code/miniprogram-demo/backend
mvn clean package -DskipTests
```

Output: `backend/target/miniprogram-demo-1.0.0-SNAPSHOT.jar`

### 7. Upload to Server

```bash
scp backend/target/miniprogram-demo-1.0.0-SNAPSHOT.jar user@server:/opt/demo/
scp /opt/demo/config/application.yml user@server:/opt/demo/config/
```

### 8. Create Systemd Service (Recommended)

```bash
sudo vim /etc/systemd/system/demo.service
```

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

Start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable demo
sudo systemctl start demo
sudo systemctl status demo
```

## Part 4: HTTPS Configuration

WeChat Mini Programs require HTTPS for all backend APIs.

### 9. Obtain SSL Certificate

**Option 1: Let's Encrypt (Free, Recommended)**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 10. Configure Nginx Reverse Proxy

```bash
sudo vim /etc/nginx/sites-available/demo
```

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/demo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Part 5: WeChat Mini Program Configuration

### 12. Update Backend URL

Edit `miniprogram/app.js`:
```javascript
globalData: {
  baseUrl: 'https://your-domain.com',  // Use HTTPS
  token: '',
  userInfo: null
}
```

### 13. Configure Server Domains

Log into [WeChat Official Platform](https://mp.weixin.qq.com):
- **Development Management** → **Development Settings** → **Server Domains**
- Add `https://your-domain.com` to **Valid request domains**

**Requirements**:
- Domain must have ICP filing
- Domain must support HTTPS

### 14. Get AppID and Secret

In WeChat Official Platform:
- **Development Management** → **Development Settings** → **Developer ID**
- Copy AppID and AppSecret

Add them to backend config:
```yaml
wechat:
  appid: wx1234567890abcdef
  secret: your_appsecret_here
```

Restart backend:
```bash
sudo systemctl restart demo
```

## Part 6: Publish Mini Program

### 15. Upload via Developer Tools

1. Open **WeChat Developer Tools**
2. Import the `miniprogram/` directory
3. Enter the correct AppID
4. Test all features
5. Click **Upload** button
6. Fill in version number and description

### 16. Submit for Review

1. Log into WeChat Official Platform
2. Go to **Version Management**
3. Find the uploaded development version
4. Click **Submit for Review**
5. Wait 1-3 business days
6. After approval, click **Publish**

## Part 7: Verification Checklist

- [ ] PostgreSQL running, database accessible
- [ ] Backend service running (`systemctl status demo`)
- [ ] HTTPS accessible (`curl https://your-domain.com/`)
- [ ] Server domains configured in WeChat backend
- [ ] Mini program `baseUrl` set to HTTPS domain
- [ ] AppID and Secret correctly configured
- [ ] Local testing passed
- [ ] Real device testing passed
- [ ] Mini program uploaded, reviewed, and published

## FAQ

### Q1: "Not in valid request domain list" error

**Solution**: Add your domain in WeChat Official Platform → Development Settings → Server Domains.

### Q2: Database connection failure on startup

**Troubleshooting**:
1. Check PostgreSQL status: `sudo systemctl status postgresql`
2. Verify username/password
3. Verify database exists: `psql -U postgres -l | grep demo_db`

### Q3: wx.getUserProfile deprecated

**Solution**: Use the profile filling component instead. See [WeChat docs](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html).

### Q4: Low server memory (2GB instance)

**Tips**:
- PostgreSQL + Java need ~800MB-1.2GB
- Configure Swap: `sudo fallocate -l 2G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
- Set JVM params: `-Xmx512m -Xms256m`

## Summary

Deploying a WeChat Mini Program involves multiple steps: server setup, database config, backend deployment, HTTPS, Mini Program config, and final release. Follow the steps carefully and you'll be live.

**Key Points**:
1. Domain must be ICP-filed and support HTTPS
2. Keep production config separate from Git
3. Use systemd for auto-restart
4. Test thoroughly on real devices
5. Renew SSL certificates regularly
