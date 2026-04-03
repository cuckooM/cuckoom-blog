---
title: "Spring Security Method Security - Three Annotation Types"
date: 2026-04-03 10:00:00
updated: 2026-04-03 10:00:00
lang: en
slug: springsecurity-method-security
categories:
  - Backend
  - Security
tags:
  - Spring Security
  - Authorization
  - Annotations
description: "Detailed explanation of the three annotation types provided by Spring Security: JSR-250 annotations, @Secured annotations, and expression-based annotations"
keywords: "Spring Security,Authorization,Annotations,JSR-250,Secured,PreAuthorize"
---

Spring Security provides three types of annotations for method-level authorization control:

1. **JSR-250 Annotations**: Standard Java EE specification annotations
2. **@Secured Annotation**: Spring Security native annotation
3. **Expression-based Annotations (Spring EL)**: The most powerful annotation type

Support for these annotations is enabled through the `@EnableGlobalMethodSecurity` annotation parameters.

```java
@Configuration
@EnableGlobalMethodSecurity(jsr250Enabled = true, prePostEnabled = true, securedEnabled = true)
public class MyGlobalMethodSecurityConfiguration extends GlobalMethodSecurityConfiguration {
}
```

## Configuration Parameters

| Parameter | Description |
| --- | --- |
| `prePostEnabled` | Enables expression-based annotations: @PreAuthorize, @PostAuthorize, @PreFilter, @PostFilter |
| `securedEnabled` | Enables @Secured annotation |
| `jsr250Enabled` | Enables @RolesAllowed annotation (JSR-250 standard) |

---

## Expression-based Annotations

This type of annotation is the most powerful, supporting complex authorization judgments using Spring EL expressions.

### Built-in Expressions

The base class for expression root objects is `org.springframework.security.access.expression.SecurityExpressionRoot`.

| Expression | Description |
| --- | --- |
| `hasRole([role])` | Checks if the user has the specified role. If the parameter role does not start with "ROLE_", the prefix is added by default. The default prefix can be customized by modifying the `defaultRolePrefix` property in `DefaultWebSecurityExpressionHandler`. |
| `hasAnyRole([role1,role2])` | Checks if the user has any of the specified roles. Default prefix is the same as above. |
| `hasAuthority([authority])` | Checks if the user has the specified authority. |
| `hasAnyAuthority([authority1,authority2])` | Checks if the user has any of the specified authorities. |
| `principal` | Represents the current user's principal object. |
| `authentication` | Gets the current Authentication object from SecurityContext. |
| `permitAll` | Always returns true. Allows anyone to access. |
| `denyAll` | Always returns false. Denies access to everyone. |
| `isAnonymous()` | Checks if the current principal is an anonymous user. |
| `isRememberMe()` | Checks if the current principal is a "remember-me" user |
| `isAuthenticated()` | Checks if the current principal is not an anonymous user. |
| `isFullyAuthenticated()` | Returns true if the current principal is neither an anonymous nor a "remember-me" user. |
| `hasPermission(Object target, Object permission)` | Returns true if the user has the specified permission for the given target. Requires custom implementation. |
| `hasPermission(Object targetId, String targetType, Object permission)` | Returns true if the user has the specified permission for the given target (unique identifier + type). Requires custom implementation. |

### Four Core Annotations

| Annotation | Description |
| --- | --- |
| `@PreAuthorize` | Checks if the current user has permission before method execution |
| `@PostAuthorize` | Checks if the current user has permission after method execution |
| `@PreFilter` | Filters method parameters |
| `@PostFilter` | Filters method return values |

---

## Spring-EL Expression Usage

### Parameter Reference

#### Direct Parameter Name Reference

```java
@PreAuthorize("#contact.username == authentication.name")
public void doSomething(Contact contact);
```

#### Using @P Annotation (Spring Security)

```java
import org.springframework.security.access.method.P;

@PreAuthorize("#c.username == authentication.name")
public void doSomething(@P("c") Contact contact);
```

#### Using @Param Annotation (Spring Data)

```java
import org.springframework.data.repository.query.Param;

@PreAuthorize("#c.username == authentication.name")
Contact findContactByName(@Param("c") Contact contact);
```

