---
title: "Spring Security 三种注解类型详解"
date: 2026-04-03 10:00:00
updated: 2026-04-03 10:00:00
lang: zh-CN
slug: springsecurity-method-security
categories:
  - 后端
  - 安全
tags:
  - Spring Security
  - 权限控制
  - 注解
description: "详解 Spring Security 提供的三种注解类型：JSR-250 注解、@Secured 注解和基于 Spring EL 表达式的注解"
keywords: "Spring Security,权限控制,注解,JSR-250,Secured,PreAuthorize"
---

Spring Security 提供了三种类型的注解来实现方法级别的权限控制：

1. **JSR-250 注解**：标准的 Java EE 规范注解
2. **@Secured 注解**：Spring Security 原生注解
3. **基于表达式（Spring EL）的注解**：功能最强大的注解类型

通过 `@EnableGlobalMethodSecurity` 注解的参数来开启相应的注解支持。

```java
@Configuration
@EnableGlobalMethodSecurity(jsr250Enabled = true, prePostEnabled = true, securedEnabled = true)
public class MyGlobalMethodSecurityConfiguration extends GlobalMethodSecurityConfiguration {
}
```

## 配置参数说明

| 参数 | 说明 |
| --- | --- |
| `prePostEnabled` | 启用基于表达式的注解：@PreAuthorize、@PostAuthorize、@PreFilter、@PostFilter |
| `securedEnabled` | 启用 @Secured 注解 |
| `jsr250Enabled` | 启用 @RolesAllowed 注解（JSR-250 标准） |

---

## 基于表达式（Spring EL）的注解

这类注解功能最为强大，支持使用 Spring EL 表达式进行复杂的权限判断。

### 内置表达式

表达式根对象的基类是 `org.springframework.security.access.expression.SecurityExpressionRoot`。

| 表达式 | 描述 |
| --- | --- |
| `hasRole([role])` | 判断是否有指定角色。如果参数 role 不是以"ROLE_"开头，则默认会被加上此前缀。可以在 `DefaultWebSecurityExpressionHandler` 中修改 `defaultRolePrefix` 属性实现自定义前缀。 |
| `hasAnyRole([role1,role2])` | 判断是否有指定的任一角色。默认前缀同上。 |
| `hasAuthority([authority])` | 判断是否有指定权限。 |
| `hasAnyAuthority([authority1,authority2])` | 判断是否有指定的任一权限。 |
| `principal` | 代表当前用户的主体对象。 |
| `authentication` | 从 SecurityContext 获得的当前 Authentication 对象。 |
| `permitAll` | 返回值始终为 true。允许任何人访问。 |
| `denyAll` | 返回值始终为 false。不允许任何人访问。 |
| `isAnonymous()` | 判断当前主体是否匿名用户。 |
| `isRememberMe()` | 判断当前主体是否"remember-me"用户 |
| `isAuthenticated()` | 判断当前主体是否非匿名用户。 |
| `isFullyAuthenticated()` | 如果当前主体不是匿名用户或"remember-me"用户，则返回 true。 |
| `hasPermission(Object target, Object permission)` | 如果用户对于给定的目标有指定权限的访问，则返回 true。需要自定义实现。 |
| `hasPermission(Object targetId, String targetType, Object permission)` | 如果用户对于给定的目标（唯一标识+类型）有指定权限的访问，则返回 true。需要自定义实现。 |

### 四个核心注解

| 注解 | 说明 |
| --- | --- |
| `@PreAuthorize` | 方法执行之前判断当前人员是否有权限 |
| `@PostAuthorize` | 方法执行之后判断当前人员是否有权限 |
| `@PreFilter` | 对方法参数进行过滤 |
| `@PostFilter` | 对返回值进行过滤 |

---

## Spring-EL 表达式的使用

### 参数引用

#### 直接引用参数名

```java
@PreAuthorize("#contact.username == authentication.name")
public void doSomething(Contact contact);
```

#### 使用 @P 注解引用（Spring Security）

```java
import org.springframework.security.access.method.P;

@PreAuthorize("#c.username == authentication.name")
public void doSomething(@P("c") Contact contact);
```

#### 使用 @Param 注解引用（Spring Data）

```java
import org.springframework.data.repository.query.Param;

@PreAuthorize("#c.username == authentication.name")
Contact findContactByName(@Param("c") Contact contact);
```

### 集合过滤

在使用 `@PreFilter`、`@PostFilter` 注解时，可以使用内置名称 `filterObject` 表示方法参数、方法返回值集合中的单个对象。

#### @PreFilter - 参数过滤

