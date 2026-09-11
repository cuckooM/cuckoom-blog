---
title: "기업위챗 앱 개발 완전 가이드: 기존 근태 + Activiti 결재 시스템을 H5로 연동하는 실전"
date: 2026-07-09 21:00:00
tags:
  - 기업위챗
  - H5 개발
  - 근태 시스템
  - Activiti
  - 워크플로우
  - 싱글사인온
  - API 연동
categories:
  - 기술 실천
lang: ko
---

많은 팀의 기업위챗(WeCom) 개발은 처음부터 새 시스템을 만드는 것이 아니라, 더 흔하고 현실적인 시나리오를 마주합니다. **업무 시스템이 이미 존재하고 수년간 운영 중**인 경우입니다. 근태 모듈은 이미 오픈되었고, 결재 흐름은 Activiti 기반으로 회람(전원 승인), 또는결재(아무 1명 승인), 조직도 기반 단계별 결재 등 복잡한 프로세스를 구현했으며, 결재 과정에서 근태 데이터를 재조회하고 연동합니다. 이제 요구사항은 이 시스템을 WeCom으로 가져와, 직원이 WeCom 워크벤치에서 열기만 하면 바로 사용할 수 있게 하는 것입니다. **다시 아이디와 비밀번호를 입력할 필요 없이, 들어가면 바로 자신의 근태 현황과 결재 대기 태스크가 보여야 합니다.**

이러한 전제에서 H5 앱 방식은 미니프로그램보다 적합한 선택인 경우가 많습니다. 기존 시스템 자체가 Angular + SpringBoot 웹 아키텍처이므로, H5는 프런트엔드 페이지와 백엔드 API를 그대로 재사용할 수 있고, WeCom OAuth2 웹 인가(`snsapi_base`)와 결합하면 완전히 조용한 자동 로그인(SSO)을 구현할 수 있습니다. 배포 즉시 적용되고 심사와 릴리스가 필요 없으며, 결재 양식이 자주 바뀔 때 반복 비용이 가장 낮습니다.

이 글은 「**기존 근태 관리 시스템 + Activiti 복잡 결재 흐름**」을 배경으로 **H5 방식을 중심 축으로** 설명합니다. 업무 시스템을 다시 작성하지 않고 WeCom 연동을 완료하는 방법을 체계적으로 다루며, OAuth2 무소음 자동 로그인의 전체 경로, WeCom 계정과 시스템 계정의 바인딩 매핑, JS-SDK 디바이스 기능 호출, 그리고 Activiti 회람/또는결재/조직도 결재와 근태 연동을 WeCom에서 구현하는 방법(결재 대기 태스크 푸시, 카드 원클릭 결재, 조직도 동기화)을 중점적으로 분석합니다.

<!-- more -->

## 1. 시나리오 분석과 방식 선택

### 1.1 기존 시스템의 전제 가정

이 글은 업무 시스템의 현재 상태가 다음과 같다고 가정합니다(대부분의 중대형 기업 내부 시스템의 전형적인 형태이기도 합니다):

- **근태 관리**: 체크인(출퇴근 기록), 체크인 기록, 근태 보정(보강) 신청, 근태 통계 기능이 이미 완비되어 있고, 백엔드가 REST API를 제공
- **결재 흐름 엔진**: Activiti(6.x/7.x) 기반 구현, 프로세스 정의에 다음 포함:
  - **회람(전원 승인)**: 하나의 노드에서 여러 명이 모두 승인해야 함(예: 근태 보정에 직속 상사 + HR 모두 동의 필요)
  - **또는결재(아무 1명 승인)**: 하나의 노드에서 여러 명 중 아무나 한 명이 결재하면 됨(예: 부서 당직 결재 그룹)
  - **조직도 기반 결재**: 신청인이 속한 부서에 따라 결재자가 동적으로 결정됨(부서장 → 담당 임원 → HRBP)
  - **근태 데이터 연동**: 결재 프로세스 중 근태 데이터를 읽거나 다시 기록(예: 근태 보정 결재 통과 후 체크인 기록을 자동 수정하고, 연차 결재 통과 후 휴가 잔액을 차감)
- **계정 체계**: 시스템 자체 사용자 테이블, 역할/권한 체계 보유(예: Spring Security + JWT/Session)
- **프런트엔드**: 웹 환경이 이미 존재, Angular 단일 페이지 앱(TypeScript)

풀어야 할 핵심 문제는 단 두 가지입니다.

1. **신원 문제**: WeCom에서 들어온 사람이 누구인가? 시스템 계정과 어떻게 대응시켜 자동 로그인을 구현할 것인가?
2. **진입점과 도달 문제**: WeCom 워크벤치에서 어떻게 앱에 진입하는가? 결재 대기 태스크를 어떻게 직원의 WeCom으로 능동적으로 푸시하는가?

업무 로직(체크인 규칙, 결재 흐름)은 **한 줄도 WeCom으로 옮길 필요가 없습니다**. WeCom은 「진입점 + 신원 제공자(IdP) + 메시지 채널」 세 가지 역할만 맡습니다.

### 1.2 이런 시나리오에 H5가 선호되는 이유

| 비교 항목 | H5 앱(이 글의 방안) | WeCom 미니프로그램 |
|----------|--------------------|----------------|
| 기존 웹 프런트 재사용 | 기존 Angular 페이지를 그대로 재사용 | WXML/WXSS로 모든 페이지를 다시 작성해야 함 |
| 기존 백엔드 API 재사용 | 그대로 재사용, OAuth 로그인 엔드포인트 하나만 추가 | 마찬가지로 재사용하지만 프런트는 전부 재작업 |
| 자동 로그인 | OAuth2 `snsapi_base` 무소음 인가, 전 과정 인지 없음 | `wx.qyLogin` 무소음, 역시 인지 없음 |
| 릴리스/반복 | 배포 즉시 적용, 결재 양식을 언제든 수정 | 심사 제출과 릴리스 필요, 긴급 수정이 느림 |
| 복잡한 양식/프로세스 페이지 | 웹 기술이 유연하여 결재 같은 양식 중심 페이지에 적합 | 양식 엔진류 페이지 개발 비용이 높음 |
| 디바이스 기능 | JS-SDK: 위치/사진/스캔(서명 필요) | 네이티브 API 직접 호출, 체감이 약간 더 좋음 |
| 결재 흐름 같은 「저빈도·양식 중심·고빈도 반복」 업무 | 매우 잘 맞음 | 다소 무거움 |

**결론**: 근태 체크인 자체는 빈도가 높고 디바이스 기능을 중시하므로 미니프로그램의 체험이 확실히 더 좋습니다. 하지만 「**기존 시스템 연동, 결재 프로세스가 복잡하고 자주 조정됨, 저비용 오픈과 자동 로그인이 1차 목표**」라는 전제에서는 H5의 종합 이득이 체감상의 작은 차이보다 훨씬 큽니다. 또한 H5도 JS-SDK로 위치, 사진 촬영, 스캔을 호출할 수 있어 근태 시나리오를 완전히 커버합니다. 이 글 후반부에 JS-SDK의 완전한 서명 방안과 iOS/Android 함정 처리 방법을 제시합니다.

> 이후 체크인 체험 요구가 더 높아지면 하이브리드 방식도 가능합니다. 같은 자가개발 앱에 H5 홈페이지(결재, 기록, 통계)와 미니프로그램(체크인)을 함께 구성하고, 메시지 카드는 업무 유형별로 각각 이동시키며, 백엔드 계정 체계는 완전히 공유합니다.

### 1.3 전체 아키텍처

```
┌───────────────────────────────┐
│            WeCom 클라이언트       │
│   워크벤치 / 메시지 카드 / 스캔     │
└───────────────┬───────────────┘
                │ H5 열기(내장 WebView)
                ▼
┌───────────────────────────────┐
│   H5 프런트엔드(기존 웹 프로젝트 재사용) │
│  Angular SPA + wx JS-SDK      │
│  라우트 가드: 토큰 없음 → OAuth로 이동  │
└───────────────┬───────────────┘
                │ HTTPS(JWT)
                ▼
┌───────────────────────────────────────────────────────┐
│                  기존 업무 백엔드(SpringBoot)             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ WecomOAuth   │  │ 근태 모듈      │  │ Activiti 결재  │ │
│  │ 자동 로그인/계정 바인딩 │  │ (기존, 재사용)  │  │ (기존, 재사용)   │ │
│  └──────┬───────┘  └──────────────┘  └───────┬───────┘ │
│         │           계정 매핑 테이블 user_id ↔ wecom_userid │
└─────────┼────────────────────────────────────┼─────────┘
          ▼                                    ▼
┌───────────────────┐              ┌──────────────────────┐
│ WeCom 서버 API     │              │ PostgreSQL / Redis   │
│ gettoken           │              │ 업무 테이블 + act_* 워크플로우 테이블│
│ auth/getuserinfo   │              └──────────────────────┘
│ jsapi_ticket       │
│ message/send 푸시   │◀──── 결재 대기 태스크 발생 시 백엔드가 능동적으로 카드 푸시
└───────────────────┘
```

핵심 설계 원칙: **WeCom userid는 시스템 사용자 테이블 위의 하나의 외부 신원 필드에 불과합니다**. 근태와 Activiti의 후보자/처리 담당자는 여전히 시스템 내부 userId를 사용하거나(또는 userid와 통합, 4.6절 논의 참고), 이렇게 하면 WeCom은 새로 추가된 한 가지 로그인 방식일 뿐, 기존 권한과 워크플로우 모델을 침범하지 않습니다.

> 위 그림에서 H5 프런트엔드, WeCom 어댑터 로직, 업무 백엔드를 같은 쪽에 그린 것은 호출 관계를 보이기 위함입니다. 근태 시스템이 내부망 격리 구역에 배포되어 WeCom과 외부망 휴대폰이 직접 접근할 수 없다면, DMZ에 공개 중계 게이트웨이를 별도로 배포해야 합니다(WeCom 어댑터 로직은 게이트웨이에 두고 업무는 여전히 내부망에 남기며, 양쪽은 mTLS + 내부 토큰으로 통제된 상호 통신). 자세한 내용은 **제9장 「네트워크 격리 환경의 공개 중계 게이트웨이」**를 참고하세요.

## 2. 개발 환경 구축

### 2.1 자가개발 앱 생성과 3요소 확보

