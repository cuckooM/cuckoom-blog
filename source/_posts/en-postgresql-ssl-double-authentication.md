---
title: PostgreSQL SSL Mutual Authentication and Spring Access
date: 2026-03-16 18:00:00
updated: 2026-03-16 18:00:00
lang: en
slug: postgresql-ssl-double-authentication
categories:
  - Database
tags:
  - PostgreSQL
  - SSL
  - Spring Boot
  - Mutual Authentication
description: A detailed guide on configuring PostgreSQL database SSL mutual authentication and accessing it through Spring Boot application
keywords: PostgreSQL,SSL,Mutual Authentication,Spring Boot,Database Security
---

## Generate Certificates

### 1. Generate Three Files for the Server Side

- `root.crt` (Trusted root certificate)
- `server.crt` (Server certificate)
- `server.key` (Private key)

#### Generate Private Key (requires setting a password)

```bash
openssl genrsa -des3 -out server.key 2048
```

#### Remove Password (requires entering the password from the previous step)

```bash
openssl rsa -in server.key -out server.key
```

#### Create Server Certificate

```bash
openssl req -new -key server.key -days 3650 -out server.crt -x509
```

During execution, you need to enter the following information:

```
Country Name (2 letter code) [AU]:CN
State or Province Name (full name) [Some-State]:Beijing
Locality Name (eg, city) []:Beijing
Organization Name (eg, company) [Internet Widgits Pty Ltd]:cuckooM
Organizational Unit Name (eg, section) []:cuckooM
Common Name (e.g. server FQDN or YOUR name) []:127.0.0.1
Email Address []:
```

> Note: "Common Name" should be written as the server's IP address or domain name.

#### Since this is self-signed, the server certificate can be used as the trusted root certificate

```bash
cp server.crt root.crt
```

---

### 2. Generate Three Files for the Client Side

- `root.crt` (Trusted root certificate, already generated on the server side)
- `client.crt` (Client certificate)
- `client.key` (Private key)

#### Generate Private Key (requires setting a password)

```bash
openssl genrsa -des3 -out client.key 2048
```

#### Remove Password (requires entering the password from the previous step)

```bash
openssl rsa -in client.key -out client.key
```

#### Create Client Certificate

```bash
openssl req -new -key client.key -out client.csr
```

During execution, you need to enter the following information:

```
Country Name (2 letter code) [AU]:CN
State or Province Name (full name) [Some-State]:Beijing
Locality Name (eg, city) []:Beijing
Organization Name (eg, company) [Internet Widgits Pty Ltd]:cuckooM
Organizational Unit Name (eg, section) []:cuckooM
Common Name (e.g. server FQDN or YOUR name) []:blog
Email Address []:
```

> Note: "Common Name" should be set to the database username you will connect to.

#### Convert Format. Convert PEM format key to DER format.

```bash
openssl pkcs8 -topk8 -inform PEM -in client.key -outform DER -nocrypt -out client.pk8
```

---

### 3. File Summary

After the above steps, we have generated seven files for the server and client:

- `client.crt`
- `client.csr`
- `client.key`
- `client.pk8`
- `root.crt`
- `server.crt`
- `server.key`

---

## Server Configuration

### 1. pg_hba.conf

Add the following content:

```
hostssl   all             all             0.0.0.0/0               cert
hostssl   all             all             ::1/128                 cert
```

### 2. postgresql.conf

Modify the following configuration:

```
ssl = on
ssl_ca_file = '/etc/postgresql/certs/root.crt'
ssl_cert_file = '/etc/postgresql/certs/server.crt'
ssl_key_file = '/etc/postgresql/certs/server.key'
```

---

## Client Configuration

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

## Verify Configuration

After a successful connection, you can verify the SSL connection using the following SQL:

```sql
SELECT * FROM pg_stat_ssl;
```

If the connection uses SSL, it will display the corresponding SSL information.
