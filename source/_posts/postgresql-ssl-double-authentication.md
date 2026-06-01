---
title: PostgreSQL 数据库配置 SSL 双向认证，并通过 Spring 访问
date: 2026-03-16 18:00:00
updated: 2026-03-16 18:00:00
lang: zh-CN
slug: postgresql-ssl-double-authentication
categories:
  - 数据库
tags:
  - PostgreSQL
  - SSL
  - Spring Boot
  - 双向认证
description: 详细配置 PostgreSQL 数据库 SSL 双向认证并通过 Spring Boot 应用访问的指南
keywords: PostgreSQL,SSL,双向认证,Spring Boot,数据库安全
---

## 生成证书

### 1. 服务器端生成三个文件

- `root.crt` (可信根证书)
- `server.crt` (服务器证书)
- `server.key` (私钥)

<!-- more -->

#### 生成私钥（需要设置密码）

```bash
openssl genrsa -des3 -out server.key 2048
```

#### 移除密码（需要输入上一步设置的密码）

```bash
openssl rsa -in server.key -out server.key
```

#### 创建服务器证书

```bash
openssl req -new -key server.key -days 3650 -out server.crt -x509
```

执行过程中需要输入以下信息：

```
Country Name (2 letter code) [AU]:CN
State or Province Name (full name) [Some-State]:Beijing
Locality Name (eg, city) []:Beijing
Organization Name (eg, company) [Internet Widgits Pty Ltd]:cuckooM
Organizational Unit Name (eg, section) []:cuckooM
Common Name (e.g. server FQDN or YOUR name) []:127.0.0.1
Email Address []:
```

> 注意："Common Name" 应该写为服务器的 IP 地址或域名。

#### 由于是自签名，服务器证书可作为可信根证书

```bash
cp server.crt root.crt
```

---

### 2. 客户端生成三个文件

- `root.crt` (可信根证书，已在服务器端生成)
- `client.crt` (客户端证书)
- `client.key` (私钥)

#### 生成私钥（需要设置密码）

```bash
openssl genrsa -des3 -out client.key 2048
```

#### 移除密码（需要输入上一步设置的密码）

```bash
openssl rsa -in client.key -out client.key
```

#### 创建客户端证书

```bash
openssl req -new -key client.key -out client.csr
```

执行过程中需要输入以下信息：

```
Country Name (2 letter code) [AU]:CN
State or Province Name (full name) [Some-State]:Beijing
Locality Name (eg, city) []:Beijing
Organization Name (eg, company) [Internet Widgits Pty Ltd]:cuckooM
Organizational Unit Name (eg, section) []:cuckooM
Common Name (e.g. server FQDN or YOUR name) []:blog
Email Address []:
```

> 注意："Common Name" 应该设置为要连接的数据库用户名。

#### 转换格式。将 PEM 格式的密钥转换为 DER 格式。

```bash
openssl pkcs8 -topk8 -inform PEM -in client.key -outform DER -nocrypt -out client.pk8
```

---

### 3. 文件总结

完成上述步骤后，我们为服务器和客户端生成了以下文件：

- `client.crt`
- `client.csr`
- `client.key`
- `client.pk8`
- `root.crt`
- `server.crt`
- `server.key`

---

## 服务器配置

### 1. pg_hba.conf

添加以下内容：

```
hostssl   all             all             0.0.0.0/0               cert
hostssl   all             all             ::1/128                 cert
```

### 2. postgresql.conf

修改以下配置：

```
ssl = on
ssl_ca_file = '/etc/postgresql/certs/root.crt'
ssl_cert_file = '/etc/postgresql/certs/server.crt'
ssl_key_file = '/etc/postgresql/certs/server.key'
```

---

## 客户端配置

### Spring Boot application.yml

```yaml
spring:
  datasource:
    driver-class-name: org.postgresql.Driver
    url: jdbc:postgresql://127.0.0.1:5432/blog?ssl=true&sslmode=verify-ca&sslcert=D:\\certs\\client.crt&sslkey=D:\\certs\\client.pk8&sslrootcert=D:\\certs\\root.crt
    username: blog
    password: blog
```

---

## 验证配置

连接成功后，可以使用以下 SQL 验证 SSL 连接：

```sql
SELECT * FROM pg_stat_ssl;
```

如果连接使用了 SSL，将显示相应的 SSL 信息。
