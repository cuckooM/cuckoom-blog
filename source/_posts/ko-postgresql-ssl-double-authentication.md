---
title: PostgreSQL 데이터베이스 SSL 양방향 인증 구성 및 Spring 연결
date: 2026-03-16 18:00:00
updated: 2026-03-16 18:00:00
lang: ko
slug: postgresql-ssl-double-authentication
categories:
  - 데이터베이스
tags:
  - PostgreSQL
  - SSL
  - Spring Boot
  - 양방향 인증
description: PostgreSQL 데이터베이스 SSL 양방향 인증 구성 및 Spring Boot 애플리케이션 연결 가이드
keywords: PostgreSQL,SSL,양방향 인증,Spring Boot,데이터베이스 보안
---

## 인증서 생성

### 1. 서버 측 세 개 파일 생성

- `root.crt` (신뢰할 수 있는 루트 인증서)
- `server.crt` (서버 인증서)
- `server.key` (개인 키)

<!-- more -->

#### 개인 키 생성 (비밀번호 설정 필요)

```bash
openssl genrsa -des3 -out server.key 2048
```

#### 비밀번호 제거 (이전 단계에서 설정한 비밀번호 입력 필요)

```bash
openssl rsa -in server.key -out server.key
```

#### 서버 인증서 생성

```bash
openssl req -new -key server.key -days 3650 -out server.crt -x509
```

실행 과정에서 다음 정보 입력:

```
Country Name (2 letter code) [AU]:CN
State or Province Name (full name) [Some-State]:Beijing
Locality Name (eg, city) []:Beijing
Organization Name (eg, company) [Internet Widgits Pty Ltd]:cuckooM
Organizational Unit Name (eg, section) []:cuckooM
Common Name (e.g. server FQDN or YOUR name) []:127.0.0.1
Email Address []:
```

> 주의: "Common Name"은 서버의 IP 주소 또는 도메인 이름으로 입력해야 합니다.

#### 자체 서명이므로 서버 인증서를 신뢰할 수 있는 루트 인증서로 사용

```bash
cp server.crt root.crt
```

---

### 2. 클라이언트 세 개 파일 생성

- `root.crt` (신뢰할 수 있는 루트 인증서, 서버 측에서 이미 생성)
- `client.crt` (클라이언트 인증서)
- `client.key` (개인 키)

#### 개인 키 생성 (비밀번호 설정 필요)

```bash
openssl genrsa -des3 -out client.key 2048
```

#### 비밀번호 제거 (이전 단계에서 설정한 비밀번호 입력 필요)

```bash
openssl rsa -in client.key -out client.key
```

#### 클라이언트 인증서 생성

```bash
openssl req -new -key client.key -out client.csr
```

실행 과정에서 다음 정보 입력:

```
Country Name (2 letter code) [AU]:CN
State or Province Name (full name) [Some-State]:Beijing
Locality Name (eg, city) []:Beijing
Organization Name (eg, company) [Internet Widgits Pty Ltd]:cuckooM
Organizational Unit Name (eg, section) []:cuckooM
Common Name (e.g. server FQDN or YOUR name) []:blog
Email Address []:
```

> 주의: "Common Name"은 연결할 데이터베이스 사용자 이름으로 설정해야 합니다.

#### 형식 변환. PEM 형식 키를 DER 형식으로 변환.

```bash
openssl pkcs8 -topk8 -inform PEM -in client.key -outform DER -nocrypt -out client.pk8
```

---

### 3. 파일 요약

위 단계 완료 후 서버와 클라이언트에 대해 다음 파일을 생성했습니다:

- `client.crt`
- `client.csr`
- `client.key`
- `client.pk8`
- `root.crt`
- `server.crt`
- `server.key`

---

## 서버 구성

### 1. pg_hba.conf

다음 내용 추가:

```
hostssl   all             all             0.0.0.0/0               cert
hostssl   all             all             ::1/128                 cert
```

### 2. postgresql.conf

다음 구성 수정:

```
ssl = on
ssl_ca_file = '/etc/postgresql/certs/root.crt'
ssl_cert_file = '/etc/postgresql/certs/server.crt'
ssl_key_file = '/etc/postgresql/certs/server.key'
```

---

## 클라이언트 구성

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

## 구성 검증

연결 성공 후 다음 SQL로 SSL 연결 검증:

```sql
SELECT * FROM pg_stat_ssl;
```

연결이 SSL을 사용한 경우 해당 SSL 정보가 표시됩니다.