### Collection Filtering

When using `@PreFilter` or `@PostFilter` annotations, the built-in name `filterObject` can be used to represent individual objects in method parameters or return value collections.

#### @PreFilter - Parameter Filtering

Filters method parameters. When there are multiple collection-type parameters, use the `filterTarget` attribute to specify the target collection.

```java
@PreFilter(value = "filterObject!=authentication.principal.username", filterTarget = "usernames")
public String joinUsernamesAndRoles(List<String> usernames, List<String> roles);
```

#### @PostFilter - Return Value Filtering

Filters the method return values.

```java
@PostFilter("hasPermission(filterObject, 'read') or hasPermission(filterObject, 'write')")
public List<Contact> getAll();
```

### Spring Bean Method Reference

Spring-EL expressions can directly reference Spring Bean methods, using the method's return value (true/false) as the authorization judgment result.

#### 1. Define Permission Check Service

```java
@Service("myService")
public class MyServiceImpl implements MyService {

    /**
     * Check if the current user is an admin
     * @return true: yes; false: no
     */
    @Override
    public boolean isAdmin() {
        return "admin".equals(
            ((User) SecurityContextHolder.getContext().getAuthentication()).getUsername()
        );
    }
}
```

#### 2. Use in Method

```java
/**
 * Query data by ID
 * @param id ID
 * @return Result
 */
@GetMapping(path = "/{id}")
@PreAuthorize("@myService.isAdmin()")
public ResponseEntity<Object> queryById(@PathVariable("id") Long id) {
    // ...
}
```

---

## hasPermission() Built-in Expression

### Working Principle

The `hasPermission()` built-in expression delegates to an instance of `org.springframework.security.access.PermissionEvaluator` for processing.

#### Class Hierarchy

```
SecurityExpressionRoot (Base Class)
    └─ MethodSecurityExpressionRoot
        └─ DefaultMethodSecurityExpressionHandler
            └─ GlobalMethodSecurityConfiguration
```

#### PermissionEvaluator Interface

```java
public interface PermissionEvaluator {
    boolean hasPermission(Authentication authentication, Object targetDomainObject, Object permission);
    boolean hasPermission(Authentication authentication, Serializable targetId, String targetType, Object permission);
}
```

### Custom PermissionEvaluator Implementation

#### 1. Implement PermissionEvaluator Interface

```java
public class MyPermissionEvaluator implements PermissionEvaluator {

    @Override
    public boolean hasPermission(Authentication authentication, Object targetDomainObject, Object permission) {
        // Current user
        User user = (User) authentication.getPrincipal();
        // Business permission check TODO
        return true/false;
    }

    @Override
    public boolean hasPermission(Authentication authentication, Serializable targetId, String targetType,
        Object permission) {
        // Current user
        User user = (User) authentication.getPrincipal();
        // Business permission check TODO
        return true/false;
    }
}
```

#### 2. Configure to Spring Security

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

#### 3. Usage Example

```java
/**
 * Query data by ID
 * @param id ID
 * @return Result
 */
@GetMapping(path = "/{id}")
@PreAuthorize("hasPermission(#id, 'myType', '')")
public ResponseEntity<Object> queryById(@PathVariable("id") Long id) {
    // ...
}
```

---

## Comparison of Three Annotation Types

| Feature | JSR-250 (@RolesAllowed) | @Secured | Spring EL (@PreAuthorize) |
| --- | --- | --- | --- |
| Standardization | Java EE Standard | Spring Proprietary | Spring Proprietary |
| Expression Capability | Role-only checks | Role-only checks | Arbitrary Spring EL expressions |
| Authorization Judgment | Simple role checking | Simple role checking | Complex business logic |
| Flexibility | Low | Medium | High |
| Recommended Scenario | Simple role control | Simple role control | Complex business permissions |

---

## Usage Recommendations

1. **Simple role control**: Use `@RolesAllowed` or `@Secured`
2. **Complex authorization control**: Use `@PreAuthorize` with custom `PermissionEvaluator`
3. **Authorization expressions**: Fully utilize built-in expressions like `hasRole()`, `hasAnyRole()`, `hasAuthority()`
4. **Bean references**: For complex business permission checks, use Spring Bean method references