1. [WeCom 관리자 콘솔](https://work.weixin.qq.com/)에 접속하여 관리자 계정으로 로그인
2. 「앱 관리」→「자가개발」→「앱 생성」에서 앱 이름(예: 「모바일 근태 결재」), 로고, 공개 범위를 입력
3. 생성 후 다음 세 가지 핵심 파라미터를 기록:

| 파라미터 | 설명 | 확인 위치 |
|------|------|----------|
| `corpid` | 기업 고유 식별자 | 내 기업 → 기업 정보 → 기업 ID |
| `agentid` | 앱 고유 식별자 | 앱 관리 → 자가개발 앱 → AgentId |
| `secret` | 앱 비밀키 | 앱 관리 → 자가개발 앱 → Secret |

> ⚠️ `secret`은 최고 수준의 민감한 자격 증명이므로 **서버에만 보관**하고, H5 프런트엔드 코드, Git 저장소, 브라우저 요청에 절대 노출되어서는 안 됩니다.

### 2.2 앱 홈페이지 구성(H5 진입점)

앱 상세 페이지의 「앱 홈페이지」에서 H5 시작 주소를 구성합니다:

```
앱 관리 → 자가개발 앱 → 앱 홈페이지 → 웹페이지 구성
  홈페이지 URL: https://attendance.yourcompany.com/mobile/
```

직원이 WeCom 워크벤치에서 앱 아이콘을 탭하면 WeCom 내장 브라우저에서 이 URL이 열립니다. H5 모바일 환경은 독립 경로(예: `/mobile/`)를 사용하여 PC 관리 화면과 구분하고, 라우트 분기와 독립 레이아웃을 적용하기 쉽게 구성하기를 권장합니다.

### 2.3 신뢰 도메인 구성(H5에서 가장 핵심인 백오피스 설정)

H5 방식에서 OAuth 웹 인가 콜백 도메인과 JS-SDK는 모두 「신뢰 도메인」에 의존합니다:

```
앱 관리 → 자가개발 앱 → 개발자 인터페이스 → 웹 인가 및 JS-SDK
  → 신뢰 도메인 설정: attendance.yourcompany.com
  → 도메인 소유 확인 파일 다운로드(WW_verify_xxxx.txt)
  → 파일을 도메인 루트 디렉터리에 배치하고 접근 가능 확인:
    https://attendance.yourcompany.com/WW_verify_xxxx.txt
```

도메인 요구사항:

- 반드시 **HTTPS**여야 함(OAuth 인가와 JS-SDK에서 강제)
- ICP 비안 완료(중국 본토 서버)
- 도메인 소유 확인 파일은 프런트엔드 정적 리소스 서비스 또는 Nginx가 직접 호스팅
- 하나의 앱에 여러 신뢰 도메인 구성 가능(도메인 주체는 일치해야 함), 콜백 주소는 반드시 이 도메인 하위에 위치해야 함

추가로 「기업 신뢰 IP」를 구성합니다: 서버 API를 호출하는 서버의 아웃바운드 IP를 화이트리스트에 추가해야 하며, 그렇지 않으면 `gettoken` 등의 인터페이스가 `60020 not allow to access from your ip` 오류를 반환합니다.

### 2.4 메시지 수신 구성(콜백, 카드 버튼 결재에 사용)

「메시지 카드에서 바로 동의/거절을 누르는」 방식(페이지를 열 필요 없음)을 구현하려면 콜백을 구성해야 합니다:

```
앱 관리 → 자가개발 앱 → 메시지 수신 → API 수신 설정
  URL:             https://attendance.yourcompany.com/api/wecom/callback/message
  Token:           임의 지정(서명 검증에 사용)
  EncodingAESKey:  무작위 생성(메시지 본문 AES 암/복호화에 사용)
```

결재 대기 태스크 이동만 하고 카드 내 상호작용을 하지 않는다면 당장 구성하지 않아도 되지만, 처음부터 구성해 두기를 권장합니다(제7장에서 사용).

### 2.5 로컬 개발 환경

H5 로컬 개발의 핵심 난점은 OAuth 콜백과 JS-SDK가 신뢰 도메인 + HTTPS를 요구하지만 로컬은 `http://localhost`라는 점입니다. 자주 쓰는 방안은 두 가지입니다.

**방안 1: 리버스 터널(권장, 실제 환경에 가장 가까움)**

```bash
# frp 또는 ngrok으로 로컬 8080/프런트엔드 포트를 비안 완료된 도메인의 하위 경로로 매핑
# 예: https://dev-attendance.yourcompany.com 이 매핑되도록 함
frpc -c frpc.ini

# Angular dev server가 호스트 도메인 접근을 허용(angular.json)
# serve 옵션: host를 0.0.0.0으로, 기본 포트 4200
# angular.json -> projects/<name>.architect.serve.options
{ "host": "0.0.0.0", "port": 4200 }
# 또는 명령줄: ng serve --host 0.0.0.0 --port 4200
```

터널링 도메인을 관리자 콘솔의 신뢰 도메인에 추가하고(개발 단계), 확인 파일을 로컬 정적 디렉터리에 두면 확인을 통과할 수 있습니다.

**방안 2: hosts + mkcert(공개망 불필요, 순수 페이지 연동에 적합)**

```bash
mkcert -install
mkcert attendance.yourcompany.com        # 로컬 신뢰 인증서 생성
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

> 주의: hosts 방안은 브라우저의 인증서 검증만 통과시킬 수 있습니다. WeCom 클라이언트의 OAuth 인가는 여전히 실제 WeCom 서버를 거친 후 리다이렉트로 복귀하므로, 실제 휴대폰 디버깅 시 휴대폰은 당신 컴퓨터의 hosts를 사용할 수 없습니다. 따라서 **실제 휴대폰 디버깅은 반드시 리버스 터널 도메인을 사용해야 합니다**.

**백엔드 로컬 기동**:

```bash
cd ~/work/code/attendance-backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

## 3. H5 프런트엔드 프로젝트 연동

### 3.1 디렉터리 구조(기존 Angular 프로젝트를 재사용하고 모바일 모듈을 추가)

새 프로젝트를 만들 필요는 없습니다. 기존 Angular + TypeScript 프로젝트에 모바일 지연 로딩 모듈(feature module / routes)과 WeCom 어댑터 계층을 추가하기만 하면 됩니다:

```
attendance-web/
├── src/
│   ├── main.ts
│   ├── index.html                   # 여기 <script>로 jweixin을 불러와도 됨
│   ├── app/
│   │   ├── app.routes.ts            # 라우트 총 진입점(PC/모바일 분기)
│   │   ├── mobile/                  # WeCom 내 H5 모바일 환경(지연 로딩 모듈)
│   │   │   ├── mobile.routes.ts     # 모바일 서브 라우트
│   │   │   ├── guards/
│   │   │   │   └── wecom-auth.guard.ts   # 자동 로그인 라우트 가드(CanActivate)
│   │   │   └── pages/
│   │   │       ├── checkin/checkin.component.ts      # 체크인 첫 화면
│   │   │       ├── records/records.component.ts      # 체크인 기록
│   │   │       ├── todo/todo-list.component.ts       # 결재 대기 태스크(Activiti tasks)
│   │   │       ├── todo/approval-detail.component.ts # 결재 상세(회람/또는결재 진행도)
│   │   │       ├── apply/makeup-apply.component.ts   # 근태 보정(보강) 신청(프로세스 트리거)
│   │   │       └── oauth/oauth-callback.component.ts # OAuth 콜백 착지 페이지
│   │   ├── core/
│   │   │   ├── interceptors/
│   │   │   │   └── auth.interceptor.ts   # HttpClient 인터셉터(JWT 주입, 401 재로그인)
│   │   │   └── services/            # 기존 업무 Service 재사용
│   │   │       ├── checkin.service.ts
│   │   │       └── approval.service.ts
│   │   └── wecom/                   # WeCom 어댑터 계층(이번에 추가하는 핵심)
│   │       ├── env.service.ts       # WeCom 환경 여부, UA 판단
│   │       ├── oauth.service.ts     # OAuth2 자동 로그인 이동 로직
│   │       ├── jssdk.service.ts     # wx.config / agentConfig / 서명
│   │       └── device.service.ts    # 위치, 사진 촬영, 스캔 래퍼
├── public/(또는 src/)
│   └── WW_verify_xxxx.txt           # 도메인 소유 확인 파일(정적 리소스 루트에 배치)
└── angular.json
```

### 3.2 WeCom JS-SDK 불러오기

WeCom H5는 `jweixin` 모듈을 사용합니다(위챗 공식 계정 JSSDK와 동일 기원이며, WeCom이 그 위에 `wx.agentConfig`와 기업 전용 인터페이스를 확장함):

```bash
npm install weixin-js-sdk --save
# 또는 index.html에 직접 불러오기
# <script src="https://res.wx.qq.com/open/js/jweixin-1.2.0.js"></script>
```

```typescript
// src/app/wecom/env.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WecomEnvService {
  /** 현재 WeCom 클라이언트 내부에서 실행 중인지 여부 */
  isInWecom(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    // WeCom UA는 wxwork와 micromessenger를 동시에 포함
    return /wxwork/.test(ua) && /micromessenger/.test(ua);
  }

  /** iOS 여부(JS-SDK 서명 URL 처리에 차이가 있음, 제5장 참고) */
  isIOS(): boolean {
    return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  }
}
```

### 3.3 라우트와 자동 로그인 가드

모바일 환경의 모든 업무 라우트는 동일한 `CanActivate` 가드 아래에 겁니다: 시스템 토큰이 없으면 OAuth 자동 로그인을 시작하고, 로그인 성공 후 원래 페이지로 복귀합니다. 이것이 「앱을 열면 자동 로그인」을 구현하는 마스터 스위치이며, 제4장에서 자세히 다룹니다.

```typescript
// src/app/mobile/mobile.routes.ts
import { Routes } from '@angular/router';
import { WecomAuthGuard } from './guards/wecom-auth.guard';

export const MOBILE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'checkin' },
  {
    path: 'checkin',
    canActivate: [WecomAuthGuard],
    loadComponent: () => import('./pages/checkin/checkin.component').then(m => m.CheckinComponent),
  },
  {
    path: 'records',
    canActivate: [WecomAuthGuard],
    loadComponent: () => import('./pages/records/records.component').then(m => m.RecordsComponent),
  },
  {
    path: 'todo',
    canActivate: [WecomAuthGuard],
    loadComponent: () => import('./pages/todo/todo-list.component').then(m => m.TodoListComponent),
  },
  {
    path: 'approval/:taskId',
    canActivate: [WecomAuthGuard],
    loadComponent: () =>
      import('./pages/todo/approval-detail.component').then(m => m.ApprovalDetailComponent),
  },
  {
    path: 'apply/makeup',
    canActivate: [WecomAuthGuard],
    loadComponent: () =>
      import('./pages/apply/makeup-apply.component').then(m => m.MakeupApplyComponent),
  },
  // OAuth 콜백 착지 페이지: 가드를 걸지 않음
  {
    path: 'oauth/callback',
    loadComponent: () =>
      import('./pages/oauth/oauth-callback.component').then(m => m.OauthCallbackComponent),
  },
];
```

```typescript
// src/app/mobile/guards/wecom-auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { WecomOAuthService } from '../../wecom/oauth.service';

export const WecomAuthGuard: CanActivateFn = (route, state) => {
  const oauth = inject(WecomOAuthService);

  // 핵심: 로그인 여부 확인; 미로그인 시 redirectToWecomAuth 내부에서 전체 페이지 이동으로 OAuth를 트리거
  if (oauth.hasToken()) {
    return true;
  }
  oauth.redirectToWecomAuth(state.url);   // 현재 페이지를 떠남
  return new Promise<boolean>(() => false); // 이번 네비게이션을 차단하고 전체 페이지 이동을 대기
};
```

루트 라우트에서 `mobile` 경로로 모바일 모듈 전체를 지연 로딩합니다:

```typescript
// src/app/app.routes.ts
export const APP_ROUTES: Routes = [
  {
    path: 'mobile',
    loadChildren: () => import('./mobile/mobile.routes').then(m => m.MOBILE_ROUTES),
  },
  // ...PC 관리 화면 라우트
];
```

## 4. OAuth2 무소음 자동 로그인(SSO) 완전 경로

이것이 전체 연동의 핵심입니다. 목표 효과: 직원이 WeCom에서 앱 아이콘을 탭하거나(또는 결재 메시지 카드를 탭하면), 페이지가 열리는 과정에서 **로그인 페이지도 확인 버튼도 전혀 없이**, 1~2초 후 바로 업무 페이지에 도달하고 백엔드는 이미 "그가 시스템의 누구인지" 알고 있는 상태입니다.

### 4.1 인가 모드 선택: snsapi_base

WeCom 웹 인가는 두 가지 scope를 지원합니다:

| scope | 확인 팝업 여부 | 획득 가능 정보 | 적용 |
|-------|-----------|-----------|------|
| `snsapi_base` | **무소음, 팝업 없음** | 멤버 userid만(백엔드에서 교환) | 사내 앱 자동 로그인, **이 글에서 사용** |
| `snsapi_privateinfo` | 사용자 직접 확인 필요 | userid + 민감 정보(휴대폰/이메일 등, 멤버 인가 필요) | 추가 개인정보 수집이 필요한 극히 일부 시나리오 |

사내 자가개발 앱이고 앱 공개 범위가 사용자를 이미 커버하는 경우, `snsapi_base`는 WeCom 클라이언트 내에서 완전히 조용히 동작합니다. 이것이 바로 자동 로그인의 기반입니다. 이 단계에서 휴대폰 번호나 이메일을 가져올 필요는 없으며(그런 정보는 서버 주소록 API로 userid를 통해 조회하면 됨), 따라서 항상 `snsapi_base`를 사용합니다.

### 4.2 전체 프로세스 시퀀스

```
WeCom 클라이언트    H5 프런트(WebView)     업무 백엔드             WeCom 서버
    │                   │                     │                     │
    │ 앱 홈페이지 열기    │                     │                     │
    │──────────────────▶│                     │                     │
    │                   │ 라우트 가드: 토큰 없음  │                     │
    │                   │ 302 인가 링크로 이동   │                     │
    │◀──────────────────│                     │                     │
    │ 무소음 인가(인지 없음)│                    │                     │
    │───────────────────────────────────────▶│                     │
    │ 302 리다이렉트로 복귀 callback?code=xxx&state=yyy             │
    │──────────────────▶│                     │                     │
    │                   │ POST /auth/wecom/login {code}             │
    │                   │────────────────────▶│                     │
    │                   │                     │ gettoken            │
    │                   │                     │────────────────────▶│
    │                   │                     │◀────────────────────│
    │                   │                     │ auth/getuserinfo    │
    │                   │                     │  (code→userid)      │
    │                   │                     │────────────────────▶│
    │                   │                     │◀────────────────────│
    │                   │                     │ userid→시스템 계정 조회/생성 │
    │                   │                     │ JWT 발급             │
    │                   │◀────────────────────│                     │
    │                   │ 토큰 저장, 목표 페이지로 복귀 │                    │
    │                   │ 이후 요청에 JWT 포함  │                     │
```

두 가지 핵심 포인트에 주의하세요:

1. **code는 반드시 백엔드에서만 교환**: 프런트엔드는 절대 WeCom API를 직접 호출하지 않습니다(secret이 노출됨). 프런트는 "이동 안내"와 "리다이렉트로 복귀한 URL의 code를 백엔드에 전달"만 담당합니다.
2. **인가 링크는 프런트에서 조립하든 백엔드에서 조립하든 상관없지만**, `state`를 통한 CSRF 방지와 "로그인 후 원래 페이지로 리다이렉트 복귀" 로직은 반드시 직접 관리해야 합니다.

### 4.3 1단계: 인가 링크 생성 및 이동

인가 링크 형식:

```
https://open.weixin.qq.com/connect/oauth2/authorize
  ?appid=CORPID
  &redirect_uri=URL_ENCODED_CALLBACK
  &response_type=code
  &scope=snsapi_base
  &agentid=AGENTID
  &state=STATE
#wechat_redirect
```

| 파라미터 | 설명 |
|------|------|
| `appid` | 기업 corpid(이름은 appid지만 여기에는 corpid를 입력) |
| `redirect_uri` | 인가 후 리다이렉트로 복귀할 주소, URL 인코딩 필요, 반드시 신뢰 도메인 하위여야 함 |
| `response_type` | 고정값 `code` |
| `scope` | `snsapi_base` |
| `agentid` | 자가개발 앱 agentid(**반드시 포함**, 일부 버전에서 이 앱의 신원을 획득하지 못하는 문제 방지) |
| `state` | 사용자 정의 파라미터, WeCom이 원본 그대로 반환; CSRF 방지 + 복귀 목표 경로 전달에 사용 |
| `#wechat_redirect` | 고정 접미사, 반드시 해시 형태로 종료 |

프런트엔드는 주입 가능한 `WecomOAuthService`로 래핑합니다(`src/app/wecom/oauth.service.ts`):

```typescript
import { Injectable, inject } from '@angular/core';
import { WecomEnvService } from './env.service';

@Injectable({ providedIn: 'root' })
export class WecomOAuthService {
  private readonly env = inject(WecomEnvService);

  private readonly CORP_ID = 'ww your_corpid';        // corpid는 고민감 정보가 아니므로 프런트에 둘 수 있음
  private readonly AGENT_ID = '1000002';              // agentid 역시 공개 가능
  private readonly CALLBACK =
    'https://attendance.yourcompany.com/mobile/oauth/callback';

  hasToken(): boolean {
    return !!localStorage.getItem('sys_token');
  }

  /** 무작위 state를 생성하고 동시에 "로그인 후 이동할 페이지"를 sessionStorage에 임시 저장 */
  private buildState(redirectPath: string): string {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(`wx_state_${nonce}`, redirectPath || '/mobile/checkin');
    sessionStorage.setItem('wx_state_nonce', nonce);   // 콜백 시 검증
    return nonce;
  }

  /** 자동 로그인 시작: 전체 페이지를 WeCom 인가 주소로 이동 */
  redirectToWecomAuth(redirectPath: string): void {
    if (!this.env.isInWecom()) {
      // WeCom 환경이 아님(예: PC 브라우저로 직접 연 경우), 시스템 계정/비밀번호 로그인 페이지로 이동
      window.location.href = '/login?redirect=' + encodeURIComponent(redirectPath);
      return;
    }
    const state = this.buildState(redirectPath);
    const url =
      'https://open.weixin.qq.com/connect/oauth2/authorize' +
      `?appid=${encodeURIComponent(this.CORP_ID)}` +
      `&redirect_uri=${encodeURIComponent(this.CALLBACK)}` +
      '&response_type=code' +
      '&scope=snsapi_base' +
      `&agentid=${this.AGENT_ID}` +
      `&state=${encodeURIComponent(state)}` +
      '#wechat_redirect';
    window.location.replace(url);
  }
}
```

라우트 가드는 `hasToken()` 판단만 호출하고, 미로그인 시 `redirectToWecomAuth()`를 호출하면 됩니다(3.3의 `WecomAuthGuard` 참고).

> corpid, agentid는 "공개 식별자"입니다(인가 링크 자체가 브라우저에 평문으로 나타나야 함). 프런트엔드에 두어도 무방하며, 진짜 비밀키는 secret뿐이고 이것은 항상 서버에만 존재합니다.

### 4.4 2단계: 콜백 착지 페이지에서 code를 받아 token으로 교환

`/mobile/oauth/callback?code=xxx&state=yyy`로 리다이렉트 복귀한 후, 콜백 페이지는 세 가지를 수행합니다: state 검증 → code를 백엔드에 전송 → JWT를 받은 후 원래 목표 페이지로 복귀.

```typescript
// src/app/mobile/pages/oauth/oauth-callback.component.ts
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  template: `<div class="oauth-loading">{{ errMsg() }}</div>`,
})
export default class OauthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  protected errMsg = signal('로그인 중...');

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code') ?? '';
    const state = this.route.snapshot.queryParamMap.get('state') ?? '';

    if (!code) { this.errMsg.set('인가 실패: code가 없습니다'); return; }

    // 1. state 검증으로 CSRF 방지: 이동 전에 저장했던 nonce여야 함
    const savedNonce = sessionStorage.getItem('wx_state_nonce');
    if (!state || state !== savedNonce) {
      this.errMsg.set('로그인 상태 검증에 실패했습니다. 앱에 다시 진입해 주세요');
      return;
    }
    const redirectPath = sessionStorage.getItem(`wx_state_${state}`) || '/mobile/checkin';

    try {
      // 2. code를 백엔드에 전달하여 시스템 JWT로 교환
      const { token } = await firstValueFrom(this.auth.loginByWecomCode(code));
      localStorage.setItem('sys_token', token);
      sessionStorage.removeItem(`wx_state_${state}`);
      sessionStorage.removeItem('wx_state_nonce');
      // 3. 원래 가려던 페이지로 복귀(특정 결재 대기 태스크 상세일 수 있음)
      this.router.navigateByUrl(redirectPath, { replaceUrl: true });
    } catch (e: any) {
      this.errMsg.set('자동 로그인 실패: ' + (e?.message || '다시 시도해 주세요'));
    }
  }
}
```

```typescript
// src/app/core/services/auth.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

interface WecomLoginResp { token: string; userInfo: unknown; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  /** code로 JWT 교환: 토큰이 필요 없는 소수 엔드포인트 중 하나(인터셉터에서 통과) */
  loginByWecomCode(code: string): Observable<WecomLoginResp> {
    return this.http
      .post<{ code: number; message: string; data: WecomLoginResp }>(
        '/api/auth/wecom/login', { code })
      // 백엔드 통일 응답 봉투 { code, message, data } 분해(오류 코드 처리는 인터셉터에서 통일 처리 가능)
      .pipe(map((resp) => resp.data));
  }
}
```

### 4.5 3단계: 백엔드에서 code로 userid 교환(신원 인증 핵심)

백엔드는 code를 받으면 먼저 access_token을 얻은 후, 두 번 인터페이스를 호출합니다:

- `auth/getuserinfo`: code → userid(기업 내부 멤버) 또는 openid(비기업 멤버/외부 연락처)
- userid를 얻은 후 필요하면 `user/get`(주소록)으로 이름, 부서, 휴대폰 번호를 보완

**인터페이스 1: 접근 자격 증명 획득**

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

`access_token`(유효 기간 7200초)을 반환합니다. access_token은 반드시 중앙에서 관리해야 하며(Redis 캐시 + 분산 락, 제8장 참고), 프런트엔드와 다른 서비스가 각자 획득하지 않습니다.

**인터페이스 2: code → userid 교환**

```
GET https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=TOKEN&code=CODE
```

기업 내부 멤버 응답:

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "userid": "zhangsan",
  "user_ticket": "xxx"
}
```

> 반환값에 `userid`가 없고 `openid`만 있다면, 현재 사용자가 이 기업 앱의 공개 범위 밖(외부 연락처일 가능성)이라는 뜻입니다. 자동으로 계정을 만들지 말고 로그인을 거부하고 관리자에게 권한 개설을 문의하도록 안내해야 합니다.

**로그인 Controller**:

```java
/**
 * WeCom H5 자동 로그인
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/api/auth/wecom")
@Slf4j
public class WecomAuthController {

    @Resource
    private WecomAuthService wecomAuthService;

    /**
     * H5 OAuth 무소음 로그인: code로 userid를 교환하고 시스템 계정에 바인딩한 후 JWT 발급
     */
    @PostMapping("/login")
    public Result<WecomLoginVO> login(@RequestBody @Valid WecomLoginDTO dto) {
        log.info("WeCom H5 자동 로그인, code={}", dto.getCode());
        WecomLoginVO vo = wecomAuthService.loginByCode(dto.getCode());
        return Result.success(vo);
    }
}
```

```java
/**
 * WeCom 자동 로그인 Service
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class WecomAuthService {

    @Resource
    private WecomTokenManager tokenManager;
    @Resource
    private RestTemplate restTemplate;
    @Resource
    private SysUserService userService;
    @Resource
    private JwtTokenProvider jwtTokenProvider;

    public WecomLoginVO loginByCode(String code) {
        // 1. code → userid 교환
        String accessToken = tokenManager.getAccessToken();
        String url = String.format(
                "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=%s&code=%s",
                accessToken, code);

        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_AUTH_FAILED,
                    "WeCom 신원 획득 실패: " + (resp == null ? "null" : resp.getString("errmsg")));
        }

        String wecomUserId = resp.getString("userid");
        if (StrUtil.isBlank(wecomUserId)) {
            // openid만 있는 경우: 기업 내부 멤버가 아니고 앱 공개 범위 밖
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE,
                    "현재 계정은 앱 인가 범위 밖입니다. 관리자에게 문의하세요");
        }

        // 2. userid를 시스템 계정에 매핑(핵심, 4.6 참고)
        SysUser user = userService.getOrBindByWecomUserId(wecomUserId);
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "계정이 비활성화되었습니다");
        }

        // 3. 시스템 자체 JWT 발급, 기존 인증 체계 재사용
        String jwt = jwtTokenProvider.generateToken(user.getId(), user.getUsername());
        return WecomLoginVO.builder()
                .token(jwt)
                .userInfo(UserInfoVO.of(user))
                .build();
    }
}
```

### 4.6 4단계: WeCom 계정과 시스템 계정 바인딩(기존 시스템에서 가장 핵심인 설계)

이것이 "기존 업무 시스템"과 "처음부터 만드는 시스템"의 가장 큰 차이입니다. 시스템에는 이미 오래전부터 계정들이 존재하고(사번, 이메일, 도메인 계정으로 로그인할 수 있음), WeCom에서 들어오는 것은 userid 하나뿐입니다. **단순히 "userid로 새 사용자를 만드는" 방식은 안 됩니다**. 그렇게 하면 동일 인물이 두 계정으로 갈라져 근태 기록과 Activiti 결재 대기 태스크가 전부 어긋납니다.

세 가지 바인딩 전략을 권장하며 기업 실정에 맞게 선택합니다:

**전략 A: 사번/계정이 일치하면 자동 바인딩(가장 권장, 운영 부담 제로)**

WeCom 주소록의 "계정" 필드는 보통 기업 통일 사번이고, WeCom userid 역시 사번을 쓰는 경우가 많습니다. userid = 시스템 username(또는 사번)으로 약속하고, 로그인 시 바로 계정으로 연결합니다:

```java
/**
 * WeCom userid로 시스템 계정 바인딩
 * 약속: WeCom userid는 시스템 사번(username)과 일치
 */
