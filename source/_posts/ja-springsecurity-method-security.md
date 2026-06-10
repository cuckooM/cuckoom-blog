---
title: Spring Security三種類の注釈タイプ詳解
date: 2026-04-03 10:00:00
updated: 2026-04-03 10:00:00
lang: ja
slug: ja-springsecurity-method-security
categories:
  - バックエンド
  - セキュリティ
tags:
  - Spring Security
  - 権限制御
  - 注釈
description: Spring Security提供の三種類の注釈タイプ：JSR-250注釈、@Secured注釈、Spring EL式ベース注釈を詳解
keywords: Spring Security,権限制御,注釈,JSR-250,Secured,PreAuthorize
---

Spring Securityは三種類の注釈を提供し、メソッドレベルの権限制御を実現します：

1. **JSR-250注釈**：標準Java EE規範注釈
2. **@Secured注釈**：Spring Securityネイティブ注釈
3. **式ベース（Spring EL）注釈**：最も強力な注釈タイプ

<!-- more -->

`@EnableGlobalMethodSecurity`注釈のパラメータで各注釈サポートを有効化できます。

```java
@Configuration
@EnableGlobalMethodSecurity(jsr250Enabled = true, prePostEnabled = true, securedEnabled = true)
public class MyGlobalMethodSecurityConfiguration extends GlobalMethodSecurityConfiguration {
}
```

## 設定パラメータ説明

| パラメータ | 説明 |
| --- | --- |
| `prePostEnabled` | 式ベース注釈を有効化：@PreAuthorize、@PostAuthorize、@PreFilter、@PostFilter |
| `securedEnabled` | @Secured注釈を有効化 |
| `jsr250Enabled` | @RolesAllowed注釈を有効化（JSR-250標準） |

---

## 式ベース（Spring EL）注釈

このタイプの注釈は最も強力で、Spring EL式を使用して複雑な権限判断が可能です。

### 内部式

式ルートオブジェクトの基底クラスは `org.springframework.security.access.expression.SecurityExpressionRoot`。

| 式 | 説明 |
| --- | --- |
| `hasRole([role])` | 指定ロールがあるか判断 |
| `hasAnyRole([role1,role2])` | 指定のいずれかのロールがあるか判断 |
| `hasAuthority([authority])` | 指定権限があるか判断 |
| `hasAnyAuthority([authority1,authority2])` | 指定のいずれかの権限があるか判断 |
| `principal` | 現在ユーザーの主体オブジェクト |
| `authentication` | SecurityContextから取得した現在Authenticationオブジェクト |
| `permitAll` | 常にtrueを返す。誰でもアクセス可能 |
| `denyAll` | 常にfalseを返す。誰もアクセス不可 |
| `isAnonymous()` | 現在主体が匿名ユーザーか判断 |
| `isRememberMe()` | 現在主体が"remember-me"ユーザーか判断 |
| `isAuthenticated()` | 現在主体が非匿名ユーザーか判断 |
| `isFullyAuthenticated()` | 現在主体が匿名ユーザーまたは"remember-me"ユーザーでない場合true |

### 四つの核心注釈

| 注釈 | 説明 |
| --- | --- |
| `@PreAuthorize` | メソッド実行前に現在のユーザーが権限があるか判断 |
| `@PostAuthorize` | メソッド実行後に現在のユーザーが権限があるか判断 |
| `@PreFilter` | メソッドパラメータをフィルタリング |
| `@PostFilter` | 戻り値をフィルタリング |

---

## Spring-EL式の使用

### パラメータ参照

#### 直接パラメータ名を参照

```java
@PreAuthorize("#contact.username == authentication.name")
public void doSomething(Contact contact);
```

#### @P注釈を使用して参照（Spring Security）

```java
import org.springframework.security.access.method.P;

@PreAuthorize("#c.username == authentication.name")
public void doSomething(@P("c") Contact contact);
```

---

## 参考資料

- [Spring Security Method Security](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html)