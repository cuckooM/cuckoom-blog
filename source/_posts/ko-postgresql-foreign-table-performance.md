---
title: PostgreSQL 외부 테이블(Foreign Table) 성능 최적화 실전
date: 2026-06-05 14:00:00
lang: ko
categories:
  - 데이터베이스
tags:
  - PostgreSQL
  - Foreign Table
  - FDW
  - 성능 최적화
---

PostgreSQL의 Foreign Table은 강력한 기능으로, 로컬 테이블처럼 원격 데이터 소스를 쿼리할 수 있습니다. 하지만 실제 사용 중, 특히 LEFT JOIN으로 Foreign Table의 Primary Key를 연결할 때 성능 문제가 발생하기 쉽습니다. 이 글에서는 Foreign Table의 원리를 깊이 분석하고 체계적인 성능 최적화 방안을 제공합니다.

<!-- more -->

## Foreign Table 작동 원리

Foreign Table을 최적화하기 위해 먼저 작동 메커니즘을 이해해야 합니다. Foreign Table은 **Foreign Data Wrapper (FDW)** 아키텍처 기반으로 구현되며, 쿼리 과정은 여러 단계로 나뉩니다:

### 아키텍처 레이어

```
┌─────────────────────────────────────┐
│  SQL 쿼리 (SELECT * FROM foreign_tbl) │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  PostgreSQL 쿼리 옵티마이저               │
│  (쿼리 계획 생성, 조건 푸시다운)              │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  Foreign Data Wrapper (FDW)         │
│  (postgres_fdw, mysql_fdw, file_fdw)│
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  외부 데이터 소스 (원격PG/MySQL/파일/API)    │
└─────────────────────────────────────┘
```

### 핵심 컴포넌트

완전한 Foreign Table 구성은 세 가지 핵심 컴포넌트를 포함합니다:

1. **Foreign Server** — 외부 데이터 소스의 연결 정보 정의
2. **User Mapping** — 로컬 사용자에서 원격 사용자로의 인증 매핑
3. **Foreign Table** — 로컬 테이블 구조 정의, 원격 객체로 매핑

```sql
-- 1. 확장 생성
CREATE EXTENSION postgres_fdw;

-- 2. 외부 서버 정의
CREATE SERVER remote_db 
  FOREIGN DATA WRAPPER postgres_fdw 
  OPTIONS (host '192.168.1.100', dbname 'remote', port '5432');

-- 3. 사용자 매핑
CREATE USER MAPPING FOR current_user 
  SERVER remote_db 
  OPTIONS (user 'remote_user', password 'xxx');

-- 4. 외부 테이블 정의
CREATE FOREIGN TABLE foreign_users (
  id int,
  name text,
  status text
) SERVER remote_db 
  OPTIONS (table_name 'users');
```

### 쿼리 실행 흐름

쿼리 실행 시 PostgreSQL은 다음 단계를 거칩니다:

**1. 쿼리 계획 단계**

옵티마이저가 쿼리에 Foreign Table이 포함됨을 인식하고 FDW의 `PlanForeignScan` 콜백 함수를 호출합니다. 이 단계에서 어떤 쿼리 조건을 원격으로 "푸시다운"할지 결정합니다.

**2. 조건 푸시다운(Pushdown)**

이것은 성능 최적화의 핵심입니다. WHERE 조건이 원격에서 실행되면 네트워크 전송 데이터량을 크게 줄일 수 있습니다:

```sql
-- 이 쿼리는 WHERE 조건을 원격으로 푸시
SELECT * FROM foreign_users WHERE id > 100;

-- FDW가 생성하는 원격 쿼리:
-- SELECT id, name, status FROM users WHERE id > 100
```

현재 푸시다운 가능한 내용:
- WHERE 조건
- JOIN 작업 (일부 FDW 지원, postgres_fdw 15+ 지원)
- 집계 함수 (SUM, COUNT, AVG 등)
- 정렬과 LIMIT

