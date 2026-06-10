---
title: PostgreSQLデータベースSSL双方向認証設定とSpringアクセス
date: 2026-03-16 18:00:00
updated: 2026-03-16 18:00:00
lang: ja
slug: ja-postgresql-ssl-double-authentication
categories:
  - データベース
tags:
  - PostgreSQL
  - SSL
  - Spring Boot
  - 双方向認証
description: PostgreSQLデータベースSSL双方向認証の詳細設定とSpring Bootアプリケーションからのアクセスガイド
keywords: PostgreSQL,SSL,双方向認証,Spring Boot,データベースセキュリティ
---

## 証明書の生成

### 1. サーバー側で3つのファイルを生成

- `root.crt` (信頼ルート証明書)
- `server.crt` (サーバー証明書)
- `server.key` (秘密鍵)

<!-- more -->

#### 秘密鍵の生成（パスワード設定必要）

```bash
openssl genrsa -des3 -out server.key 2048
```

#### パスワードの削除（前のステップで設定したパスワードを入力）

```bash
openssl rsa -in server.key -out server.key
```

#### サーバー証明書の作成

```bash
openssl req -new -key server.key -days 3650 -out server.crt -x509
```

実行時に以下の情報を入力：

```
Country Name (2 letter code) [AU]:JP
State or Province Name (full name) [Some-State]:Tokyo
Locality Name (eg, city) []:Tokyo
Organization Name (eg, company) [Internet Widgits Pty Ltd]:cuckooM
Organizational Unit Name (eg, section) []:cuckooM
Common Name (e.g. server FQDN or YOUR name) []:127.0.0.1
Email Address []:
```

> 注意："Common Name"にはサーバーのIPアドレスまたはドメイン名を記入。

#### 自己署名のため、サーバー証明書を信頼ルート証明書として使用

```bash
cp server.crt root.crt
```

---

### 2. クライアント側で3つのファイルを生成

- `root.crt` (信頼ルート証明書、サーバー側で生成済み)
- `client.crt` (クライアント証明書)
- `client.key` (秘密鍵)

#### 秘密鍵の生成（パスワード設定必要）

```bash
openssl genrsa -des3 -out client.key 2048
```

#### パスワードの削除（前のステップで設定したパスワードを入力）

```bash
openssl rsa -in client.key -out client.key
```

#### クライアント証明書の作成

```bash
openssl req -new -key client.key -out client.csr
```

---

## PostgreSQL設定

### postgresql.confの編集

```bash
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
ssl_ca_file = 'root.crt'
```

### pg_hba.confの編集

```bash
hostssl all all 0.0.0.0/0 cert
```

---

## Spring Boot接続設定

### application.yml

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb?ssl=true&sslmode=verify-full
    username: blog
    password: password
```

### SSL証明書の配置

クライアント証明書をJava KeyStoreに変換：

```bash
openssl pkcs12 -export -out client.p12 -inkey client.key -in client.crt -certfile root.crt
keytool -importkeystore -destkeystore client.jks -srckeystore client.p12 -srcstoretype pkcs12
```

---

## 参考資料

- [PostgreSQL SSL Documentation](https://www.postgresql.org/docs/current/ssl-tcp.html)
- [Spring Boot SSL Configuration](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#data.sql.datasource)