对方法参数的过滤。如果存在多个集合类型参数，则需要通过 `filterTarget` 属性指定目标集合。

```java
@PreFilter(value = "filterObject!=authentication.principal.username", filterTarget = "usernames")
public String joinUsernamesAndRoles(List<String> usernames, List<String> roles);
```

#### @PostFilter - 返回值过滤

对方法返回值进行过滤。

```java
@PostFilter("hasPermission(filterObject, 'read') or hasPermission(filterObject, 'write')")
public List<Contact> getAll();
```

### Spring Bean 方法引用

可以通过 Spring-EL 表达式直接引用 Spring Bean 的方法，以方法的返回值（true/false）作为权限判断的结果。

#### 1. 定义权限检查服务

```java
@Service("myService")
public class MyServiceImpl implements MyService {

    /**
     * 判断当前人员是否为 admin
     * @return true：是；false：不是
     */
    @Override
    public boolean isAdmin() {
        return "admin".equals(
            ((User) SecurityContextHolder.getContext().getAuthentication()).getUsername()
        );
    }
}
```

#### 2. 在方法上使用

```java
/**
 * 根据 ID 查询数据
 * @param id ID
 * @return 结果
 */
@GetMapping(path = "/{id}")
@PreAuthorize("@myService.isAdmin()")
public ResponseEntity<Object> queryById(@PathVariable("id") Long id) {
    // ...
}
```

---

## hasPermission() 内置表达式

### 工作原理

`hasPermission()` 内置表达式委托给了 `org.springframework.security.access.PermissionEvaluator` 的实例进行处理。

#### 核心类层级关系

```
SecurityExpressionRoot (基类)
    └─ MethodSecurityExpressionRoot
        └─ DefaultMethodSecurityExpressionHandler
            └─ GlobalMethodSecurityConfiguration
```

#### PermissionEvaluator 接口

```java
public interface PermissionEvaluator {
    boolean hasPermission(Authentication authentication, Object targetDomainObject, Object permission);
    boolean hasPermission(Authentication authentication, Serializable targetId, String targetType, Object permission);
}
```

### 自定义 PermissionEvaluator

#### 1. 实现 PermissionEvaluator 接口

```java
public class MyPermissionEvaluator implements PermissionEvaluator {

    @Override
    public boolean hasPermission(Authentication authentication, Object targetDomainObject, Object permission) {
        // 当前人员
        User user = (User) authentication.getPrincipal();
        // 业务权限判断 TODO
        return true/false;
    }

    @Override
    public boolean hasPermission(Authentication authentication, Serializable targetId, String targetType,
        Object permission) {
        // 当前人员
        User user = (User) authentication.getPrincipal();
        // 业务权限判断 TODO
        return true/false;
    }
}
```

#### 2. 配置到 Spring Security

```java
@Configuration
@EnableGlobalMethodSecurity(jsr250Enabled = true, prePostEnabled = true, securedEnabled = true)
public class MyGlobalMethodSecurityConfiguration extends GlobalMethodSecurityConfiguration {

    @Bean
    public PermissionEvaluator permissionEvaluator() {
        return new MyPermissionEvaluator();
    }
}
```

#### 3. 使用示例

```java
/**
 * 根据 ID 查询数据
 * @param id ID
 * @return 结果
 */
@GetMapping(path = "/{id}")
@PreAuthorize("hasPermission(#id, 'myType', '')")
public ResponseEntity<Object> queryById(@PathVariable("id") Long id) {
    // ...
}
```

---

## 三种注解类型对比

| 特性 | JSR-250 (@RolesAllowed) | @Secured | Spring EL (@PreAuthorize) |
| --- | --- | --- | --- |
| 标准化 | 是 Java EE 标准 | Spring 专有 | Spring 专有 |
| 表达能力 | 仅支持角色判断 | 仅支持角色判断 | 支持任意 Spring EL 表达式 |
| 权限判断 | 简单角色检查 | 简单角色检查 | 复杂业务逻辑 |
| 灵活性 | 低 | 中 | 高 |
| 推荐场景 | 简单角色控制 | 简单角色控制 | 复杂业务权限 |

---

## 使用建议

1. **简单角色控制**：使用 `@RolesAllowed` 或 `@Secured`
2. **复杂权限控制**：使用 `@PreAuthorize` 配合自定义 `PermissionEvaluator`
3. **权限表达式**：充分利用 `hasRole()`、`hasAnyRole()`、`hasAuthority()` 等内置表达式
4. **Bean 引用**：对于复杂的业务权限判断，通过 Spring Bean 方法引用实现