public SysUser getOrBindByWecomUserId(String wecomUserId) {
    // 1. 먼저 바인딩된 wecom_user_id로 조회
    SysUser user = userMapper.findByWecomUserId(wecomUserId);
    if (user != null) {
        return user;
    }

    // 2. 미바인딩: 사번(username)으로 기존 계정 자동 매칭 시도
    user = userMapper.findByUsername(wecomUserId);
    if (user != null) {
        // 바인딩 관계를 생성하여 다음 번에 바로 적중
        user.setWecomUserId(wecomUserId);
        userMapper.updateById(user);
        log.info("시스템 계정 {}이(가) WeCom userid {}에 자동 바인딩됨", user.getUsername(), wecomUserId);
        return user;
    }

    // 3. 여전히 매칭되지 않음: 조용히 계정을 만들지 말고 바인딩 안내가 필요한 상태를 반환,
    //    관리자 또는 셀프 바인딩 프로세스가 처리
    throw new BusinessException(ErrorCode.WECOM_ACCOUNT_NOT_BOUND,
            "WeCom 계정과 연결된 시스템 계정을 찾을 수 없습니다. 관리자에게 바인딩을 문의하세요");
}
```

**전략 B: 셀프 바인딩(계정 체계가 통일되지 않은 경우)**

첫 로그인 시 자동 매칭이 안 되면, 사용자가 시스템 계정/비밀번호를 한 번 입력하여 바인딩을 완료하게 합니다. 이후 해당 wecom_user_id와 user_id 매핑이 DB에 저장되어 영구적으로 자동 로그인됩니다:

```
최초 WeCom 로그인 → 백엔드가 매핑 없음을 발견 → NEED_BIND 상태 반환
  → H5가 바인딩 페이지 표시(시스템 계정/비밀번호 입력, 또는 사번+SMS 인증코드)
  → 백엔드 검증 통과 → sys_user.wecom_user_id에 기록 → JWT 발급
```

바인딩 관계는 한 번만 설정되고, 자격 증명은 검증 후 즉시 폐기하며 평문 비밀번호를 남기지 않습니다.

**전략 C: 관리자 사전 바인딩 / 주소록 동기화**

주소록 API(`user/list`)로 부서 단위 일괄 동기화를 수행하고, WeCom userid와 시스템 계정을 사번 기준으로 정렬합니다(제8장에 동기화 방안 제시). 오픈 전 일회성 초기화에 적합합니다.

**사용자 테이블 개조**(기존 사용자 테이블에 필드만 추가, 기존 구조는 건드리지 않음):

```sql
ALTER TABLE sys_user ADD COLUMN wecom_user_id VARCHAR(64);
COMMENT ON COLUMN sys_user.wecom_user_id IS 'WeCom userid(외부 신원)';
CREATE UNIQUE INDEX uk_sys_user_wecom ON sys_user (wecom_user_id) WHERE wecom_user_id IS NOT NULL;
```

> 설계 요점: **내부 userId는 변경하지 않습니다**. 근태 기록 외래키, Activiti의 `ACT_RU_TASK.ASSIGNEE_`, 후보자 그룹은 모두 계속 시스템 내부 userId(username)를 사용합니다. WeCom userid는 "로그인 시 인물 식별"과 "푸시 시 주소 지정"에만 쓰이며, `sys_user.wecom_user_id` 매핑 계층으로 디커플링합니다. 이렇게 하면 워크플로우 정의를 오염시키지 않으면서 PC 계정/비밀번호, 기타 SSO 등 로그인 방식의 공존도 유지됩니다.

### 4.7 5단계: JWT와 기존 인증 체계의 끊김 없는 연결

자동 로그인으로 userid를 얻은 후, 이후 요청은 PC 환경과 완전히 동일하게 시스템의 기존 JWT/Session 인증을 따릅니다. 따라서 근태와 결재 API는 수정이 전혀 없습니다.

프런트엔드는 Angular의 `HttpInterceptor`로 토큰을 통일 주입하고 401 시 자동 로그인을 재수행합니다:

```typescript
// src/app/core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn, HttpHandlerFn, HttpRequest, HttpErrorResponse }
  from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { WecomEnvService } from '../../wecom/env.service';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>, next: HttpHandlerFn,
) => {
  const token = localStorage.getItem('sys_token');
  let authed = req;
  if (token) {
    authed = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(authed).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // 토큰 만료: WeCom 내에서는 다시 무소음 자동 로그인(인지 없음), 외부 환경은 로그인 페이지로 이동
        localStorage.removeItem('sys_token');
        const env = inject(WecomEnvService);
        if (env.isInWecom()) {
          location.reload();   // 라우트 가드가 자동으로 다시 OAuth를 시작
        } else {
          location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
        }
      }
      return throwError(() => error);
    }),
  );
};
```

`app.config.ts`에 등록합니다(함수형 인터셉터, Angular 15+):

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { APP_ROUTES } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
```

> 자동 로그인 엔드포인트 `/api/auth/wecom/login` 자체는 토큰을 가지지 않으므로, 인터셉터는 "로컬 스토리지에 토큰 없음" 상황을 그대로 통과시키며 특별한 판단이 필요 없습니다. 401일 때만 자동 로그인 재실행이 트리거됩니다.

백엔드는 기존 Spring Security 설정을 그대로 사용하고(SecurityFilterChain Bean 형식), WeCom 로그인 엔드포인트와 콜백 엔드포인트만 통과시킵니다:

```java
/**
 * Spring Security 보안 설정
 *
 * @author cuckoom
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                        "/api/auth/wecom/**",      // WeCom 자동 로그인
                        "/api/wecom/callback/**"   // WeCom 콜백
                ).permitAll()
                .anyRequest().authenticated()
            )
            // 프런트/백엔드 분리 + JWT: 무상태, CSRF 비활성화, JWT 필터가 토큰을 해석
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter(),
                    UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
    // JwtAuthenticationFilter: Authorization 헤더를 해석하고 SecurityContext에 기록, 기존 구현을 재사용
}
```

> 프로젝트가 여전히 Spring Security 5.x의 `WebSecurityConfigurerAdapter`를 사용한다면, 동등한 작성법은 `configure(HttpSecurity)`를 재정의하고 동일한 두 경로에 `permitAll()` 및 `csrf().disable()`을 적용하는 것입니다. 자동 로그인으로 발급된 JWT는 기존 JWT 필터가 통일 검증하며 계정/비밀번호 로그인과 완전히 공유됩니다.

여기까지로 "앱 열기 → 자동 로그인 → 바로 자신의 근태와 결재 대기 태스크 확인" 경로가 완전히 연결되었고, **근태와 Activiti의 모든 기존 인터페이스, 권한, 데이터는 한 줄도 수정되지 않았습니다**.

## 5. JS-SDK: H5에서 위치, 사진 촬영, 스캔 사용하기

근태 시나리오에서 위치, 사진 촬영, 스캔은 빠질 수 없습니다. H5는 미니프로그램처럼 네이티브 API를 직접 호출할 수 없고, WeCom JS-SDK를 통해 서명 인가를 거친 후 호출해야 합니다. 이 장에서는 바로 적용 가능한 서명 방안을 제시하고, 가장 함정에 빠지기 쉬운 iOS/Android 서명 URL 차이를 중점적으로 다룹니다.

### 5.1 wx.config와 wx.agentConfig

WeCom JS-SDK에는 두 계층의 설정이 있어 초보자가 가장 혼동하기 쉽습니다:

| 설정 | 용도 | 서명 티켓 |
|------|------|----------|
| `wx.config` | 기본 설정을 주입하고 범용 기능(공유, 위치 `getLocation`, 스캔 `scanQRCode`, 이미지 선택 등 대부분 인터페이스)을 호출 | `jsapi_ticket`으로 서명 |
| `wx.agentConfig` | 현재 **자가개발 앱** 신원을 주입하고 WeCom 전용 인터페이스(예: `selectEnterpriseContact` 인명 선택기, 일부 결재 관련 인터페이스)를 호출 | `get_jsapi_ticket`(기업 앱 티켓)으로 서명 |

근태 체크인의 위치/사진/스캔은 `wx.config` 통과만으로 충분합니다. "조직도 기준 결재자/참조자 인명 선택기" 같은 기업 전용 기능만 추가로 `agentConfig`가 필요합니다.

### 5.2 백엔드: jsapi_ticket 관리와 서명

`jsapi_ticket`은 access_token으로 교환하며 유효 기간 7200초, 마찬가지로 중앙 캐시가 필요합니다:

```
GET https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=TOKEN
```

기업 앱 agentConfig용 티켓 인터페이스는 `ticket/get?type=agent_config`입니다.

서명 알고리즘(WeCom 규정):

```
string1 = jsapi_ticket={ticket}&noncestr={nonce}&timestamp={timestamp}&url={현재 페이지 URL}
signature = SHA1(string1)
```

```java
/**
 * JS-SDK 서명 Service
 *
 * @author cuckoom
 */
@Service
public class WecomJsapiService {

    @Resource
    private WecomTokenManager tokenManager;
    @Resource
    private RestTemplate restTemplate;
    @Resource
    private StringRedisTemplate redisTemplate;

    private static final String JSAPI_TICKET_KEY = "wecom:jsapi_ticket";

    /** jsapi_ticket 획득(캐시, 로직은 access_token과 동일, 분산 락은 생략, 8.1 참고) */
    public String getJsapiTicket() {
        String cached = redisTemplate.opsForValue().get(JSAPI_TICKET_KEY);
        if (StrUtil.isNotBlank(cached)) {
            return cached;
        }
        String token = tokenManager.getAccessToken();
        String url = "https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=" + token;
        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR, "jsapi_ticket 획득 실패");
        }
        String ticket = resp.getString("ticket");
        redisTemplate.opsForValue().set(JSAPI_TICKET_KEY, ticket, 7100, TimeUnit.SECONDS);
        return ticket;
    }

    /**
     * wx.config에 필요한 서명 생성
     * @param pageUrl 프런트엔드가 전달한 서명용 페이지 URL(iOS 특수 처리는 5.3 참고)
     */
    public WxConfigSignatureVO buildConfigSignature(String pageUrl) {
        String ticket = getJsapiTicket();
        String nonceStr = IdUtil.fastSimpleUUID();
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);

        // 주의: 서명에 참여하는 url은 프런트엔드 location.href와 완전히 일치해야 함(hash 처리 규칙은 아래 참고)
        String raw = String.format(
                "jsapi_ticket=%s&noncestr=%s&timestamp=%s&url=%s",
                ticket, nonceStr, timestamp, pageUrl);
        String signature = SecureUtil.sha1(raw);

        return WxConfigSignatureVO.builder()
                .corpId(tokenManager.getCorpId())
                .agentId(tokenManager.getAgentId())
                .nonceStr(nonceStr)
                .timestamp(timestamp)
                .signature(signature)
                .build();
    }
}
```

```java
@RestController
@RequestMapping("/api/wecom/jssdk")
public class WecomJsdkController {

    @Resource
    private WecomJsapiService jsapiService;

    /** 프런트엔드가 페이지 진입 후 현재 URL로 서명을 교환 */
    @GetMapping("/config")
    public Result<WxConfigSignatureVO> config(@RequestParam("url") String url) {
        return Result.success(jsapiService.buildConfigSignature(url));
    }
}
```

### 5.3 프런트엔드: 서명 초기화(iOS 진입 페이지 문제를 중점 처리)

JS-SDK의 가장 고전적인 함정: **Android는 현재 페이지 URL로 서명하지만, iOS(WKWebView)는 앱에 처음 진입할 때의 진입 페이지 URL로 서명**한다는 점입니다. SPA에서 프런트엔드 라우트 전환은 실제 페이지 새로고침이 아니므로, iOS에서 "현재 라우트의 href"로 서명하면 착지한 첫 페이지가 아닐 때 `wx.config`가 반드시 `invalid signature` 오류를 냅니다.

통일 해법: **진입 페이지에서 최초 URL을 기록해 두고 이후 모든 서명에 그것을 사용(iOS)하고, Android는 항상 현재 URL을 사용합니다.**

```typescript
// src/app/wecom/jssdk.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map } from 'rxjs';
import wx from 'weixin-js-sdk';
import { WecomEnvService } from './env.service';

interface WxConfigSignature {
  corpId: string; agentId: string; nonceStr: string;
  timestamp: string; signature: string;
}

@Injectable({ providedIn: 'root' })
export class WecomJssdkService {
  private http = inject(HttpClient);
  private env = inject(WecomEnvService);
  private configPromise: Promise<void> | null = null;

  /** 서명에 참여할 URL 추출: #hash 부분 제거(WeCom 서명 규칙상 url은 hash 미포함) */
  private signableUrl(href: string): string {
    const idx = href.indexOf('#');
    return idx >= 0 ? href.slice(0, idx) : href;
  }

  /** 진입 페이지 URL 기록(iOS에만 필요, 앱이 시작되어 라우트 이동이 일어나기 전에 한 번 호출해야 함) */
  private entryUrl(): string {
    const key = 'wx_ios_entry_url';
    if (this.env.isIOS()) {
      let url = sessionStorage.getItem(key);
      if (!url) {
        url = this.signableUrl(location.href);
        sessionStorage.setItem(key, url);
      }
      return url;
    }
    return this.signableUrl(location.href);   // Android는 현재 페이지 사용
  }

  /** wx.config 완료 보장(전역에서 한 번만 필요, SPA 내에서 재사용 가능) */
  ensureWxConfig(): Promise<void> {
    if (this.configPromise) return this.configPromise;

    this.configPromise = (async () => {
      const url = this.entryUrl();
      const cfg = await firstValueFrom(
        this.http.get<{ code: number; data: WxConfigSignature }>(
          '/api/wecom/jssdk/config', { params: { url } },
        ).pipe(map((r) => r.data)),
      );

      await new Promise<void>((resolve, reject) => {
        wx.config({
          beta: true,                 // 필수! WeCom 전용 인터페이스는 beta:true 필요
          debug: false,
          appId: cfg.corpId,
          agentId: cfg.agentId,
          timeStamp: cfg.timestamp,
          nonceStr: cfg.nonceStr,
          signature: cfg.signature,
          jsApiList: ['getLocation', 'chooseImage', 'scanQRCode'],
        });
        wx.ready(() => resolve());
        wx.error((res: any) => reject(new Error('wx.config 실패: ' + res.errMsg)));
      });
    })();

    return this.configPromise;
  }
}
```