**3. 실행 단계**

- `BeginForeignScan`: 원격 데이터베이스 연결 설정
- `IterateForeignScan`: 데이터 행 반복 조회
- `EndForeignScan`: 연결 리소스 해제

## 성능 최적화 전략

### 1. 통계 정보 가져오기

가장 효과적인 최적화는 옵티마이저가 Foreign Table의 통계 정보를 알게 하는 것입니다:

```sql
-- FDW가 원격 테이블의 통계 정보를 쿼리
ALTER FOREIGN TABLE foreign_users 
  OPTIONS (use_remote_estimate 'true');
```

`use_remote_estimate`는 postgres_fdw가 계획 단계에서 원격 테이블의 통계 정보(행 수, 유니크 값 수 등)를 쿼리하여 더 나은 실행 계획을 생성합니다.

### 2. 배치 조회 최적화

postgres_fdw는 기본적으로 원격에서 100행을 가져옵니다. 이 값을 늘리면 네트워크 라운드트립 수를 줄일 수 있습니다:

```sql
-- 서버 레벨 설정
ALTER SERVER remote_db 
  OPTIONS (SET fetch_size '10000');

-- 단일 테이블 레벨 설정 (우선순위 더 높음)
ALTER FOREIGN TABLE foreign_users 
  OPTIONS (SET fetch_size '5000');
```

### 3. 인덱스 전략

**원격 테이블에 인덱스 필요**:

```sql
-- 원격 데이터베이스에서 생성
CREATE INDEX idx_users_id ON users(id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_id_status ON users(id, status);
```

**로컬 테이블의 연결 키도 인덱스 필요**:

```sql
-- 로컬 데이터베이스에서 생성
CREATE INDEX idx_local_foreign_id ON local_table(foreign_id);
```

## 성능 비교 예시

실제 시나리오로: 10만행 로컬 테이블 LEFT JOIN 100만행 원격 테이블.

### 최적화 전

```sql
-- 기본 설정, 통계 정보 없음
EXPLAIN ANALYZE 
SELECT l.*, r.name 
FROM local_table l 
LEFT JOIN foreign_table r ON l.foreign_id = r.id;

-- 실행 시간: 45초
-- 원인: 전체 테이블 가져오기, Nested Loop JOIN
```

### 최적화 후

```sql
-- 최적화 설정
ALTER SERVER remote_db OPTIONS (SET fetch_size '10000');
ALTER FOREIGN TABLE foreign_table OPTIONS (use_remote_estimate 'true');

-- 원격에서 인덱스 생성
CREATE INDEX idx_ft_id ON remote_table(id);

EXPLAIN ANALYZE 
SELECT l.*, r.name 
FROM local_table l 
LEFT JOIN foreign_table r ON l.foreign_id = r.id;

-- 실행 시간: 3초
-- 15배 향상
```

## 요약

Foreign Table 성능 최적화의 핵심 원칙은 **계산을 데이터 소스로 푸시다운**하여 네트워크 전송과 로컬 계산을 줄이는 것입니다. 가장 효과적인 최적화는:

1. **fetch_size 증가** — 네트워크 라운드트립 감소
2. **use_remote_estimate 활성화** — 옵티마이저가 더 나은 결정
3. **원격 인덱스 확보** — 원격 쿼리 가속화
4. **조건 푸시다운** — 필터가 원격에서 실행

데이터 변화가 적은 시나리오에서 Materialized View가 가장 단순하고 효과적인 방안입니다. 시계열 데이터의 경우 Partitioned Table + Foreign Table으로 Cold/Hot 분리를 구현하여 쿼리 성능과 저장 비용을 모두 고려할 수 있습니다.

이 기술을 숙지하면 Foreign Table이 데이터 Federation 아키텍처의 강력한 도구가 되고, 성능 병목이 되지 않습니다.