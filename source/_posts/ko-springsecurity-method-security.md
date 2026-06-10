---
title: "Spring Security 세 가지 어노테이션 타입 상세 설명"
date: 2026-04-03 10:00:00
updated: 2026-04-03 10:00:00
lang: ko
slug: springsecurity-method-security
categories:
  - 백엔드
  - 보안
tags:
  - Spring Security
  - 권한 제어
  - 어노테이션
description: "Spring Security가 제공하는 세 가지 어노테이션 타입 상세 설명: JSR-250 어노테이션, @Secured 어노테이션 및 Spring EL 표현식 기반 어노테이션"
keywords: "Spring Security,권한 제어,어노테이션,JSR-250,Secured,PreAuthorize"
---

Spring Security는 메서드 레벨 권한 제어를 위해 세 가지 타입의 어노테이션을 제공합니다:

1. **JSR-250 어노테이션**: Java EE 표준 규격 어노테이션
2. **@Secured 어노테이션**: Spring Security 네이티브 어노테이션
3. **표현식(Spring EL) 기반 어노테이션**: 기능이 가장 강력한 어노테이션 타입

<!-- more -->

`@EnableGlobalMethodSecurity` 어노테이션의 매개변수로 해당 어노테이션 지원을 활성화합니다.

```java
@Configuration
@EnableGlobalMethodSecurity(jsr250Enabled = true, prePostEnabled = true, securedEnabled = true)
public class MyGlobalMethodSecurityConfiguration extends GlobalMethodSecurityConfiguration {
}
```

## 구성 매개변수 설명

| 매개변수 | 설명 |
| --- | --- |
| `prePostEnabled` | 표현식 기반 어노테이션 활성화: @PreAuthorize, @PostAuthorize, @PreFilter, @PostFilter |
| `securedEnabled` | @Secured 어노테이션 활성화 |
| `jsr250Enabled` | @RolesAllowed 어노테이션 활성화 (JSR-250 표준) |

---

## 표현식(Spring EL) 기반 어노테이션

이 타입 어노테이션은 가장 강력한 기능을 제공하며, Spring EL 표현식을 사용하여 복잡한 권한 판단이 가능합니다.

### 내장 표현식

표현식 루트 객체의 기본 클래스는 `org.springframework.security.access.expression.SecurityExpressionRoot`입니다.

| 표현식 | 설명 |
| --- | --- |
| `hasRole([role])` | 지정된 역할이 있는지 판단. 매개변수 role이 "ROLE_"로 시작하지 않으면 기본적으로 이 접두사가 추가됨. `DefaultWebSecurityExpressionHandler`에서 `defaultRolePrefix` 속성 수정으로 커스텀 접두사 구현 가능. |
| `hasAnyRole([role1,role2])` | 지정된 역할 중 하나가 있는지 판단. 기본 접두사는 위와 동일. |
| `hasAuthority([authority])` | 지정된 권한이 있는지 판단. |
| `hasAnyAuthority([authority1,authority2])` | 지정된 권한 중 하나가 있는지 판단. |
| `principal` | 현재 사용자의 주체 객체 대표. |
| `authentication` | SecurityContext에서 획득한 현재 Authentication 객체. |
| `permitAll` | 반환값 항상 true. 누구나 접근 허용. |
| `denyAll` | 반환값 항상 false. 누구도 접근 허용하지 않음. |
| `isAnonymous()` | 현재 주체가 익명 사용자인지 판단. |
| `isRememberMe()` | 현재 주체가 "remember-me" 사용자인지 판단 |
| `isAuthenticated()` | 현재 주체가 비익명 사용자인지 판단. |
| `isFullyAuthenticated()` | 현재 주체가 익명 사용자 또는 "remember-me" 사용자가 아니면 true 반환. |
| `hasPermission(Object target, Object permission)` | 사용자가 지정된 권한으로 지정된 대상에 접근 권한이 있으면 true 반환. 커스텀 구현 필요. |
| `hasPermission(Object targetId, String targetType, Object permission)` | 사용자가 지정된 권한으로 지정된 대상(유니크 식별자+타입)에 접근 권한이 있으면 true 반환. 커스텀 구현 필요. |

### 네 개 핵심 어노테이션

| 어노테이션 | 설명 |
| --- | --- |
| `@PreAuthorize` | 메서드 실행 전 현재 사용자가 권한이 있는지 판단 |
| `@PostAuthorize` | 메서드 실행 후 현재 사용자가 권한이 있는지 판단 |
| `@PreFilter` | 메서드 매개변수 필터 |
| `@PostFilter` | 반환값 필터 |

---

## Spring-EL 표현식 사용

### 매개변수 참조

#### 직접 매개변수명 참조

```java
@PreAuthorize("#contact.username == authentication.name")
public void doSomething(Contact contact);
```

#### @P 어노테이션 참조 (Spring Security)

```java
import org.springframework.security.access.method.P;

@PreAuthorize("#c.username == authentication.name")
public void doSomething(@P("c") Contact contact);
```