앱 시작 시(라우트 최초 이동 전) 가능한 한 일찍 iOS 진입 URL을 기록하기 위해 `APP_INITIALIZER`를 사용할 수 있습니다:

```typescript
// src/app/app.config.ts에 시작 초기화로 등록
import { APP_INITIALIZER } from '@angular/core';

function recordWxEntryUrl() {
  const jssdk = inject(WecomJssdkService);
  const env = inject(WecomEnvService);
  return () => {
    // ensureWxConfig의 진입 기록 로직을 한 번 호출(iOS는 최초 이동 전 착지 페이지 URL을 고정)
    if (env.isInWecom()) {
      // wx.config 사전 워밍업; 블로킹하지 않아도 되며 실제 위치/스캔 호출 시 service 내부에 안전망이 있음
      jssdk.ensureWxConfig().catch(() => void 0);
    }
  };
}

// providers에 추가:
// { provide: APP_INITIALIZER, useFactory: recordWxEntryUrl, multi: true }
```

> 핵심은 iOS의 진입 URL이 어떤 프런트엔드 라우트 이동보다 먼저 `location.href`를 읽어 고정해야 한다는 것입니다. `APP_INITIALIZER`(Angular 라우트 시작 전 실행)에 두는 것이 가장 안전합니다. 서명을 사전 워밍업하지 않더라도 최소한 이 훅에서 진입 URL을 sessionStorage에 기록해야 합니다.

> 라우트 모드 권장: hash와 서명의 인지 부담을 줄이기 위해 H5 모바일 환경은 **history 모드**를 사용할 수 있습니다. hash 모드를 쓴다면 반드시 위 `signableUrl`로 `#` 지점에서 잘라내어 프런트/백엔드의 서명 참여 URL이 완전히 일치하게 하고, 양쪽 모두 `encodeURIComponent`를 사용하거나 모두 인코딩하지 않도록 일치시켜야 합니다.

### 5.4 지리 위치 기반 체크인

```typescript
// src/app/wecom/device.service.ts
import { Injectable, inject } from '@angular/core';
import wx from 'weixin-js-sdk';
import { WecomJssdkService } from './jssdk.service';

export interface LngLat { longitude: number; latitude: number; accuracy: number; }

@Injectable({ providedIn: 'root' })
export class WecomDeviceService {
  private jssdk = inject(WecomJssdkService);

  /** JS-SDK 위치 조회(gcj02 중국 좌표계, 국내 지도와 일치) */
  getLocation(): Promise<LngLat> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res: any) => resolve({
          longitude: res.longitude,
          latitude: res.latitude,
          accuracy: res.accuracy,
        }),
        fail: (err: any) => reject(new Error('위치 조회에 실패했습니다. 위치 권한을 확인하세요: ' + err.errMsg)),
      });
    }));
  }

  /** 카메라 호출로 사진 촬영(카메라만, 앨범 불가로 부정 방지), localId 반환 */
  takePhoto(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera'],
        sizeType: ['compressed'],
        success: (res: any) => resolve(res.localIds[0]),
        fail: (err: any) => reject(new Error('사진 촬영 실패: ' + err.errMsg)),
      });
    }));
  }

  /** 스캔(좌석/회의실 QR 코드 체크인) */
  scanQRCode(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.scanQRCode({
        needResult: 1,              // 1=프런트엔드가 결과를 받아 직접 처리
        scanType: ['qrCode'],
        success: (res: any) => resolve(res.resultStr),
        fail: (err: any) => reject(new Error('스캔 실패: ' + err.errMsg)),
      });
    }));
  }
}

/** Haversine 거리(미터), 순수 함수는 공통 utils에 배치 가능 */
export function distanceMeters(a: LngLat, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.latitude);
  const dLng = rad(b.lng - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
```

출퇴근 체크인 컴포넌트 호출(`checkin.component.ts`). 안내 메시지는 팀에서 쓰던 UI 라이브러리(예: NG-ZORRO의 `NzMessageService`)를 사용합니다.

```typescript
// src/app/mobile/pages/checkin/checkin.component.ts(발췌)
import { Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { WecomDeviceService, distanceMeters } from '../../../wecom/device.service';
import { CheckinService } from '../../../core/services/checkin.service';

@Component({ selector: 'app-checkin', standalone: true, template: '...' })
export class CheckinComponent {
  private device = inject(WecomDeviceService);
  private checkinApi = inject(CheckinService);
  private msg = inject(NzMessageService);

  private readonly COMPANY = { lat: 30.2741, lng: 120.1551, radius: 200 };

  async onCheckin(): Promise<void> {
    const loc = await this.device.getLocation();
    const dist = distanceMeters(loc, this.COMPANY);
    if (dist > this.COMPANY.radius) {
      this.msg.error(`체크인 범위를 벗어났습니다. 회사로부터 ${Math.round(dist)}m`);
      return;
    }
    await firstValueFrom(this.checkinApi.submit({
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      distance: Math.round(dist),
    }));
    this.msg.success('체크인 성공');
  }
}
```

백엔드 체크인 인터페이스는 시스템의 기존 구현과 동일합니다(거리 재검증, 중복 체크인 방지, DB 저장, 푸시). 이 로직들은 이미 오래전부터 존재하며, H5는 단지 새로운 호출자일 뿐입니다. 백엔드는 **반드시 거리를 다시 검증해야 하며**, 프런트엔드가 전달한 위도·경도를 그대로 신뢰해서는 안 됩니다(프런트엔드 좌표는 패킷 캡처로 변조될 수 있습니다).

### 5.5 사진 촬영 체크인과 QR 코드 스캔 체크인

사진 촬영과 QR 스캔은 이미 5.4의 `WecomDeviceService`에 캡슐화되어 있습니다(`takePhoto()`는 localId를 반환하고 `scanQRCode()`는 QR 코드 내용을 반환). 컴포넌트에서 그대로 await로 호출하면 됩니다. `takePhoto`로 얻은 localId 이미지는 업로드가 한 번 더 필요합니다.

- `wx.uploadImage`로 먼저 이미지를 기업위챗에 업로드해 `serverId`를 얻은 뒤, 백엔드가 다시 기업위챗 미디어 인터페이스 `media/get`을 호출해 인트라넷으로 가져오는 방식 — H5에서 파일을 직접 업로드하고 싶지 않은 시나리오에 적합합니다.
- 또는 localId를 canvas에 그려 Blob으로 변환한 뒤, Angular의 `FormData` + `HttpClient`로 기존 파일 서비스에 직접 POST하여 시스템에 이미 존재하는 첨부 파일 저장소를 재사용하는 방식.

두 방식 모두 백엔드는 기존의 사진 저장 및 워터마크(시간 + 위치 + 기기 정보) 로직을 그대로 사용합니다. QR 스캔 체크인의 경우 백엔드가 QR 코드 토큰의 유효성과 만료 시간을 검증하고, 위치 정보 이중 검증을 추가 적용하며, 마찬가지로 기존 인터페이스를 재사용합니다.
## 6. Activiti 복잡한 결재 흐름을 기업위챗에서 구현하기

근태와 관련된 결재(근태 보정, 휴가, 외근, 초과근무 이의신청 등) 흐름은 이미 Activiti에 정의되어 동작하고 있으므로, 기업위챗 쪽에서 흐름을 다시 구현할 필요는 없습니다. 단지 세 가지만 하면 됩니다. **결재 대기 태스크를 꺼내 보여주고, 결재 조작을 연결하고, 결재 대기 태스크를 기업위챗으로 능동 푸시하는 것**입니다. 이 장에서는 회람(전원 승인), 또는결재(아무 1명 승인), 조직도 기반 결재라는 세 가지 대표 노드를 다루며 재사용 방법을 설명합니다.

### 6.1 먼저 처리자 식별자를 통일하세요

Activiti는 작업 처리자(`ACT_RU_TASK.ASSIGNEE_`) 또는 후보자/후보 그룹(`ACT_RU_IDENTITYLINK`)을 문자열 하나로 식별합니다. 반드시 보장해야 할 점: **흐름 정의에 하드코딩되었거나 런타임에 계산된 처리자 식별자가 `sys_user.username`(내부 계정, 즉 wecom_user_id에 바인딩된 그 유일 키)과 일치해야 합니다**.

전 시스템에서 유일한 인원 식별자로 사번/사용자명(예: `zhangsan`)을 일관되게 사용하는 것을 권장합니다.

- Activiti assignee / candidateUser = `sys_user.username`
- 기업위챗 매핑 = `sys_user.wecom_user_id`(많은 기업에서 이 또한 사번이라 둘이 같을 수 있지만 논리적으로는 분리됩니다)
- 기업위챗 메시지 푸시 시: `username → sys_user 조회 → wecom_user_id 획득`을 `touser`로 사용

이렇게 하면 Activiti의 흐름 정의, UEL 표현식, 후보자 조회 어디에도 기업위챗을 위한 변경이 필요 없습니다.

### 6.2 흐름 정의에서 세 가지 대표 노드 표현하기

"근태 보정 신청" 흐름을 예로 들어 회람, 또는결재, 조직도 기반 결재를 BPMN에 작성하는 방법을 보입니다.

**회람(여러 명이 모두 동의해야 통과)** — 다중 인스턴스 노드(multiInstanceLoopCharacteristics) + 완료 조건을 사용합니다.

```xml
<userTask id="countersignLeaderHr" name="직속 상위자와 HR 회람">
  <documentation>모든 인원이 결재하고 모두 동의해야 통과하며, 한 명이라도 반려하면 종료됩니다</documentation>
  <multiInstanceLoopCharacteristics isSequential="false"
                                   activiti:collection="${countersignUsers}"
                                   activiti:elementVariable="approver">
    <completionCondition>${approveResultList.size() == nrOfInstances
        &amp;&amp; !approveResultList.contains('REJECT')}</completionCondition>
  </multiInstanceLoopCharacteristics>
  <userTask><extensionElements/></userTask>
</userTask>
```

- `isSequential="false"`: 병렬 회람으로, 각 인원에게 동시에 task가 하나씩 생성됩니다.
- `nrOfInstances`: 회람 총인원. `approveResultList`: 각 인원의 결재 결론을 모으는 흐름 변수입니다.
- 완료 조건: 모든 인원이 처리했고 REJECT가 없을 때만 다음 단계로 진행합니다.

**또는결재(여러 명 중 아무나 한 명만 처리하면 됨)** — 역시 다중 인스턴스지만 완료 조건을 "1개 처리되면 종료"로 바꿉니다. 더 일반적인 방식은 후보자(candidateUsers)를 쓰는 것으로, 하나의 작업을 여러 명이 볼 수 있고 먼저 수령(claim)한 사람이 처리합니다.

```xml
<userTask id="orSignDuty" name="당직조 또는결재" activiti:candidateUsers="${dutyGroupUsers}">
  <documentation>후보 그룹 중 아무나 한 명이 수령 후 결재하면 됩니다</documentation>
</userTask>
```

또는 다중 인스턴스 + `nrOfCompletedInstances >= 1`로 각자에게 대기 태스크가 하나씩 생기게 하고, 한 명이 처리하면 나머지는 자동으로 취소되도록 구현할 수도 있습니다.

**조직도 기반 동적 결재** — 처리자를 하드코딩하지 않고 흐름 표현식이 조직도에서 실시간으로 계산합니다(신청인 → 직속 부서 책임자 → 담당 임원).

```xml
<userTask id="deptLeaderApprove" name="부서 책임자 결재"
          activiti:assignee="${orgService.findLeader(applyUserId)}"/>
<userTask id="directorApprove" name="담당 임원 결재"
          activiti:assignee="${orgService.findDirector(applyUserId)}"/>
```

`orgService`는 Activiti 표현식 컨텍스트에 등록된 Spring Bean으로, 내부에서 부서 트리를 따라 위로 올라가며 책임자를 조회합니다. 부서 책임자가 보직 이동하더라도 새로운 흐름 인스턴스는 자동으로 최신 조직도에 따라 라우팅되므로 흐름 정의를 변경할 필요가 없습니다.

> 이 BPMN은 PC에서 이미 동작하고 있습니다. 기업위챗 쪽에는 "처리 진입점"이 하나 추가될 뿐이고, 처리 동작의 하부에서 호출되는 것은 동일한 `taskService.complete()`이므로, 회람 카운트, 또는결재 수령, 조직 라우팅, 게이트웨이 조건 모두 엔진이 일치를 보장합니다. "PC에서 진행되는 흐름과 휴대폰에서 진행되는 흐름이 다르다"는 문제는 존재하지 않습니다.

### 6.3 기업위챗 쪽 결재 대기 태스크 목록과 상세

**결재 대기 태스크 목록** — Activiti의 TaskQuery를 그대로 사용해 현재 로그인한 사용자의 username으로 대기 태스크를 조회합니다(회람 시에는 각자에게 task가 하나씩 있고, 또는결재 후보 작업은 taskCandidateUser로 조회합니다).

```java
/**
 * 모바일 결재 Service(Activiti TaskService 재사용)
 *
 * @author cuckoom
 */
@Service
public class MobileApprovalService {

    @Resource
    private TaskService taskService;
    @Resource
    private HistoryService historyService;
    @Resource
    private RepositoryService repositoryService;

    /** 현재 사용자의 대기 태스크(직접 지정 + 또는결재 후보, 미수령 포함) */
    public List<TodoVO> listMyTodo(String username) {
        List<Task> owned = taskService.createTaskQuery()
                .taskAssignee(username)
                .active()
                .orderByTaskCreateTime().desc()
                .list();

        List<Task> candidate = taskService.createTaskQuery()
                .taskCandidateUser(username)
                .active()
                .list();

        return Stream.concat(owned.stream(), candidate.stream())
                .distinct()
                .map(this::toTodoVO)
                .collect(Collectors.toList());
    }

    private TodoVO toTodoVO(Task task) {
        Map<String, Object> vars = taskService.getVariables(task.getId());
        BpmnModel model = repositoryService.getBpmnModel(task.getProcessDefinitionId());
        String nodeType = readNodeType(model, task.getTaskDefinitionKey()); // COUNTERSIGN/ORSIGN/NORMAL

        return TodoVO.builder()
                .taskId(task.getId())
                .processInstanceId(task.getProcessInstanceId())
                .title(String.valueOf(vars.getOrDefault("title", task.getName())))
                .nodeName(task.getName())
                .nodeType(nodeType)
                .applyUserName(String.valueOf(vars.get("applyUserName")))
                .createTime(task.getCreateTime())
                .candidate(Objects.isNull(task.getAssignee()))  // 또는결재 미수령
                .build();
    }
}
```

**결재 상세** — 양식, 회람 진행 상황(누가 동의했고 누가 대기 중인지), 결재 의견 타임라인을 표시합니다.

```java
/** 회람 진행 상황: 과거 작업 + 현재 작업에서 각 처리자의 상태를 집계 */
public List<ApproverProgressVO> countersignProgress(String processInstanceId) {
    List<HistoricTaskInstance> done = historyService.createHistoricTaskInstanceQuery()
            .processInstanceId(processInstanceId)
            .finished()
            .list();
    List<Task> pending = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .list();
    // 병합: done에는 결재 의견(COMMENT)이 포함되고, pending은 "결재 대기"로 표시
    // 조립은 생략, [{user, userName, status: APPROVED/REJECTED/PENDING, comment, time}] 반환
    return mergeProgress(done, pending);
}
```

프런트엔드의 `ApprovalDetailComponent`는 `nodeType`에 따라 렌더링합니다. 회람이면 여러 아바타로 된 진행 표시줄(처리 완료/대기 중)을 보여 주고, 또는결재이면 "당직조 멤버 누구나 결재할 수 있습니다. 탭하여 수령 후 처리하세요"를 표시합니다.

### 6.4 수령(또는결재)과 결재 조작

또는결재 후보 작업은 먼저 수령(claim)하여 assignee가 되어야 처리할 수 있습니다. 회람 작업은 직접 지정 방식이므로 수령을 건너뜁니다.

