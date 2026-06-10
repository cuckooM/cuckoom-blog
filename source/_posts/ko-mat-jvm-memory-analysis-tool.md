---
title: JVM 힙 메모리 분석 필수 도구——MAT 사용 가이드
date: 2026-05-25 15:00:00
lang: ko
categories:
  - Java
  - 성능 최적화
  - JVM
tags:
  - JVM
  - 메모리 분석
  - MAT
  - 성능 튜닝
---

# JVM 힙 메모리 분석 필수 도구——MAT 사용 가이드

## 서론

Java 애플리케이션의 개발과 운영 과정에서 메모리 누수와 메모리 초과 문제는 흔한 성능 병목입니다. 이 문제를 빠르게 식별하기 위해 전문적인 메모리 분석 도구가 필요합니다. MAT(Memory Analyzer Tool)는 오픈소스 Java 힙 메모리 분석 도구로, 개발자가 효율적으로 메모리 누수를 찾아내고 메모리 사용 현황을 분석하며 성능 튜닝을 수행할 수 있습니다.

<!-- more -->

## MAT 도구 개요

MAT(Memory Analyzer Tool)는 Eclipse Foundation이 제공하는 무료 도구로, Java 힙 메모리 Dump(Heap Dump) 파일 분석에 특화되어 있습니다. 메모리 누수를 빠르게 찾아내고 메모리 사용 현황을 분석하며 상세한 메모리 뷰를 제공합니다.

### 주요 기능
- 대형 힙 Dump 파일 빠른 분석 (수 GB 크기 파일 지원)
- 메모리 누수 의심 객체 자동 검출
- 다양한 뷰로 메모리 사용 현황 표시
- 풍부한 쿼리 언어 OQL(Object Query Language)

### 장점
- 분석 속도 빠름
- 검출 정확률 높음
- 인터페이스 친화적, 직관적인 조작
- 풍부한 플러그인, 강력한 확장성

## MAT 도구 설치 및 구성

### 다운로드 및 설치
1. Eclipse MAT 공식 웹사이트에서 최신 버전 다운로드
2. MAT는 독립 설치 패키지와 Eclipse 플러그인 두 가지 형태 제공
3. 독립 설치 패키지 권장, Eclipse 설치 필요 없음

### 시스템 요구사항
- Java Runtime Environment 8 또는 상위 버전
- 권장 메모리: 힙 메모리의 1.5배 이상 MAT에 할당
- 64비트 운영체제 (대형 힙 Dump 파일 처리 권장)

### 기본 구성
MAT 시작 시 mat.ini 파일로 JVM 매개변수 조정:
```
-Xmx8g        # 최대 힙 메모리 설정
-XX:+UseG1GC  # G1 가비지 컬렉터 사용
```

## 힙 메모리 Dump 파일 생성

### 트리거 조건
- 애플리케이션 OutOfMemoryError 발생
- 수동 힙 Dump 트리거
- 정기 자동 힙 Dump 생성

### 생성 방식

#### 1. JVM 매개변수로 자동 생성
```bash
java -XX:+HeapDumpOnOutOfMemoryError \
     -XX:HeapDumpPath=/path/to/dumps/ \
     -jar your-application.jar
```

#### 2. jmap 명령으로 수동 생성
```bash
# Java 프로세스 ID 확인
jps -l

# 힙 Dump 파일 생성
jmap -dump:format=b,file=heap.hprof <pid>

# GC 루트 경로 포함 힙 Dump
jmap -dump:live,format=b,file=heap.hprof <pid>
```

#### 3. jcmd 명령 사용
```bash
# 모든 Java 프로세스 목록
jcmd

# 힙 Dump 생성
jcmd <pid> GC.run_finalization
jcmd <pid> VM.class_hierarchy
jcmd <pid> GC.dump /path/to/heap.hprof
```

## MAT 핵심 뷰 상세 설명

### 1. Histogram(히스토그램)
각 클래스의 인스턴스 수와 점유 메모리 크기를 표시하며, 메모리 점유가 많은 객체를 빠르게 식별합니다.

**해석 포인트:**
- 클래스명: 완전한 클래스명 표시
- Objects: 해당 클래스의 인스턴스 수
- Shallow Heap: 객체 자체가 점유하는 메모리
- Retained Heap: 해당 객체와 연관된 객체가 총점 점유하는 메모리

### 2. Dominator Tree(도미네이터 트리)
객체 간 참조 관계를 표시하며, 어떤 객체가 가장 많은 보유 메모리를 점유하는지 찾습니다.

**특징:**
- 완전한 객체 참조 체인 표시
- Retained Heap 순으로 정렬
- 메모리 누수 원천을 직접 찾기 가능

### 3. Leak Suspects(메모리 누수 의심 객체)
MAT의 지능형 분석 기능으로, 가장 가능성 있는 메모리 누수 지점을 자동으로 식별합니다.

### 4. Thread Overview(스레드 개요)
스레드 관련 정보를 분석하며, 스레드 스택, 지역 변수 등을 포함합니다.

### 5. Biggest Objects by Size(크기별 최대 객체)
메모리 점유가 가장 큰 객체를 표시하며, 대형 객체 문제를 빠르게 찾을 수 있습니다.

## MAT 사용 상세 가이드

### 1. 힙 Dump 파일 열기
1. MAT 시작
2. "Open a Heap Dump" 선택
3. hprof 파일 선택
4. 분석 완료 대기 (인덱스 생성으로 쿼리 속도 향상)

### 2. 메모리 누수 검출
- Leak Suspects 보고서 확인
- Dominator Tree에서 비정상적으로 큰 객체 찾기
- Path To GC Roots 기능으로 객체 생존 원인 분석

### 3. GC 루트 경로 분석
의심 객체 우클릭 → Path To GC Roots → 팬텀/소프트/위크 참조 제외

이 분석 방법으로 객체의 가비지 컬렉션을 방해하는 모든 참조 경로를 찾을 수 있습니다.

### 4. 쿼리 언어(OQL) 사용
MAT는 SQL과 유사한 쿼리 언어 OQL을 제공합니다:

```sql
-- 특정 클래스 인스턴스 찾기
SELECT * FROM com.example.MyClass

-- 크기로 필터
SELECT * FROM java.lang.String WHERE toString().length() > 100

-- 특정 클래스 수량 집계
SELECT COUNT(*) FROM com.example.MyClass
```

## 결론

MAT는 Java 개발자 필수 메모리 분석 도구이며, 사용 방법 숙지는 성능 튜닝에 매우 중요합니다. MAT의 다양한 기능을 적절히 활용하면 메모리 누수를 빠르게 찾아내고 메모리 사용을 최적화하여 애플리케이션 안정성과 성능을 향상할 수 있습니다.

메모리 분석은 기술 문제만이 아니라 애플리케이션 아키텍처와 비즈니스 로직을 깊이 이해하는 과정입니다. 일상 개발에서 좋은 프로그래밍 습관을 형성하고 근본적으로 메모리 문제를 방지하는 것이 가장 중요합니다.