#### @Param 어노테이션 참조 (Spring Data)

```java
import org.springframework.data.repository.query.Param;

@PreAuthorize("#c.username == authentication.name")
Contact findContactByName(@Param("c") Contact contact);
```

### 컬렉션 필터

`@PreFilter`, `@PostFilter` 어노테이션 사용 시 내장 이름 `filterObject`로 메서드 매개변수, 메서드 반환값 컬렉션의 단일 객체를 표현합니다.

#### @PreFilter - 매개변수 필터

메서드 매개변수 필터. 여러 컬렉션 타입 매개변수가 있으면 `filterTarget` 속성으로 대상 컬렉션을 지정합니다.

```java
@PreFilter(value = "filterObject!=authentication.principal.username", filterTarget = "usernames")
public String joinUsernamesAndRoles(List<String> usernames, List<String> roles);
```

#### @PostFilter - 반환값 필터

메서드 반환값 필터.

```java
@PostFilter("hasPermission(filterObject, 'read') or hasPermission(filterObject, 'write')")
public List<Contact> getAll();
```

### Spring Bean 메서드 참조

Spring-EL 표현식으로 Spring Bean 메서드를 직접 참조하고, 메서드 반환값(true/false)으로 권한 판단 결과를 사용합니다.

#### 1. 권한 검사 서비스 정의

```java
@Service("myService")
public class MyServiceImpl implements MyService {

    /**
     * 현재 사용자가 admin인지 판단
     * @return true: 관리자; false: 관리자 아님
     */
    @Override
    public boolean isAdmin() {
        return "admin".equals(
            ((User) SecurityContextHolder.getContext().getAuthentication()).getUsername()
        );
    }
}
```

#### 2. 메서드에서 사용

```java
/**
 * ID로 데이터 조회
 * @param id ID
 * @return 결과
 */
@GetMapping(path = "/{id}")
@PreAuthorize("@myService.isAdmin()")
public ResponseEntity<Object> queryById(@PathVariable("id") Long id) {
    // ...
}
```

---

## hasPermission() 내장 표현식

### 작동 원리

`hasPermission()` 내장 표현식은 `org.springframework.security.access.PermissionEvaluator` 인스턴스에 위임하여 처리합니다.

#### 핵심 클래스 계층 관계

```
SecurityExpressionRoot (기본 클래스)
    └─ MethodSecurityExpressionRoot
        └─ DefaultMethodSecurityExpressionHandler
            └─ GlobalMethodSecurityConfiguration
```

#### PermissionEvaluator 인터페이스

```java
public interface PermissionEvaluator {
    boolean hasPermission(Authentication authentication, Object targetDomainObject, Object permission);
    boolean hasPermission(Authentication authentication, Serializable targetId, String targetType, Object permission);
}
```

### 커스텀 PermissionEvaluator

#### 1. PermissionEvaluator 인터페이스 구현

```java
public class MyPermissionEvaluator implements PermissionEvaluator {

    @Override
    public boolean hasPermission(Authentication authentication, Object targetDomainObject, Object permission) {
        // 현재 사용자
        User user = (User) authentication.getPrincipal();
        // 비즈니스 권한 판단 TODO
        return true/false;
    }

    @Override
    public boolean hasPermission(Authentication authentication, Serializable targetId, String targetType,
        Object permission) {
        // 현재 사용자
        User user = (User) authentication.getPrincipal();
        // 비즈니스 권한 판단 TODO
        return true/false;
    }
}
```

#### 2. Spring Security에 구성

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

#### 3. 사용 예시

```java
/**
 * ID로 데이터 조회
 * @param id ID
 * @return 결과
 */
@GetMapping(path = "/{id}")
@PreAuthorize("hasPermission(#id, 'myType', '')")
public ResponseEntity<Object> queryById(@PathVariable("id") Long id) {
    // ...
}
```

---

## 세 가지 어노테이션 타입 비교

| 특성 | JSR-250 (@RolesAllowed) | @Secured | Spring EL (@PreAuthorize) |
| --- | --- | --- | --- |
| 표준화 | Java EE 표준 | Spring 전용 | Spring 전용 |
| 표현 능력 | 역할 판단만 지원 | 역할 판단만 지원 | 모든 Spring EL 표현식 지원 |
| 권한 판단 | 단순 역할 검사 | 단순 역할 검사 | 복잡한 비즈니스 로직 |
| 유연성 | 낮음 | 중간 | 높음 |
| 추천 시나리오 | 단순 역할 제어 | 단순 역할 제어 | 복잡한 비즈니스 권한 |

---

## 사용 권장 사항

1. **단순 역할 제어**: `@RolesAllowed` 또는 `@Secured` 사용
2. **복잡 권한 제어**: `@PreAuthorize`와 커스텀 `PermissionEvaluator` 함께 사용
3. **권한 표현식**: `hasRole()`, `hasAnyRole()`, `hasAuthority()` 등 내장 표현식 충분히 활용
4. **Bean 참조**: 복잡한 비즈니스 권한 판단은 Spring Bean 메서드 참조로 구현