```java
@Transactional(rollbackFor = Exception.class)
public void approve(String taskId, String username, boolean agree, String comment) {
    Task task = taskService.createTaskQuery().taskId(taskId).active().singleResult();
    if (task == null) {
        throw new BusinessException(ErrorCode.TASK_NOT_FOUND, "대기 태스크가 존재하지 않거나 이미 처리되었습니다");
    }

    // 또는결재: 후보자 작업은 먼저 수령
    if (task.getAssignee() == null) {
        boolean isCandidate = taskService.createTaskQuery()
                .taskId(taskId).taskCandidateUser(username).count() > 0;
        if (!isCandidate) {
            throw new BusinessException(ErrorCode.NO_PERMISSION, "이 작업을 처리할 권한이 없습니다");
        }
        taskService.claim(taskId, username);
    } else if (!username.equals(task.getAssignee())) {
        throw new BusinessException(ErrorCode.NO_PERMISSION, "이 작업은 귀하에게 속하지 않습니다");
    }

    // 결재 의견 기록
    Authentication.setAuthenticatedUserId(username);
    taskService.addComment(taskId, task.getProcessInstanceId(),
            (agree ? "동의: " : "반려: ") + comment);

    // 흐름 변수 기록: 회람 완료 조건이 approveResultList에 의존
    Map<String, Object> vars = new HashMap<>();
    if (isCountersign(task)) {
        @SuppressWarnings("unchecked")
        List<String> results = (List<String>) taskService.getVariable(taskId, "approveResultList");
        if (results == null) results = new ArrayList<>();
        results.add(agree ? "APPROVE" : "REJECT");
        vars.put("approveResultList", results);
    }
    vars.put("approved", agree);

    taskService.complete(taskId, vars);

    // 결재 후 처리: 다음 노드 대기 태스크 푸시, 흐름 종료 시 근태 연동(6.5, 6.6 참고)
    afterTaskComplete(task.getProcessInstanceId(), agree);
}
```

반려 정책은 기업 규칙에 따라 선택할 수 있습니다: 신청인에게 반려(재제출), 이전 노드로 반려, 또는 흐름을 바로 종료. 근태 보정 시나리오에는 "한 명이라도 반려하면 종료 + 신청인 통지"가 자주 쓰이며, 이는 회람 완료 조건의 `!contains('REJECT')` 의미와 정확히 일치합니다.

### 6.5 결재와 근태 데이터 연동(기존 기능 그대로 사용)

흐름이 종료될 때 비즈니스 유형에 따라 근태에 다시 기록하는 이 로직은 시스템에 이미 존재합니다. 기업위챗 쪽 결재가 트리거하는 것도 동일한 `taskService.complete()`이므로 연동은 당연히 적용됩니다. 근태 보정의 전형적인 처리:

```java
public void afterProcessFinished(String processInstanceId) {
    // 흐름 종료 후 흐름 인스턴스 변수는 히스토리 테이블로 이관되므로 HistoricVariableInstance에서 비즈니스 변수를 가져옴
    Map<String, Object> vars = historyService.createHistoricVariableInstanceQuery()
            .processInstanceId(processInstanceId)
            .list()
            .stream()
            .collect(Collectors.toMap(HistoricVariableInstance::getVariableName,
                    HistoricVariableInstance::getValue, (a, b) -> a));
    String bizType = String.valueOf(vars.get("bizType"));     // MAKEUP / LEAVE / OVERTIME
    Boolean approved = (Boolean) vars.get("approved");

    if (!Boolean.TRUE.equals(approved)) {
        notifyApplicant(processInstanceId, false);   // 반려 통지
        return;
    }

    switch (bizType) {
        case "MAKEUP":
            // 근태 보정 통과: 해당 날짜의 체크인 기록을 수정/보완 등록(기존 근태 Service)
            attendanceService.applyMakeupCard(
                (Long) vars.get("recordId"),
                (String) vars.get("makeupTime"),
                String.valueOf(vars.get("reason")));
            break;
        case "LEAVE":
            // 휴가 통과: 휴가 기록, 휴가 잔여 일수 차감
            leaveService.grantLeave(vars);
            break;
        default:
            break;
    }
    notifyApplicant(processInstanceId, true);
}
```

각 결재 인터페이스에서 수동으로 호출하는 것보다 Activiti 흐름 종료 이벤트를 리스닝하여 트리거하는 편이 더 안정적입니다(PC, 기업위챗, 스케줄링 작업 등 어떤 진입점에서 완료하더라도 거치게 됩니다).

```java
import org.activiti.engine.delegate.event.ActivitiEntityEvent;
import org.activiti.engine.delegate.event.ActivitiEvent;
import org.activiti.engine.delegate.event.ActivitiEventListener;
import org.activiti.engine.delegate.event.ActivitiEventType;

/**
 * Activiti 흐름 종료 리스너: 결재가 최종 종료된 뒤 근태와 연동
 * RuntimeService.addEventListener(...) 또는 ProcessEngineConfiguration으로 등록
 */
@Component
public class ApprovalProcessListener implements ActivitiEventListener {

    @Resource
    private ApprovalFlowService approvalFlowService;

    @Override
    public void onEvent(ActivitiEvent event) {
        if (event.getType() == ActivitiEventType.PROCESS_COMPLETED) {
            approvalFlowService.afterProcessFinished(event.getProcessInstanceId());
        }
    }

    @Override
    public boolean isFailOnException() {
        return false;   // 리스너 예외가 흐름 자체에 영향을 주지 않음
    }
}
```

### 6.6 결재 대기 태스크를 기업위챗으로 능동 푸시

H5 대기 태스크 목록만으로는 부족합니다 — 직원이 스스로 들어가서 새로고침하지는 않기 때문입니다. 흐름이 전환되어 새로운 대기 태스크가 생기면, 백엔드는 능동적으로 "결재 카드"를 다음 처리자의 기업위챗으로 푸시해야 합니다. 카드를 탭하면 바로 H5의 해당 결재 상세 페이지가 열리고, 4장의 자동 로그인(SSO) 덕분에 열자마자 로그인된 상태입니다.

작업 생성 리스너에서 푸시를 트리거합니다(Activiti 이벤트 리스너).

```java
import org.activiti.engine.delegate.event.ActivitiEntityEvent;
import org.activiti.engine.delegate.event.ActivitiEventListener;
import org.activiti.engine.delegate.event.ActivitiEventType;
import org.activiti.engine.impl.persistence.entity.TaskEntity;
import org.activiti.engine.task.IdentityLink;

@Component
public class WecomTodoPushListener implements ActivitiEventListener {

    @Resource private WecomMessageService wecomMessageService;
    @Resource private SysUserMapper userMapper;
    @Resource private TaskService taskService;

    @Override
    public void onEvent(org.activiti.engine.delegate.event.ActivitiEvent event) {
        if (event.getType() != ActivitiEventType.TASK_CREATED) return;
        TaskEntity task = (TaskEntity) ((ActivitiEntityEvent) event).getEntity();

        // 직접 지정(회람은 각자에게 작업 하나씩) → assignee에게 푸시
        if (StrUtil.isNotBlank(task.getAssignee())) {
            pushToUser(task, task.getAssignee());
        } else {
            // 또는결재 후보 작업 → 모든 후보자/후보 그룹을 펼친 멤버에게 푸시하고, 진입 후 선착순으로 수령
            for (IdentityLink link : taskService.getIdentityLinksForTask(task.getId())) {
                if (StrUtil.isNotBlank(link.getUserId())) {
                    pushToUser(task, link.getUserId());
                } else if (StrUtil.isNotBlank(link.getGroupId())) {
                    // 후보 그룹: 그룹으로 멤버 username을 조회한 뒤 하나씩 푸시(구현 생략)
                    userMapper.findUsernamesByGroup(link.getGroupId())
                            .forEach(username -> pushToUser(task, username));
                }
            }
        }
    }

    private void pushToUser(TaskEntity task, String username) {
        SysUser u = userMapper.findByUsername(username);
        if (u == null || StrUtil.isBlank(u.getWecomUserId())) {
            log.warn("사용자 {}가 기업위챗에 바인딩되지 않아 대기 태스크 푸시를 건너뜁니다", username);
            return;
        }
        wecomMessageService.sendApprovalTodoCard(u.getWecomUserId(), task);
    }

    @Override
    public boolean isFailOnException() {
        return false;   // 푸시 실패가 Activiti 작업 생성을 롤백해서는 안 됨
    }
}
```

텍스트 카드 메시지(탭하면 바로 H5 결재 페이지로 이동):

```json
{
  "touser": "wangwu",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "결재 대기: 이사의 근태 보정 신청",
    "description": "노드: 직속 상위자 결재<br/>보정 일자: 2026-09-08 오전<br/>사유: 외근 고객사 현장에서 체크인을 잊음",
    "url": "https://attendance.yourcompany.com/mobile/approval/123456",
    "btntxt": "지금 결재"
  }
}
```

핵심: **카드 url을 결재 상세 페이지까지 바로 연결**하는 것입니다. 직원이 탭하면 → 토큰 없음 → 4장 OAuth 자동 로그인(SSO) → 콜백 후 `state`에 담은 리다이렉트 복귀 경로(4.3의 redirectPath 참고)를 통해 이 결재 상세로 돌아옵니다. 이 효과를 구현하려면 메시지 카드 링크에 기업위챗이 정한 자동 로그인 파라미터를 붙이거나, 프런트엔드 가드가 모든 `/mobile/**`에 로그인을 강제하기만 하면 되며 특별한 처리는 필요 없습니다.

**템플릿 카드 버튼 콜백(고급: 페이지를 열지 않고 바로 동의/반려)**

결재자가 메시지 알림에서 바로 "동의/거절"을 누르게 하려면 `template_card`(button_interaction) + 6장의 콜백 수신을 사용합니다. 백엔드가 버튼 이벤트를 받으면 바로 `mobileApprovalService.approve()`를 호출한 뒤 카드 상태를 갱신합니다. 이 방식은 결재 동작이 극도로 단순한(원클릭 동의) 노드에 적합하고, 의견 작성이나 회람 상세 확인이 필요한 경우에는 여전히 H5로 이동하는 것을 권장합니다. 두 방식 모두 하부에서 호출하는 결재 메서드는 완전히 동일합니다.

### 6.7 조직도 동기화: 동적 결재자에게 푸시가 닿도록 보장

"조직도 기반 결재"로 동적 계산된 처리자는 username이므로, 푸시 시 그의 wecom_user_id를 조회할 수 있어야 합니다. 두 가지 보장 방식이 있습니다.

1. **주소록 콜백 증분 동기화**(권장, 실시간): `change_contact` 이벤트(멤버 추가/수정/삭제, 부서 변경)를 구독하여 `sys_user`의 wecom_user_id와 부서 소속을 실시간으로 갱신합니다.
2. **스케줄링 전량 동기화**: 매일 새벽에 주소록 부서/멤버 인터페이스를 호출해 전량을 한 번 맞추며, 이를 폴백(안전망)으로 사용합니다.

```
GET /cgi-bin/department/list?id=0            # 부서 트리
GET /cgi-bin/user/list?department_id=1&fetch_child=1   # 부서 멤버 상세
```

동기화 시에는 사번(username)으로 맞추고, 기업위챗 userid를 `sys_user.wecom_user_id`에 채워 넣고 부서 관계도 동기화하여 `orgService.findLeader()` 조직 라우팅과 푸시 주소 지정에 사용합니다. 주소록 읽기 인터페이스에는 일일 호출 한도가 있으므로(9.4 참고), 반드시 "증분 콜백을 주로 사용 + 매일 1회 전량 폴백"으로 하고 고빈도 폴링은 하지 마세요.
## 7. 메시지 푸시와 이벤트 콜백

### 7.1 access_token과 메시지 발송

애플리케이션 메시지는 서비스단에서 일괄 발송하며, 인터페이스는 다음과 같습니다.

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

자주 쓰는 메시지 유형:

- `text`: 근태 알림 등 순수 텍스트
- `textcard`: 제목 + 설명 + 버튼, 탭하면 H5로 이동(결재 대기 태스크에 가장 적합)
- `template_card`: 인터랙티브 버튼이 있어 알림 내에서 바로 조작 가능(콜백과 함께 사용)
- `markdown`: 결재 요약 등 리치 텍스트(기업위챗 내에서 지원)

푸시 서비스 캡슐화(`duplicate_check_interval`은 짧은 시간 내 중복 푸시를 방지하는 데 사용):

```java
@Service
@Slf4j
public class WecomMessageService {

    @Resource private WecomTokenManager tokenManager;
    @Resource private RestTemplate restTemplate;
    @Value("${wecom.agentid}") private Integer agentId;

    /** 결재 대기 카드 발송, 탭하면 H5 결재 상세로 이동 */
    public void sendApprovalTodoCard(String wecomUserId, Task task) {
        Map<String, Object> card = new HashMap<>();
        card.put("title", "결재 대기: " + task.getName());
        card.put("description", "새로운 결재 대기 태스크가 하나 있어 처리가 필요합니다");
        card.put("btntxt", "지금 결재");
        card.put("url", "https://attendance.yourcompany.com/mobile/approval/" + task.getId());

        Map<String, Object> msg = new HashMap<>();
        msg.put("touser", wecomUserId);
        msg.put("msgtype", "textcard");
        msg.put("agentid", agentId);
        msg.put("textcard", card);
        msg.put("duplicate_check_interval", 1800);

        send(msg);
    }

    public void send(String msg) { /* message/send로 POST, invaliduser/errcode 기록 */ }
}
```

> 응답 본문의 `invaliduser`/`invalidparty`는 반드시 기록하세요. 푸시 대상 중 바인딩되지 않았거나 표시 범위 밖인 사람이 있다는 뜻으로, "왜 어떤 사람은 대기 태스크 알림을 받지 못하는가"를 추적할 때 첫 번째 단서입니다.

### 7.2 콜백 서명 검증과 암호화/복호화

"메시지 수신"을 설정하면 기업위챗은 콜백 URL로 두 종류의 요청을 보냅니다.

- **GET**: 설정 저장 시의 URL 유효성 검증으로, `echostr`을 복호화하여 원문 그대로 반환해야 합니다.
- **POST**: 정식 이벤트 푸시(템플릿 카드 버튼, 주소록 변경)로, 암호문 XML이며 서명 검증 + AES 복호화가 필요합니다.

```java
@RestController
@RequestMapping("/api/wecom/callback")
@Slf4j
public class WecomCallbackController {

    @Resource private WecomCallbackService callbackService;

    /** URL 검증 */
    @GetMapping("/message")
    public String verify(@RequestParam("msg_signature") String signature,
                         @RequestParam String timestamp,
                         @RequestParam String nonce,
                         @RequestParam String echostr) {
        try {
            return callbackService.verifyUrl(signature, timestamp, nonce, echostr);
        } catch (Exception e) {
            log.error("기업위챗 콜백 URL 검증 실패", e);
            return "";
        }
    }

    /** 이벤트 수신: 반드시 빠르게 success를 반환하고, 오래 걸리는 처리는 비동기로 두어 기업위챗 재시도를 방지 */
    @PostMapping(value = "/message", produces = "application/xml")
    public String receive(@RequestParam("msg_signature") String signature,
                          @RequestParam String timestamp,
                          @RequestParam String nonce,
                          @RequestBody String encryptedBody) {
        try {
            callbackService.handleAsync(signature, timestamp, nonce, encryptedBody);
        } catch (Exception e) {
            log.error("기업위챗 콜백 처리 실패", e);
        }
        return "success";   // 비즈니스 성패와 무관하게 먼저 success를 반환해 지수 백오프 재시도를 방지
    }
}
```

암호화/복호화를 직접 구현하지는 말고, 공식 `aes-256` 예제 코드 패키지(기업위챗이 공식 제공하는 Java판 `WXBizMsgCrypt`)를 바로 사용하세요. 여기에는 SHA1 서명 검증, AES-256-CBC 복호화, corpId 검증, XML 조립이 캡슐화되어 있습니다. `Token`, `EncodingAESKey`, `corpid` 세 파라미터는 관리자 콘솔의 콜백 설정에서 가져옵니다.

### 7.3 템플릿 카드 버튼과 주소록 이벤트 처리

```java
@Service
@Slf4j
public class WecomCallbackService {

    @Resource private MobileApprovalService approvalService;
    @Resource private ContactSyncService contactSyncService;
    @Resource private WXBizMsgCrypt crypt;   // 공식 암호화/복호화 클래스

    /** 복호화 후 이벤트 유형에 따라 분기 */
    public void handle(String sig, String ts, String nonce, String body) throws Exception {
        String xml = crypt.DecryptMsg(sig, ts, nonce, body);
        // XStream/Digester로 XML을 파싱하여 Event / ChangeType / TaskId / EventKey / FromUserName 추출
        CallbackEvent event = CallbackEvent.parse(xml);

        switch (event.getEvent()) {
            case "template_card_event":
                // 템플릿 카드 버튼: EventKey가 버튼 key, FromUserName이 탭한 사람의 userid
                onCardButton(event);
                break;
            case "change_contact":
                contactSyncService.handleChange(event.getChangeType(), event.getUserId());
                break;
            default:
                log.info("처리하지 않는 기업위챗 이벤트: {}", xml);
        }
    }

    private void onCardButton(CallbackEvent e) {
        boolean agree = "approve".equals(e.getEventKey());
        String username = contactSyncService.wecomUserIdToUsername(e.getFromUserName());
        // task_id는 카드 발송 시 우리가 생성해 Activiti taskId와 연결해 두고, Redis/DB에 저장했다 가져옴
        String taskId = taskCardMapping.get(e.getTaskId());
        approvalService.approve(taskId, username, agree, agree ? "동의" : "반려");
        // update_template_card를 호출해 원래 카드를 "동의됨/반려됨"으로 갱신해 중복 탭을 방지할 수 있음
    }
}
```

이벤트 처리는 반드시 **멱등**이어야 합니다. 기업위챗은 타임아웃 시 같은 이벤트를 다시 푸시할 수 있는데, `approve` 내부에서 "작업이 이미 종료됨/이미 처리됨"을 판단하므로(6.4에서 active 작업을 조회), 중복 푸시가 2차 결재를 만들지 않습니다. 오래 걸리는 작업(여러 메시지 발송, 여러 테이블 기록 등)은 비동기 스레드나 메시지 큐로 넘겨 콜백이 초 단위로 `success`를 반환하도록 보장하세요.

## 8. 서비스단 인프라스트럭처

### 8.1 access_token / jsapi_ticket 중앙 관리

두 티켓 모두 유효기간은 7200초이고 같은 기업·같은 애플리케이션에서 유일하며(중복 획득 시 이전 것이 무효화됨), 반드시 서비스단에서 중앙 캐싱해야 합니다. 다중 인스턴스 배포 시 분산 락으로 한 인스턴스만 갱신하도록 보장합니다.

```java
@Component
@Slf4j
public class WecomTokenManager {

    private static final String TOKEN_KEY = "wecom:access_token";
    private static final String LOCK_KEY  = "wecom:access_token:lock";
    private static final long EXPIRE_SECONDS = 7100;   // 7200보다 100초 여유를 둠

    @Value("${wecom.corpid}") private String corpId;
    @Value("${wecom.secret}") private String secret;
    @Resource private StringRedisTemplate redis;
    @Resource private RestTemplate restTemplate;

    public String getAccessToken() {
        String cached = redis.opsForValue().get(TOKEN_KEY);
        if (StrUtil.isNotBlank(cached)) return cached;

        Boolean locked = redis.opsForValue().setIfAbsent(LOCK_KEY, "1", 10, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(locked)) return waitForToken();   // 다른 인스턴스가 갱신하기를 기다림

        try {
            String again = redis.opsForValue().get(TOKEN_KEY);      // 이중 확인
            if (StrUtil.isNotBlank(again)) return again;
            return refresh();
        } finally {
            redis.delete(LOCK_KEY);
        }
    }

    private String refresh() {
        String url = String.format(
            "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=%s&corpsecret=%s", corpId, secret);
        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR, "access_token 획득 실패");
        }
        String token = resp.getString("access_token");
        redis.opsForValue().set(TOKEN_KEY, token, EXPIRE_SECONDS, TimeUnit.SECONDS);
        return token;
    }

    private String waitForToken() {
        for (int i = 0; i < 10; i++) {
            sleep(200);
            String t = redis.opsForValue().get(TOKEN_KEY);
            if (StrUtil.isNotBlank(t)) return t;
        }
        throw new BusinessException(ErrorCode.WECOM_API_ERROR, "access_token 획득 타임아웃");
    }

    public String getCorpId() { return corpId; }
}
```

`jsapi_ticket`, agent_config ticket은 완전히 동일한 패턴으로 각각 독립 캐싱하면 됩니다(캐시 key는 분리).

### 8.2 민감 설정 분리

corpid/agentid는 공개되어도 되지만, secret, 콜백 Token, EncodingAESKey는 반드시 환경 변수나 설정 센터로 주입하고 Git에 올리지 마세요.

```yaml
# application-prod.yml
wecom:
  corpid: ${WECOM_CORPID}
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  oauth:
    redirect: https://attendance.yourcompany.com/mobile/oauth/callback
  jssdk:
    # 서명에 참여하는 프런트엔드 도메인, 백엔드 검증/링크 생성에 사용
    frontend-base: https://attendance.yourcompany.com
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}
```

### 8.3 인터페이스 보안

- OAuth 로그인 엔드포인트, 기업위챗 콜백 엔드포인트는 통과시키고, 나머지는 모두 기존 JWT 인증을 거칩니다.
- `state` 일회성 난수 문자열 + sessionStorage 검증으로 CSRF를 방지합니다.
- code는 한 번만 사용할 수 있고 유효기간 5분이며, 백엔드가 받으면 즉시 교환하고 절대 캐싱하지 않습니다.
- 체크인 좌표는 백엔드가 거리를 재검증하고 프런트엔드를 신뢰하지 않습니다. 사진에는 워터마크를 추가하고, QR 스캔에는 위치 정보를 추가 적용합니다.
- 콜백 인터페이스는 서명 검증 + AES 복호화 + corpId 검증으로 위조 이벤트를 거부합니다.
- 핵심 인터페이스는 요청 제한(Redis 슬라이딩 윈도우)을 걸어 자동 호출을 방지합니다.

### 8.4 주소록 동기화 서비스

```java
@Service
public class ContactSyncService {

    /** 전량 동기화(매일 새벽 폴백) */
    public void syncAll() {
        String token = tokenManager.getAccessToken();
        // 1. 부서 트리 department/list
        // 2. 말단 부서를 순회하며 user/list?fetch_child=1로 멤버를 가져옴
        // 3. 사번으로 sys_user.username에 맞추고, wecom_user_id, 부서, 이름, 휴대폰, 상태를 채워 넣음
        // 4. 기업위챗 status=5(퇴사)/멤버 삭제 이벤트 → 시스템 계정을 비활성화
    }

    /** 증분 이벤트(실시간) */
    public void handleChange(String changeType, String wecomUserId) {
        switch (changeType) {
            case "create_user": case "update_user": upsertOne(wecomUserId); break;
            case "delete_user": disableByWecomUserId(wecomUserId); break;
            // 부서 변경은 부서 테이블로 동기화하여 orgService.findLeader 조직 라우팅에 사용
            default: break;
        }
    }

    public String wecomUserIdToUsername(String wecomUserId) {
        return userMapper.findUsernameByWecomId(wecomUserId);
    }
}
```

## 9. 네트워크 격리 환경의 공개 중계 게이트웨이

앞 장들은 백엔드 서비스가 기업위챗 클라우드와 사용자 휴대폰에서 직접 접근 가능하다고 가정했습니다. 하지만 많은 기업의 근태 시스템은 **인트라넷 격리 구역**에 배포됩니다: 공인 IP가 없고, 인바운드 접근이 허용되지 않으며, 심지어 서버 스스로도 공개망으로 직접 나갈 수 없는 경우가 있습니다. 기업위챗 서버는 공개망에 있고, 휴대폰은 기업 인트라넷 밖(외근 4G/5G)에 있어 둘 다 이 시스템에 직접 접근할 수 없습니다. 이때 DMZ(격리 구역)에 **공개 중계 게이트웨이**를 별도로 배포해야 합니다. 한쪽은 기업위챗과 휴대폰이 접근 가능하고, 다른 한쪽은 통제된 채널을 통해 인트라넷 근태 시스템에 접근할 수 있는 구조입니다.

### 9.1 네트워크 현황과 목표

전형적인 현황:

- 인트라넷 근태 시스템(SpringBoot + PostgreSQL + Redis + Activiti)은 사무망에만 개방되며, 주소는 예를 들어 `http://10.10.20.30:8080`입니다.
- 인트라넷 경계 방화벽은 기본적으로 모든 공개망 인바운드를 거부합니다.
- 휴대폰이 기업위챗에 접속하면(특히 외근 시) 트래픽이 공개망을 경유하므로 `10.x` 인트라넷 주소로 라우팅할 수 없습니다.
- 기업위챗의 OAuth 콜백, JS-SDK 신뢰 도메인, 이벤트 콜백은 모두 **공개망에서 도달 가능하고 ICP 비안을 마친 HTTPS 도메인**을 요구합니다.

목표:

- 사용자 휴대폰의 H5 페이지가 정상적으로 로드되고, 자동 로그인(SSO)을 완료하고, 근태와 결재 인터페이스를 호출할 수 있어야 합니다.
- 기업위챗 클라우드가 OAuth 인가 결과와 메시지 카드 이벤트 콜백을 전달할 수 있어야 합니다.
- 인트라넷 시스템은 **공개망에 직접 노출되지 않고**, 데이터베이스, Activiti, 비즈니스 로직은 계속 안전하게 인트라넷에 남아 있어야 합니다.
- 공개망 쪽이 뚫리더라도 영향 범위가 게이트웨이로 제한되어, 비즈니스 DB에 직접 닿거나 인트라넷으로 수평 이동할 수 없어야 합니다.

### 9.2 두 가지 연결 방식

| 방식 | 연결 방향 | 적용 전제 | 특징 |
|------|----------|----------|------|
| 방식 1: DMZ 게이트웨이 + 방화벽 화이트리스트 역방향 프록시 | DMZ 게이트웨이 → 인트라넷(경계 방화벽이 지정 포트 개방) | 방화벽에 "DMZ→인트라넷" 제한 접근 정책을 구성할 수 있음 | 가장 흔하고, 경로가 짧고, 성능이 좋고, 감사 로그가 명확 — **본문에서 주력으로 권장** |
| 방식 2: 인트라넷이 능동적으로 접속하는 리버스 터널 | 인트라넷 → DMZ/공개망으로 능동적 터널 구축(frp/WireGuard) | 인트라넷이 어떤 인바운드도 전혀 허용하지 않고 아웃바운드만 허용 | 경계에 인바운드 정책을 열 필요가 없고 터널링(방화벽 통과) 능력이 강함; 운영과 감사가 더 복잡 |

대부분의 기업은 방식 1을 선택합니다: DMZ에 게이트웨이 서버를 한 대 두고, 경계 방화벽에는 "게이트웨이 IP → 인트라넷 근태 서비스 IP:포트" 단 한 줄의 화이트리스트 규칙만 개방합니다. 보안 정책이 너무 엄격해 DMZ에서도 인트라넷에 능동 연결할 수 없다면 방식 2로 인트라넷에서 능동적으로 접속합니다(9.7 참고).

### 9.3 권장 아키텍처: 게이트웨이를 "기업위챗 어댑터 계층"으로 설계

핵심 설계 원칙: **공개망 게이트웨이는 단순한 Nginx 전달기가 아니라 기업위챗을 향한 어댑터 계층(BFF)**입니다. 기업위챗 클라우드와의 모든 통신이 게이트웨이로 수렴되어, 인트라넷 시스템은 기업위챗 프로토콜을 전혀 인지하지 않습니다.

```
 기업위챗 클라우드             휴대폰 기업위챗(공개망/4G)
 gettoken/getuserinfo/         │
 message send/이벤트 콜백        │ H5 열기, API 호출
        │                      │
        ▼                      ▼
┌─────────────────────────────────────────────┐
│          DMZ 공개 중계 게이트웨이(유일한 공개 노출면)  │
│  Nginx(443, HTTPS/비안 도메인/정적 H5/WAF)     │
│  WeCom Gateway (SpringBoot, 기업위챗 어댑터 계층) │
│   · OAuth code→userid(secret 보유)            │
│   · jsapi_ticket / 서명                        │
│   · 메시지 대리 발송 message/send               │
│   · 이벤트 콜백 서명 검증/AES 복호화             │
│   · access_token 중앙 캐시(Redis 또는 로컬)     │
│   · 비즈니스 DB 저장·연결 안 함, 비즈니스 PostgreSQL 미연결 │
└───────────────┬─────────────────────────────┘
                │  통제된 내부 채널(mTLS + 내부 토큰)
                │  방화벽 화이트리스트: 게이트웨이 IP→인트라넷 10.10.20.30:8080만 허용
                ▼
┌─────────────────────────────────────────────┐
│          인트라넷 근태 시스템(기존 그대로, 공개망 미노출)  │
│  SpringBoot: 근태 / Activiti / 계정 바인딩 / JWT  │
│  PostgreSQL · Redis · 조직도                   │
│  /internal/** 내부 신뢰 인터페이스 그룹만 신규 추가  │
└─────────────────────────────────────────────┘
```

책임 분할(매우 중요):

| 기능 | 공개망 게이트웨이에 배치 | 인트라넷 시스템에 존치 |
|------|:---:|:---:|
| corpid/secret/EncodingAESKey 보유 | ✅ | ❌ |
| 기업위챗 클라우드 호출(gettoken, getuserinfo, get_jsapi_ticket, message/send) | ✅ | ❌ |
| OAuth 콜백 처리, 콜백 메시지 서명 검증·복호화 | ✅ | ❌ |
| H5 정적 리소스 호스팅(CDN/OSS도 가능) | ✅ | ❌ |
| 계정 바인딩 매핑(wecom_user_id ↔ 내부 계정) | ❌ | ✅ |
| 비즈니스 JWT 발급/검증, 근태, Activiti, 조직도 | ❌ | ✅ |
| PostgreSQL/Redis 비즈니스 데이터 | ❌ | ✅ |
| 일반 비즈니스 API(`/api/…`) 전달 | 역방향 프록시만 | ✅ 처리 |

이렇게 하면 게이트웨이가 뚫리더라도 공격자는 비즈니스 DB 데이터를 얻을 수 없고, 게이트웨이에는 장기 유효한 인트라넷 자격 증명이 없습니다(내부 토큰은 유효기간이 짧고 폐기 가능).

### 9.4 격리 네트워크에서의 자동 로그인(SSO) 경로(4장과의 차이)

4장은 프런트엔드와 백엔드가 동일 출처이고 백엔드가 직접 기업위챗을 호출한다고 가정했습니다. 게이트웨이를 추가하면 "code를 userid로 교환"하는 것은 게이트웨이에서, "userid를 내부 계정으로 교환하고 JWT를 발급"하는 것은 인트라넷에서 일어나며, 그 사이에 **내부 신뢰 호출**이 한 번 더 추가됩니다.

```
휴대폰 H5        DMZ 게이트웨이               인트라넷 근태 시스템      기업위챗 클라우드
 │                │                          │                │
 │ 토큰 없음, OAuth로 이동 │                          │                │
 │◀───────────────│                          │                │
 │ 자동 인가 후 ?code로 리다이렉트 복귀                       │                │
 │───────────────▶│ gettoken/getuserinfo ────────────────────▶│
 │                │◀──────────────────── userid ──────────────│
 │                │ POST /internal/wecom/assert {userid}      │
 │                │  (mTLS + X-Internal-Token 게이트웨이 토큰)  │
 │                │─────────────────────────▶│ 바인딩 계정 조회  │
 │                │                          │ 내부 JWT 발급     │
 │                │◀──────────────────── JWT ─────────────────│
 │◀───────────────│ 내부 JWT를 프런트엔드에 기록                  │
 │ 이후 /api/**에 JWT 포함                       │               │
 │───────────────▶│ Nginx 역프록시(JWT 전달)───────▶│ 근태/결재   │
```

핵심:

- **secret은 게이트웨이에만** 존재하며, 인트라넷 시스템은 기업위챗 키가 필요하지도, 설정해서도 안 됩니다.
- 인트라넷에는 내부 신뢰 인터페이스 `/internal/wecom/assert` 하나만 추가합니다. 입력은 userid, 출력은 시스템 자체의 JWT입니다. 이것은 **공개망에 노출되지 않고**, 게이트웨이에서 온 호출이면서 내부 토큰/mTLS를 갖춘 호출만 받습니다.
- 비즈니스 인터페이스 `/api/**`에 대해 게이트웨이는 역방향 프록시만 하며 JWT를 그대로 전달하고, 인증은 여전히 인트라넷의 Spring Security에서 완료됩니다(4.7 참고). 게이트웨이는 비즈니스를 해석하지 않습니다.

**게이트웨이 쪽: code를 userid로 교환한 뒤 내부 JWT로 교환**

```java
/**
 * DMZ 게이트웨이: 기업위챗 OAuth 어댑터
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/wecom")
@Slf4j
public class GatewayOAuthController {

    @Resource
    private WecomTokenManager tokenManager;      // gettoken + Redis 캐시, 8.1 참고
    @Resource
    private InternalAttendanceClient internalClient;  // 인트라넷의 내부 신뢰 인터페이스 호출

    /** OAuth 콜백: code -> 기업위챗 userid -> 인트라넷 JWT */
    @GetMapping("/oauth/callback")
    public void callback(@RequestParam("code") String code,
                         @RequestParam("state") String state,
                         HttpServletResponse resp) throws IOException {
        String userid = exchangeUserid(code);               // 게이트웨이가 기업위챗 클라우드 호출
        String jwt = internalClient.assertWecomUser(userid); // 게이트웨이가 인트라넷을 호출해 JWT로 교환

        String redirect = stateService.consumeTarget(state); // state로 원래 목적지 복원 및 CSRF 검증
        // 일회성 중계 페이지를 통해 JWT를 프런트엔드에 전달(localStorage에 기록 후 목적지로 이동)
        resp.sendRedirect("/oauth-bridge.html#token="
                + URLEncoder.encode(jwt, StandardCharsets.UTF_8)
                + "&redirect=" + URLEncoder.encode(redirect, StandardCharsets.UTF_8));
    }

    private String exchangeUserid(String code) {
        String token = tokenManager.getAccessToken();
        String url = "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo"
                + "?access_token=" + token + "&code=" + code;
        JSONObject json = restTemplate.getForObject(url, JSONObject.class);
        if (json == null || json.getIntValue("errcode") != 0
                || StrUtil.isBlank(json.getString("userid"))) {
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE, "애플리케이션 인가 범위 밖입니다");
        }
        return json.getString("userid");
    }
}
```

> 내부 JWT를 URL에 오래 붙여 두지 마세요(게이트웨이/Nginx 로그와 브라우저 히스토리에 남습니다). 위에서는 일회성 `/oauth-bridge.html`을 사용합니다. 페이지 스크립트가 hash 안의 token을 읽고(hash는 서버로 전송되지 않아 서버 로그가 남지 않음), localStorage에 기록한 즉시 `history.replaceState`로 지운 뒤 목적지로 이동합니다. state는 여전히 4.3에 따라 CSRF 검증과 원래 경로 복원을 수행합니다.

**인트라넷 쪽: 게이트웨이 호출만 받는 내부 신뢰 인터페이스**

```java
/**
 * 인트라넷: 기업위챗 신원 단정(assert) 인터페이스(게이트웨이만 호출 가능, 공개망 미노출)
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/internal/wecom")
@Slf4j
public class InternalWecomAssertController {

    @Resource
    private SysUserService userService;
    @Resource
    private JwtTokenProvider jwtTokenProvider;

    @PostMapping("/assert")
    public Result<AssertVO> assertUser(
            @RequestHeader(value = "X-Internal-Token", required = false) String internalToken,
            @RequestBody @Valid AssertDTO dto) {

        // 1. 게이트웨이에서 온 내부 토큰을 검증(또는 mTLS 계층에서 클라이언트 인증서 검증, 둘 중 하나 또는 추가 적용)
        if (!internalTokenVerifier.verify(internalToken)) {
            log.warn("내부 단정 인터페이스에 대한 비정상 호출, userid={}", dto.getUserid());
            throw new BusinessException(ErrorCode.FORBIDDEN, "내부 인터페이스 접근이 거부되었습니다");
        }

        // 2. 4.6절의 계정 바인딩 로직을 재사용(절대 계정을 중복 생성하지 않음)
        SysUser user = userService.getOrBindByWecomUserId(dto.getUserid());

        // 3. 시스템의 기존 JWT 발급(아이디/비밀번호 로그인과 완전히 동일)
        String jwt = jwtTokenProvider.generateToken(user.getId(), user.getUsername());
        return Result.success(new AssertVO(jwt, UserInfoVO.of(user)));
    }
}
```

`/internal/**`는 Spring Security에서 별도로 구성합니다: 게이트웨이 IP(또는 mTLS 클라이언트 인증서 소지)에서만 허용하고, **공개망 Nginx의 역방향 프록시 location에 포함되지 않도록** 하여, 네트워크와 애플리케이션 두 계층에서 외부의 직접 호출을 차단합니다.

### 9.5 게이트웨이와 인트라넷 사이의 내부 신뢰(보안 핵심)

DMZ에서 인트라넷으로 가는 이 한 번의 홉은 전체 방식에서 보안 수준이 가장 높아야 하는 지점으로, 반드시 "채널 암호화 + 신원 인증 + 최소 권한 부여"를 갖춰야 합니다.

- **네트워크 계층 화이트리스트**: 경계 방화벽은 `게이트웨이 IP:임의 소스 포트 → 인트라넷 근태 IP:8080/tcp`만 개방하고, 인트라넷의 다른 포트와 다른 호스트는 일절 도달 불가로 합니다. 게이트웨이에서 데이터베이스(5432), Redis(6379)로의 연결은 **절대 개통하지 않습니다**.
- **전송 암호화 mTLS**: 게이트웨이와 인트라넷 사이는 HTTPS 양방향 인증서 인증을 사용하고, 인트라넷은 게이트웨이의 클라이언트 인증서만 신뢰합니다. 같은 네트워크 구간이 스니핑되더라도 위조나 재생을 할 수 없습니다.
- **애플리케이션 계층 내부 토큰**: mTLS 외에 짧은 유효기간의 `X-Internal-Token`(게이트웨이가 주입하고 인트라넷이 검증)을 하나 더 두어 이중으로 보장합니다. 토큰은 환경 변수에 두고 정기적으로 교체합니다.
- **인터페이스 최소화**: 인트라넷은 `/internal/wecom/assert`(JWT 교환), `/internal/message/send`(대기 태스크 대리 발송), `/internal/callback/event`(콜백 이벤트 전달) 등 극소수 인터페이스만 노출하고, 입력은 화이트리스트로 엄격하게 검증합니다.
- **재생 방지**: 내부 요청에 타임스탬프 + nonce를 추가하고, 인트라넷 쪽이 시간 윈도우(예: ±5분)와 nonce 유일성을 검증합니다.
- **게이트웨이에 비즈니스 데이터를 두지 않음**: 게이트웨이는 비즈니스 PostgreSQL에 연결하지 않고, access_token 등은 게이트웨이 자체 Redis나 로컬 캐시를 사용합니다. 로그는 마스킹하고 JWT 평문을 기록하지 않습니다.

내부 토큰 검증 예시:

```java
@Component
public class InternalTokenVerifier {

    @Value("${internal.gateway.token}")
    private String expectedToken;

    public boolean verify(String token) {
        // 상수 시간 비교로 타이밍 부채널을 방지
        return StrUtil.isNotBlank(token)
                && MessageDigest.isEqual(
                        token.getBytes(StandardCharsets.UTF_8),
                        expectedToken.getBytes(StandardCharsets.UTF_8));
    }
}
```

### 9.6 이벤트 콜백과 메시지 푸시의 구간 간 처리

격리 네트워크에서 기업위챗의 이벤트 콜백(카드 버튼, 주소록 변경)은 먼저 공개 게이트웨이에 도달한 뒤, 게이트웨이가 인트라넷으로 전달해야 합니다. 인트라넷에서 발생하는 결재 대기 태스크 알림은 반대로 게이트웨이를 통해 대리 발송됩니다.

**인바운드: 기업위챗 이벤트 콜백 → 게이트웨이 서명 검증·복호화 → 인트라넷 전달**

```java
/**
 * 게이트웨이 쪽: 기업위챗 콜백을 받아 서명 검증 + AES 복호화 후 인트라넷으로 전달해 처리
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/wecom/callback")
@Slf4j
public class GatewayCallbackController {

    @Resource
    private WXBizMsgCrypt crypt;                 // 공식 암호화/복호화(secret은 게이트웨이에 존치)
    @Resource
    private InternalAttendanceClient internalClient;

    @PostMapping(value = "/message", produces = "application/xml")
    public String receive(@RequestParam("msg_signature") String sig,
                          @RequestParam String timestamp,
                          @RequestParam String nonce,
                          @RequestBody String encryptedBody) {
        try {
            // 1. 게이트웨이가 서명 검증 + AES 복호화를 완료(인트라넷은 EncodingAESKey를 알 필요가 없음)
            String xml = crypt.DecryptMsg(sig, timestamp, nonce, encryptedBody);
            // 2. 서명 검증을 통과한 평문 이벤트를 내부 신뢰 채널로 인트라넷에 전달(비동기, 내부 토큰/mTLS 포함)
            internalClient.forwardEvent(xml);
        } catch (Exception e) {
            log.error("기업위챗 콜백 처리 실패", e);
        }
        return "success";   // 게이트웨이는 즉시 success를 반환해 기업위챗 재푸시를 방지; 인트라넷 처리는 멱등
    }
}
```

인트라넷이 받는 것은 이미 서명이 검증된 평문 이벤트이므로 7장의 `WecomCallbackService` 분기 로직을 그대로 재사용합니다(카드 버튼 → `approvalService.approve()`, 주소록 변경 → 증분 동기화). 게이트웨이 전달이 재시도될 수 있으므로 인트라넷 처리는 반드시 멱등이어야 합니다.

**아웃바운드: 인트라넷 대기 태스크 → 게이트웨이가 기업위챗 메시지 대리 발송**

인트라넷은 secret을 보유하지 않고 공개망에 직접 접근하지 못할 수도 있으므로, Activiti의 대기 태스크 푸시 리스너(6.6 참고)는 더 이상 기업위챗을 직접 호출하지 않고 "누구에게 어떤 카드를 보낼지"를 게이트웨이에 제출하여 게이트웨이가 대리 발송합니다.

```java
/**
 * 인트라넷 쪽: 대기 태스크 알림을 공개 게이트웨이에 맡겨 발송(인트라넷은 기업위챗 secret 미보유)
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class GatewayMessageRelay {

    @Resource
    private InternalGatewayClient gatewayClient;

    public void sendApprovalTodoCard(String wecomUserId, TodoPushDTO todo) {
        // mTLS/내부 토큰으로 게이트웨이를 호출; 게이트웨이가 다시 message/send를 호출
        gatewayClient.enqueueMessage(MessageEnvelope.builder()
                .toUser(wecomUserId)
                .msgType("textcard")
                .title("결재 대기: " + todo.getNodeName())
                .description(todo.getSummary())
                .btnText("지금 결재")
                // 카드 링크는 공개 H5 도메인을 가리키며, 탭하면 자동 로그인을 거쳐 해당 결재로 바로 이동
                .url("https://attendance.yourcompany.com/mobile/approval/" + todo.getTaskId())
                .build());
    }
}
```

```java
/**
 * 게이트웨이 쪽: 대리 발송 서비스(message/send를 호출하는 유일한 곳)
 *
 * @author cuckoom
 */
@Service
public class GatewaySendService {

    @Resource
    private WecomTokenManager tokenManager;

    public void send(MessageEnvelope env) {
        // 인트라넷 출처를 검증(mTLS/내부 토큰은 인터셉터에서 완료)한 뒤 기업위챗 메시지를 조립해 발송
        // invaliduser를 기록해 "누군가 대기 태스크를 받지 못함" 문제를 쉽게 추적
        ...
    }
}
```

이로써 단방향 책임이 명확해집니다: 기업위챗 관련 키와 클라우드 호출은 모두 게이트웨이로 수렴하고, 인트라넷은 비즈니스를 생성·처리만 하며 좁은 인터페이스 하나로 메시지를 주고받습니다.

### 9.7 대안 방식: 인트라넷이 능동적으로 접속하는 리버스 터널

보안 정책상 DMZ가 인트라넷에 능동 연결하는 것이 허용되지 않는다면(어떤 DMZ→인트라넷 인바운드도 금지), **인트라넷이 DMZ/공개 게이트웨이로 장기 연결 터널을 능동적으로 구축**하는 방식으로 바꿀 수 있습니다. 인트라넷에서 접속을 걸어 개방된 아웃바운드 정책을 재사용합니다.

- **WireGuard / IPsec 터널**: 게이트웨이와 인트라넷의 터널 전용 머신 한 대 사이에 암호화된 지점 간 네트워크를 구축하고 인트라넷이 능동 접속해 온라인이 됩니다. 게이트웨이 입장에서 인트라넷 서비스는 터널 상대 주소가 되며, 여전히 9.3의 애플리케이션 계층 인증을 사용합니다. 운영이 성숙하고 성능이 좋아 우선 고려할 만합니다.
- **frp / rathole 등 역방향 프록시**: 인트라넷 클라이언트 `frpc`가 공개망 `frps`에 능동 연결해 인트라넷 `8080`을 게이트웨이의 로컬 포트 하나로 매핑합니다. 구축은 빠르지만, 노출 포트와 프로토콜을 엄격히 제한하고 mTLS/토큰을 추가 적용하여 터널이 "공개망에서 인트라넷으로 직행하는 뒷문"이 되지 않도록 해야 합니다.
- **메시지 큐/폴링 중계**: 보안 요구가 매우 높은 경우, 인트라넷은 게이트웨이 쪽 큐만 능동 소비하고(예: 발송 대기 콜백을 가져오고, 대리 발송 결과를 다시 푸시), 전 과정이 인트라넷 아웃바운드만 사용해 어떤 역방향 인바운드도 없습니다. 지연이 약간 높지만 공격면이 가장 작습니다.

선정 원칙: "DMZ + 방화벽 화이트리스트"가 가능하면 터널을 쓰지 마세요. 터널이 반드시 필요하면 WireGuard 같은 네트워크 계층 방식을 우선하고 애플리케이션 계층 인증을 추가 적용하세요. 설정 없는 날것의 frp로 인트라넷 관리 포트를 공개망에 직접 매핑하지 마세요.

### 9.8 Nginx 게이트웨이 역방향 프록시 설정 핵심

게이트웨이의 Nginx는 TLS 종단, H5 정적 리소스, 그리고 `/api/**`를 인트라넷으로 역방향 프록시(터널 상대 주소 또는 방화벽으로 도달 가능한 주소 경유)하는 역할을 합니다. `/internal/**`는 절대 여기에 노출되지 않도록 주의하세요.

```nginx
server {
    listen 443 ssl http2;
    server_name attendance.yourcompany.com;

    ssl_certificate     /etc/nginx/ssl/attendance.crt;
    ssl_certificate_key /etc/nginx/ssl/attendance.key;

    # H5 정적 리소스(Angular 빌드 산출물, history 모드 폴백)
    root /data/www/mobile;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 비즈니스 API: 인트라넷 근태 시스템으로 역방향 프록시, Authorization(JWT) 전달
    location /api/ {
        proxy_pass https://10.10.20.30:8080;   # 또는 WireGuard 터널 상대 주소
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_verify       on;          # 인트라넷 구간도 mTLS
        proxy_ssl_trusted_certificate /etc/nginx/mtls/ca.crt;
        proxy_ssl_certificate     /etc/nginx/mtls/gateway.crt;
        proxy_ssl_certificate_key /etc/nginx/mtls/gateway.key;
    }

    # 주의: 여기에 /internal/ 역방향 프록시를【구성하지 말 것】. 내부 인터페이스는 게이트웨이 백엔드의 신뢰 채널만 통함

    # 게이트웨이 자체의 기업위챗 콜백/자동 로그인은 게이트웨이 SpringBoot 애플리케이션이 처리(예: 127.0.0.1:8090 리스닝)
    location ~ ^/(wecom|oauth-bridge) {
        proxy_pass http://127.0.0.1:8090;
    }
}
```

> 프런트엔드 빌드 시 API 기본 주소를 공개 게이트웨이 동일 출처 경로(예: `/api`)로 지정해 Nginx가 인트라넷으로 전달하게 합니다. JS-SDK 서명, OAuth 콜백 도메인에는 모두 게이트웨이의 공개 비안 도메인을 사용합니다. 인트라넷 시스템에는 공개 도메인과 인증서가 전혀 필요 없습니다.

### 9.9 공개 게이트웨이 자체 보안 강화

DMZ 호스트는 노출면이므로 최소화 원칙에 따라 강화해야 합니다.

- 443만 개방하고(필요한 SSH는 소스 IP 제한 + 키 로그인), 나머지 포트는 모두 닫습니다. 앞단에 클라우드 WAF / 보안 그룹을 배치합니다.
- 게이트웨이 프로세스는 non-root, 최소 권한으로 실행합니다. 컨테이너 배포 시 루트 파일 시스템을 읽기 전용으로 하고 capabilities를 제거(drop)합니다.
- 게이트웨이는 비즈니스 데이터를 영속화하지 않고 비즈니스 DB에 연결하지 않습니다. 로그는 중앙으로 전달하고 디스크에 민감 정보를 오래 남기지 않습니다.
- secret, 내부 토큰, mTLS 개인키는 모두 환경 변수/KMS로 처리하고 이미지와 Git에 넣지 않습니다(8.2 참고).
- 게이트웨이에서 기업위챗으로 나가는 출구 IP를 기업위챗 "기업 신뢰 IP" 화이트리스트에 추가합니다(10.4의 빈도 제한과 화이트리스트 단락 참고).
- 요청 제한, 재생 방지, 요청 본문 크기 제한을 게이트웨이 계층에서 일괄 적용합니다. 비정상 호출은 알림을 트리거합니다.
- 게이트웨이와 인트라넷 사이의 내부 인터페이스에 호출 감사를 적용합니다(누가, 언제, 어떤 내부 인터페이스를 호출했고 userid가 무엇인지).

## 10. 함정 피하기 가이드

### 10.1 OAuth 자동 로그인(SSO) 관련

- **애플리케이션 홈/콜백 도메인은 반드시 "신뢰 도메인" 하위에 있어야** 합니다. 그렇지 않으면 인가 페이지에서 `redirect_uri 매개변수 오류`가 발생합니다.
- **인가 링크에는 반드시 `agentid`를 포함해야** 합니다. 누락 시 일부 기업위챗 버전에서 `getuserinfo`로 애플리케이션 신원을 얻지 못합니다.
- **`appid`에는 corpid를 입력**하고 agentid가 아닙니다. 입문자가 자주 바꿔 적습니다.
- **userid 대신 openid가 반환됨**: 사용자가 애플리케이션 표시 범위 밖입니다. 애플리케이션 "표시 범위"에 해당 멤버의 부서가 포함되는지 확인하고, 코드에서 조용히 계정을 생성하지 마세요.
- **PC 브라우저에서 링크를 열면 자동 인가되지 않음**: `snsapi_base`는 기업위챗 클라이언트 안에서만 무설치로 동작합니다. 프런트엔드는 반드시 먼저 UA를 판별해, 기업위챗 환경이 아니면 시스템 아이디/비밀번호 로그인으로 진행하세요.
- **code는 한 번만 사용 가능하고 5분이면 만료**: 리다이렉트 복귀 페이지를 새로고침하면 code 재사용 오류가 발생합니다. 로그인 성공 후에는 `router.replace`로 URL의 code를 지워 새로고침 재생을 방지하세요.

### 10.2 JS-SDK 서명 관련

- **iOS는 진입 페이지 URL, Android는 현재 페이지 URL로 서명**합니다(5.3 참고). SPA 환경에서 이것이 `invalid signature`의 1순위 원인입니다. 진입 URL은 첫 라우트 이동 전에 기록해야 합니다.
- **서명에 참여하는 URL과 `location.href`는 글자 단위로 정확히 일치**해야 합니다. 프로토콜, 도메인, 포트, query를 모두 포함해야 하고, hash 부분은 규칙에 따라 일관되게 처리합니다(history 모드로 피하는 것을 권장).
- **프런트엔드가 인코딩하면 백엔드도 인코딩하고, 둘 다 인코딩하지 않으면 둘 다 하지 않으며**, 서명 문자열 조립 순서는 반드시 `jsapi_ticket&noncestr&timestamp&url`이어야 합니다.
- 기업위챗 전용 인터페이스를 호출하려면 `wx.config`에 `beta: true`를 설정하고 `wx.agentConfig`를 한 번 더 수행해야 합니다.
- 로컬 실기기 디버깅은 반드시 인트라넷 터널링의 https 도메인을 사용해야 합니다. hosts 방식은 휴대폰에서 통하지 않습니다.

### 10.3 Activiti와 계정 매핑 관련

- **처리자 식별자는 반드시 내부 username으로 통일**하고, wecom_user_id를 BPMN assignee에 직접 넣지 마세요. 나중에 신원 소스를 바꾸면(딩딩/페이슈 등 추가) 흐름 정의를 전부 고쳐야 합니다.
- **wecom_user_id로 중복 계정을 새로 만들지 마세요**: 이미 있는 시스템의 제1원칙은 바인딩 매핑(4.6)입니다. 그렇지 않으면 근태와 과거 대기 태스크가 두 사람으로 갈라집니다.
- **또는결재 후보 작업은 처리 전 반드시 claim해야** 합니다. 수령하지 않고 바로 complete하면 해당 작업이 현재 사용자의 것이 아니라는 오류가 납니다.
- **회람 반려 시 남은 인스턴스를 미리 종료해야** 합니다. completionCondition에 REJECT 판단을 포함 + 리스너에서 남은 task를 delete하세요. 그렇지 않으면 반려 후에도 다른 사람에게 대기 태스크가 계속 갑니다.
- **근태 연동 기록은 흐름 종료 리스너에** 두고, 특정 결재 버튼 인터페이스에 두지 마세요. PC, H5, 카드 콜백 어떤 진입점에서도 적용되게 하고, 결재가 실제로 통과하지 않으면 근태를 잘못 건드리지 않게 합니다.

### 10.4 기업위챗 API 빈도 제한과 기타

| API | 제한(참고용, 공식 문서 기준 우선) |
|-----|------|
| gettoken | 같은 기업은 5분 내 호출 횟수에 제한이 있어 반드시 캐싱 |
| 메시지 발송 | 애플리케이션별 분당 상한이 있어 touser를 되도록 배치·중복 제거 |
| 주소록 읽기 | 일일 총 호출 횟수 상한이 있어 증분 콜백을 주로 사용 |
| 메시지 카드 갱신 | 인터페이스 빈도 제한을 받아 순환 갱신을 피할 것 |

기타 자주 묻는 문제:

- **서버 출구 IP를 "기업 신뢰 IP" 화이트리스트에 추가**해야 합니다. 그렇지 않으면 `60020` 오류가 발생합니다.
- **반드시 HTTPS + ICP 비안**(중국 본토 서버)이 필요하고, 인증서가 만료되면 뚜렷한 안내 없이 애플리케이션 전체가 열리지 않으므로 모니터링에 포함하세요.
- **콜백은 반드시 초 단위로 `success`를 반환**해야 하고 비즈니스는 비동기화하세요. 그렇지 않으면 기업위챗 재푸시로 중복 결재가 생깁니다(멱등성으로 폴백).
- **textcard의 url은 상세 페이지까지 바로 연결**하는 것을 권장합니다. 자동 로그인 + state 리다이렉트 복귀와 함께 쓰면 "알림 탭 한 번으로 결재로 직행"이 구현됩니다.
- **secret 유출** 시 즉시 관리자 콘솔에서 재설정하고 서비스를 재시작하세요. 코드 리뷰에서 "프런트엔드/로그에 secret 등장"을 금지선으로 지정하세요.

### 10.5 네트워크 격리와 중계 게이트웨이 관련

- **인트라넷 시스템을 절대 공개망에 직접 노출하지 마세요**: DMZ에는 게이트웨이만 두고, 경계 방화벽은 "게이트웨이 IP → 인트라넷 근태 서비스 IP:포트" 딱 하나의 화이트리스트만 개방하며, 게이트웨이에서 데이터베이스/Redis 포트로는 일절 열지 않습니다.
- **secret과 비즈니스 DB를 서로 다른 구역에 배치**: 기업위챗 secret, EncodingAESKey는 게이트웨이에만 둡니다. 계정 바인딩, JWT, 비즈니스 데이터는 인트라넷에만 둡니다. 양쪽 모두 키를 가지면서 비즈니스 DB까지 연결하는 일이 없도록 하세요.
- **내부 인터페이스 `/internal/**`은 반드시 이중 보호**: mTLS 클라이언트 인증서 + 내부 토큰(짧은 유효기간, 교체 가능, 상수 시간 비교)을 적용하고, 공개망 Nginx의 리버스 프록시 location에 노출되지 않게 하며, 타임스탬프/nonce로 재생 공공을 방지합니다.
- **내부 JWT를 URL query에 오래 두지 마세요**: Nginx/게이트웨이 로그와 브라우저 히스토리에 남습니다. 일회성 중계 페이지에서 hash를 읽어(`#` 부분은 서버 로그에 남지 않음) localStorage에 쓴 뒤 즉시 제거하세요.
- **콜백 게이트웨이는 먼저 success를 반환하고 인트라넷에서 비동기·멱등 처리**: 게이트웨이는 서명 검증·복호화 후 인트라넷으로 전달하고 게이트웨이 자신은 즉시 응답합니다. 인트라넷은 이벤트 id 기준으로 멱등 처리하여 게이트웨이 재시도를 용인합니다.
- **리버스 터널에 관리 포트를 알몸으로 노출하지 마세요**: 인트라넷에서 능동적으로 접속을 거는 WireGuard/mTLS 터널로 좁은 인터페이스만 실어야 합니다. 날것의 frp로 인트라넷 8080/관리 콘솔을 공개망에 직접 매핑하는 것은 금지입니다.
- **인증서와 도달 가능성을 각각 검증**: 기업위챗 신뢰 도메인/HTTPS 인증서는 게이트웨이 공개 도메인에 설정하고, 인트라넷은 자가 서명 또는 내부 CA 인증서로 mTLS를 구성하면 되므로 공개 인증서가 필요 없습니다. 실제 외근 네트워크(4G/5G)에서 자동 로그인(SSO)과 콜백을 반드시 한 번 회귀 테스트하세요.

## 11. 런칭 점검 체크리스트

**기업위챗 관리 콘솔**

- [ ] 자체 구축 애플리케이션의 노출 범위가 모든 사용자 부서를 커버
- [ ] 애플리케이션 홈이 H5 모바일 주소(https)로 설정됨
- [ ] 신뢰 도메인이 설정되었고 소유권 확인 파일에 접근 가능
- [ ] 기업 신뢰 IP가 화이트리스트에 추가됨(서버 출구 IP)
- [ ] 메시지 수신 URL/Token/EncodingAESKey가 설정되었고 GET 검증을 통과함

**계정과 신원**

- [ ] `sys_user.wecom_user_id`가 주소록 동기화로 초기화되었고 사원번호 매핑이 정확함
- [ ] 매칭되지 않은 계정에 "관리자에게 문의/셀프 바인딩" 안내가 명확하여 조용히 계정이 생성되지 않음
- [ ] `snsapi_base` 묵음 자동 로그인이 실기기(iOS + Android)에서 검증됨
- [ ] token 만료 후 자동 재로그인이 체감 없이 동작하고 원래 페이지(결재 상세 딥링크 포함)로 리다이렉트 복귀가 정확함

**기능**

- [ ] JS-SDK `wx.config`가 iOS/Android 양쪽에서 통과(서명 URL 중점 검증)
- [ ] 위치조회/사진촬영/스캔이 실기기에서 동작하고 백엔드 거리 2차 검증이 작동
- [ ] 회람(전원 승인): 각자 독립된 결재 대기 태스크, 한 명이라도 반려하면 즉시 종료되고 기안자에게 통지
- [ ] 또는결재(아무 1명 승인): 후보자 모두 수신하고 한 명이 수령·처리하면 다른 사람의 대기 태스크가 사라짐
- [ ] 조직도 기반 결재: 신청인 부서에 따라 책임자/담당 임원에게 정확히 라우팅
- [ ] 결재 승인 후 근태 연동(근태 보정(보강) 수정/휴가 차감)이 정확히 DB에 기록됨
- [ ] 대기 태스크 카드 푸시가 도달하고 클릭 시 바로 이동하며 로그인된 상태임; 카드 버튼 콜백이 멱등함

**보안과 운영**

- [ ] secret/Token/AESKey를 환경 변수로 주입, Git에 들어가지 않고 로그에도 남지 않음
- [ ] access_token/jsapi_ticket 캐싱 + 분산 락 검증(다중 인스턴스)
- [ ] HTTPS 인증서 유효기간 모니터링, 인터페이스 속도 제한, 주요 작업 감사 로그
- [ ] 주소록 증분 콜백 + 매일 전량 안전망 작업이 활성화됨

**네트워크 격리 / 공개 중계 게이트웨이(9장, 격리 네트워크 필수 점검)**

- [ ] DMZ 게이트웨이가 유일한 공개 노출면이고, 인트라넷 근태 시스템에는 공개망 인바운드 규칙이 전혀 없음
- [ ] 경계 방화벽이 "게이트웨이 IP → 인트라넷 근태 IP:8080"만 개방하고 PG/Redis 포트는 개방되지 않음
- [ ] 기업위챗 secret / EncodingAESKey가 게이트웨이에만 있고 인트라넷은 보유하지 않음; 게이트웨이는 비즈니스 DB에 연결하지 않음
- [ ] `/internal/**`이 mTLS + 내부 토큰 + 타임스탬프/nonce 재생 방지를 거치고 공개망 Nginx 리버스 프록시에 없음
- [ ] 자동 로그인 구간 간 연동을 실기기 검증: 게이트웨이에서 userid 교환 → 인트라넷 assert에서 JWT 교환 → 비즈니스 인터페이스 인증 정보 투과 전달
- [ ] 콜백: 게이트웨이가 서명 검증·복호화 후 즉시 success를 반환하고 인트라넷이 비동기·멱등 처리; 대기 태스크는 게이트웨이 경유로 푸시 도달
- [ ] 외근 4G/5G 실기기 회귀: H5 로딩, 자동 로그인, 위치 기반 출퇴근 체크, 결재 대기 태스크와 카드 콜백
- [ ] 리버스 터널 사용 시: 인트라넷이 능동 발신, WireGuard/mTLS, 좁은 인터페이스만 노출, 날것의 frp 관리 포트 없음

## 마무리

"이미 있는 근태 시스템 + Activiti 복잡 결재"를 전제로 기업위챗을 연동할 때, 올바른 접근은 새로 다시 만드는 것이 아니라 기업위챗을 **진입점, 신원 제공자, 메시지 채널**로 대하는 것입니다.

- **선정**: 이미 웹 시스템이 있고 결재 양식이 복잡하며 빠른 반복과 무심사 배포가 필요하다면 H5가 미니프로그램보다 적합합니다. OAuth2 `snsapi_base` 묵음 인가만으로 앱을 열면 자동 로그인되는 것을 구현할 수 있고, JS-SDK로 위치조회, 사진촬영, 스캔을 충분히 커버할 수 있습니다.
- **자동 로그인 경로**: 프런트엔드 라우트 가드가 token 없음을 감지 → 기업위챗 인가로 302(state 포함) → code를 들고 묵음 리다이렉트 복귀 → 백엔드가 gettoken + `auth/getuserinfo`로 userid 획득 → **사원번호로 기존 시스템 계정에 매핑(신규 생성 아님)** → 시스템 본래의 JWT를 발급하면, 이후 모든 근태·결재 인터페이스를 수정 없이 그대로 재사용합니다.
- **계정 분리**: Activiti의 assignee/후보자는 계속 내부 username을 쓰고, 기업위챗 userid는 `sys_user` 상의 외부 신원 필드로만 둡니다. 로그인 신원 확인과 푸시 주소 지정 시에만 변환하여 여러 로그인 방식이 공존하는 능력을 보존합니다.
- **결재 재사용**: 회람(전원 승인)(다중 인스턴스 + 완료 조건), 또는결재(아무 1명 승인)(candidateUsers + claim), 조직도 기반 결재(UEL 표현식으로 책임자를 동적 해석)를 전부 기존 BPMN 그대로 사용합니다. H5에는 대기 태스크 목록/상세/처리 진입점만 추가하고, 바닥은 모두 동일한 `taskService.complete()`을 탑니다.
- **연동과 도달**: 근태 연동은 프로세스 종료 리스너에 두어 모든 진입점에서 동일하게 동작하게 합니다. 새 대기 태스크는 textcard로 푸시하고 링크는 결재 상세로 바로 연결하며 자동 로그인을 재사용합니다. 카드 내 원클릭 결재는 콜백으로 처리하고 작업은 반드시 멱등해야 합니다.
- **주요 함정 회피**: 신뢰 도메인과 기업 신뢰 IP, iOS/Android 서명 URL 차이, code 일회성과 state CSRF 방지, 중복 계정 생성 절대 금지, 또는결재 수령(claim), 콜백 즉시 success 반환, 티켓 중앙 집중 캐싱.
- **네트워크 격리 실행**: 근태 시스템이 인트라넷에 있어 기업위챗이 접근할 수 없을 때는 DMZ에 공개 중계 게이트웨이를 유일한 노출면으로 배포합니다. 기업위챗 키와 클라우드 호출(gettoken/getuserinfo/서명/메시지 대리 발송/콜백 서명 검증)을 게이트웨이로 모으고, 계정 바인딩, JWT, Activiti와 비즈니스 데이터는 모두 인트라넷에 남기며, 양쪽은 mTLS + 내부 토큰의 좁은 인터페이스(`/internal/**`)로 통제된 통신만 합니다. DMZ→인트라넷 인바운드조차 허용되지 않는다면, 차선으로 인트라넷이 능동적으로 접속을 거는 WireGuard/mTLS 리버스 터널을 사용합니다. 이렇게 하면 기업위챗 진입점은 뚫리면서도 인트라넷 시스템이 공개망에 직접 노출되지 않습니다.

공식 문서: [기업위챗 개발자 센터](https://developer.work.weixin.qq.com/document/)

> 이 방안의 본질은 "다시 만들기"가 아니라 "연동"입니다. 최소한의 신규 추가 코드(OAuth 로그인 엔드포인트 하나, 계정 매핑 한 계층, JS-SDK 서명 서비스 하나, 대기 태스크 푸시 리스너 한 조)로, 수년간 쌓인 근태와 Activiti 결재 기능을 직원의 기업위챗 안에 매끄럽게 나타나게 하고 체감 없는 자동 로그인을 구현하는 것입니다. 이후 출퇴근 체크 경험을 더 높여야 한다면 미니프로그램 체크인 진입점을 덧붙여, H5 결재와 동일한 백엔드 계정·워크플로를 공유하며 순조롭게 발전시킬 수 있습니다.
