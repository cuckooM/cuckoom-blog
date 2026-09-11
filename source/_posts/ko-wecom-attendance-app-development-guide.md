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

많은 팀의 기업위챗(WeCom) 개발은 처음부터 새 시스템을 만드는 것이 아니라, 더 흔하고 현실적인 시나리오를 마주합니다. **업무 시스템이 이미 존재하며 수년간 운영 중**이라는 상황입니다——근태 모듈은 이미 오래전에 오픈되었고, 결재 흐름은 Activiti 기반으로 회람(전원 승인), 또는결재(아무 1명 승인), 조직도 기반 단계별 결재 등 복잡한 프로세스가 구현되어 있으며, 결재 과정에서 근태 데이터를 조회하고 연동합니다. 지금의 요구사항은 이 시스템을 WeCom으로 가져와, 직원들이 WeCom 워크벤치에서 아이콘을 누르면 바로 사용할 수 있게 하는 것입니다. **더 이상 사용자 이름과 비밀번호를 입력할 필요 없이, 접속하자마자 자신의 근태와 결재 대기 태스크가 보이도록** 하는 것입니다.

이러한 전제에서 H5 앱 모델은 미니프로그램보다 적합한 선택인 경우가 많습니다. 기존 시스템 자체가 Angular + SpringBoot 기반의 웹 아키텍처이므로, H5는 프런트엔드 페이지와 백엔드 인터페이스를 그대로 재사용할 수 있고, WeCom OAuth2 웹 인증(`snsapi_base`)과 연동하여 완전히 조용한 자동 로그인(SSO)을 구현할 수 있습니다. 배포 즉시 적용되고 심사·출시가 필요 없으며, 결재 양식이 자주 바뀔 때 반복 비용이 가장 낮습니다.

이 글은 「**기존 근태관리 시스템 + Activiti 복잡 결재 흐름**」을 배경으로, **H5 모델을 중심 축으로** 하여, 업무 시스템을 다시 작성하지 않고 WeCom 연동을 완성하는 방법을 체계적으로 설명합니다. 중점적으로 다루는 내용은 OAuth2 무소음 자동 로그인의 전체 체인, WeCom 계정과 시스템 계정의 바인딩 매핑, JS-SDK 디바이스 기능 호출, 그리고 Activiti 회람/또는결재/조직도 결재와 근태 연동을 WeCom에서 구현하는 방법(결재 대기 태스크 푸시, 카드 원클릭 결재, 조직도 동기화)입니다.

<!-- more -->

## 1. 시나리오 분석과 모델 선택

### 1.1 기존 시스템의 전제 가정

이 글은 업무 시스템의 현황이 다음과 같다고 가정합니다(이는 대부분의 중대형 기업 내부 시스템의 전형적인 형태이기도 합니다):

- **근태관리**: 출퇴근 체크인, 체크인 기록, 근태 보정(보강) 신청, 근태 통계 기능이 이미 완비되어 있고, 백엔드가 REST API를 제공
- **결재 흐름 엔진**: Activiti(6.x/7.x) 기반으로 구현, 프로세스 정의에 다음이 포함됨:
  - **회람(전원 승인)**: 하나의 노드에서 여러 명이 모두 결재를 통과시켜야 함(예: 보강 신청 시 직속 상사 + HR 모두 동의)
  - **또는결재(아무 1명 승인)**: 하나의 노드에서 여러 명 중 아무 한 명만 결재하면 됨(예: 부서 당직 결재 그룹)
  - **조직도 기반 결재**: 신청인이 속한 부서에 따라 결재자가 동적으로 결정됨(부서 책임자 → 관할 임원 → HRBP)
  - **근태 데이터 연동**: 결재 프로세스에서 근태 데이터를 조회/기록(예: 보강 결재 통과 후 체크인 기록을 자동으로 수정하고, 연차 결재 통과 후 휴가 잔액을 차감)
- **계정 체계**: 시스템 자체의 사용자 테이블, 역할·권한 체계를 보유(예: Spring Security + JWT/Session)
- **프런트엔드**: 기존 웹 클라이언트 보유, Angular 단일 페이지 애플리케이션(TypeScript)

해결해야 할 핵심 문제는 단 두 가지입니다:

1. **신원(identity) 문제**: WeCom에서 들어온 사람이 누구인가? 시스템 계정과 어떻게 대응시켜 자동 로그인을 구현할 것인가?
2. **진입점과 도달(reach) 문제**: WeCom 워크벤치에서 어떻게 앱에 진입하는가? 결재 대기 태스크를 어떻게 직원의 WeCom으로 능동적으로 푸시할 것인가?

업무 로직(체크인 규칙, 결재 흐름)은 **한 줄도 WeCom으로 옮길 필요가 없습니다**. WeCom은 「진입점 + 신원 제공자(IdP) + 메시지 채널」이라는 세 가지 역할만 수행합니다.

### 1.2 이런 시나리오에 H5가 적합한 이유

| 비교 항목 | H5 앱(이 글의 방안) | WeCom 미니프로그램 |
|----------|--------------------|----------------|
| 기존 웹 프런트엔드 재사용 | 기존 Angular 페이지를 그대로 재사용 | WXML/WXSS로 모든 페이지를 다시 작성해야 함 |
| 기존 백엔드 인터페이스 재사용 | 그대로 재사용, OAuth 로그인 엔드포인트 하나만 추가 | 마찬가지로 재사용하지만 프런트엔드는 전면 재작업 |
| 자동 로그인 | OAuth2 `snsapi_base` 무소음 인증, 전 과정 인지 없음 | `wx.qyLogin` 무소음, 역시 인지 없음 |
| 배포·반복 | 배포 즉시 적용, 결재 양식을 언제든 수정 | 심사 제출·출시 필요, 긴급 수정이 느림 |
| 복잡한 양식/프로세스 페이지 | 웹 기술이 유연하여 결재 같은 양식 중심 페이지에 적합 | 양식 엔진류 페이지의 개발 비용이 높음 |
| 디바이스 기능 | JS-SDK: 위치/사진촬영/스캔(서명 필요) | 네이티브 API 직접 호출, 체감이 약간 더 좋음 |
| 결재 흐름 같은 「저빈도·양식 중심·잦은 반복」 업무 | 매우 잘 맞음 | 다소 무거움 |

**결론**: 근태 체크인 자체는 빈도가 높고 디바이스 기능 의존도가 커서 미니프로그램의 체험이 확실히 더 좋습니다. 하지만 「**기존 시스템 연동, 결재 프로세스가 복잡하고 자주 조정됨, 최우선 목표가 저비용 오픈과 자동 로그인**」이라는 전제에서는 H5의 종합적 이득이 체험상의 작은 차이보다 훨씬 큽니다. 또한 H5도 JS-SDK를 통해 위치, 사진 촬영, 스캔을 호출할 수 있어 근태 시나리오를 완전히 커버합니다. 이 글의 후반부에서 JS-SDK의 완전한 서명 방안과 iOS/Android 함정 대응을 다룹니다.

> 추후 체크인 체험에 대한 요구가 더 높아지면 하이브리드 모델도 가능합니다. 하나의 자가구축 앱에 H5 메인 페이지(결재, 기록, 통계)와 미니프로그램(체크인)을 동시에 구성하고, 메시지 카드가 업무 유형에 따라 각각 다르게 점프하도록 하며, 백엔드 계정 체계는 완전히 공유합니다.

### 1.3 전체 아키텍처

```
┌───────────────────────────────┐
│          기업위챗 클라이언트     │
│  워크벤치 / 메시지 카드 / 스캔   │
└───────────────┬───────────────┘
                │ H5 열기(내장 WebView)
                ▼
┌───────────────────────────────┐
│  H5 프런트엔드(기존 웹 프로젝트 재사용)│
│  Angular SPA + wx JS-SDK     │
│  라우트 가드: 토큰 없음 → OAuth로 점프│
└───────────────┬───────────────┘
                │ HTTPS(JWT)
                ▼
┌───────────────────────────────────────────────────────┐
│                 기존 업무 백엔드(SpringBoot)             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ WecomOAuth   │  │ 근태 모듈     │  │ Activiti 결재  │ │
│  │ 자동 로그인/계정 바인딩 │  │ (기존, 재사용)│  │ (기존, 재사용) │ │
│  └──────┬───────┘  └──────────────┘  └───────┬───────┘ │
│         │              계정 매핑 테이블 user_id ↔ wecom_userid │
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

핵심 설계 원칙: **WeCom userid는 시스템 사용자 테이블 위의 하나의 외부 신원 필드에 불과하며**, 근태, Activiti의 후보자/처리자는 여전히 시스템 내부 userId를 사용합니다(또는 userid와 통합, 4.5절 논의 참고). 이렇게 하면 WeCom은 새로 추가된 한 가지 로그인 방식일 뿐, 기존 권한 및 워크플로우 모델을 침범하지 않습니다.

## 2. 개발 환경 구축

### 2.1 자가구축 앱 생성 및 3요소 획득

1. [WeCom 관리자 콘솔](https://work.weixin.qq.com/)에 접속하여 관리자 계정으로 로그인
2. 「앱 관리」→「자가구축」→「앱 만들기」에서 앱 이름(예: 「모바일 근태 결재」), 로고, 노출 범위를 입력
3. 생성 후 다음 세 가지 핵심 파라미터를 기록:

| 파라미터 | 설명 | 획득 위치 |
|------|------|----------|
| `corpid` | 기업 고유 식별자 | 내 기업 → 기업 정보 → 기업 ID |
| `agentid` | 앱 고유 식별자 | 앱 관리 → 자가구축 앱 → AgentId |
| `secret` | 앱 시크릿 | 앱 관리 → 자가구축 앱 → Secret |

> ⚠️ `secret`은 최고 수준의 민감한 자격 증명으로 **서버에만 저장**하고, H5 프런트엔드 코드, Git 저장소, 브라우저 요청에 절대 노출되어서는 안 됩니다.

### 2.2 앱 메인 페이지 구성(H5 진입점)

앱 상세 페이지의 「앱 메인 페이지」에서 H5 첫 페이지 주소를 구성합니다:

```
앱 관리 → 자가구축 앱 → 앱 메인 페이지 → 웹 페이지 구성
  메인 페이지 URL: https://attendance.yourcompany.com/mobile/
```

직원이 WeCom 워크벤치에서 앱 아이콘을 누르면 WeCom 내장 브라우저에서 이 URL이 열립니다. H5 모바일은 독립 경로(예: `/mobile/`)를 사용하여 PC 관리 화면과 구분하고, 라우트 분기와 독립 레이아웃을 적용하기 쉽게 구성하는 것을 권장합니다.

### 2.3 신뢰 도메인 구성(H5에서 가장 중요한 관리자 설정)

H5 모델에서 OAuth 웹 인증 콜백 도메인과 JS-SDK는 모두 「신뢰 도메인」에 의존합니다:

```
앱 관리 → 자가구축 앱 → 개발자 인터페이스 → 웹 인증 및 JS-SDK
  → 신뢰 도메인 설정: attendance.yourcompany.com
  → 도메인 소유권 검증 파일 다운로드(WW_verify_xxxx.txt)
  → 파일을 도메인 루트 디렉터리에 배치하고 접속 가능 여부 확인:
    https://attendance.yourcompany.com/WW_verify_xxxx.txt
```

도메인 요구사항:

- 반드시 **HTTPS**여야 함(OAuth 인증과 JS-SDK에서 강제)
- ICP 비안(중국 본토 서버) 완료
- 도메인 소유권 검증 파일은 프런트엔드 정적 리소스 서비스 또는 Nginx가 직접 호스팅
- 하나의 앱에 여러 신뢰 도메인을 구성할 수 있음(도메인 주체는 일치해야 함), 콜백 주소는 반드시 이 도메인 하위에 위치해야 함

추가로 「기업 신뢰 IP」를 구성합니다: 서버 API를 호출하는 서버의 아웃바운드 IP를 화이트리스트에 추가해야 합니다. 그렇지 않으면 `gettoken` 등의 인터페이스에서 `60020 not allow to access from your ip` 오류가 발생합니다.

### 2.4 메시지 수신 구성(콜백, 카드 버튼 결재에 사용)

「메시지 카드에서 직접 동의/거절을 누르는」(페이지를 열지 않는) 기능을 구현하려면 콜백을 구성해야 합니다:

```
앱 관리 → 자가구축 앱 → 메시지 수신 → API 수신 설정
  URL:             https://attendance.yourcompany.com/api/wecom/callback/message
  Token:           직접 지정(서명 검증에 사용)
  EncodingAESKey:  무작위 생성(메시지 본문 AES 암·복호화에 사용)
```

결재 대기 태스크 점프만 하고 카드 내부 인터랙션을 하지 않는다면 당장 구성하지 않아도 되지만, 처음부터 구성해 둘 것을 권장합니다(7장에서 사용).

### 2.5 로컬 개발 환경

H5 로컬 개발의 핵심 난점은 OAuth 콜백과 JS-SDK가 신뢰 도메인 + HTTPS를 요구하는 반면 로컬은 `http://localhost`라는 점입니다. 자주 쓰이는 방안은 두 가지입니다.

**방안 1: 인트라넷 터널링(권장, 실환경과 가장 가까움)**

```bash
# frp 또는 ngrok을 사용해 로컬 8080/프런트엔드 포트를 비안 완료된 도메인의 하위 경로로 매핑
# 예를 들어 https://dev-attendance.yourcompany.com 으로 매핑
frpc -c frpc.ini

# Angular dev server가 호스트 도메인 접근을 허용(angular.json)
# serve 옵션: host를 0.0.0.0으로 설정, 기본 포트 4200
# angular.json -> projects/<name>.architect.serve.options
{ "host": "0.0.0.0", "port": 4200 }
# 또는 명령줄: ng serve --host 0.0.0.0 --port 4200
```

터널링 도메인을 관리자 콘솔의 신뢰 도메인에 추가(개발 단계)하고, 검증 파일을 로컬 정적 디렉터리에 두면 검증을 통과합니다.

**방안 2: hosts + mkcert(공인망 불필요, 순수 페이지 연동에 적합)**

```bash
mkcert -install
mkcert attendance.yourcompany.com        # 로컬 신뢰 인증서 생성
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

> 주의: hosts 방안은 브라우저의 인증서 검증만 통과시킬 수 있습니다. WeCom 클라이언트의 OAuth 인증은 여전히 실제 WeCom 서버를 거쳐 다시 리다이렉트되며, 실제 휴대폰 디버깅 시 휴대폰은 당신 컴퓨터의 hosts를 사용할 수 없습니다. 따라서 **실기기 디버깅에는 반드시 인트라넷 터널링 도메인을 사용해야 합니다**.

**백엔드 로컬 기동**:

```bash
cd ~/work/code/attendance-backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

## 3. H5 프런트엔드 프로젝트 연동

### 3.1 디렉터리 구조(기존 Angular 프로젝트를 재사용하고 모바일 모듈만 추가)

새 프로젝트를 만들 필요는 없습니다. 기존 Angular + TypeScript 프로젝트에 모바일용 지연 로딩 모듈(feature module / routes)과 WeCom 어댑션 계층만 추가하면 됩니다:

```
attendance-web/
├── src/
│   ├── main.ts
│   ├── index.html                   # 여기 <script>로 jweixin을 불러와도 됨
│   ├── app/
│   │   ├── app.routes.ts            # 라우트 총 진입점(PC/모바일 분기)
│   │   ├── mobile/                  # WeCom 내 H5 모바일(지연 로딩 모듈)
│   │   │   ├── mobile.routes.ts     # 모바일 서브 라우트
│   │   │   ├── guards/
│   │   │   │   └── wecom-auth.guard.ts   # 자동 로그인 라우트 가드(CanActivate)
│   │   │   └── pages/
│   │   │       ├── checkin/checkin.component.ts      # 체크인 첫 화면
│   │   │       ├── records/records.component.ts      # 체크인 기록
│   │   │       ├── todo/todo-list.component.ts       # 결재 대기 태스크(Activiti tasks)
│   │   │       ├── todo/approval-detail.component.ts # 결재 상세(회람/또는결재 진행 상황)
│   │   │       ├── apply/makeup-apply.component.ts   # 보강 신청(프로세스 트리거)
│   │   │       └── oauth/oauth-callback.component.ts # OAuth 콜백 랜딩 페이지
│   │   ├── core/
│   │   │   ├── interceptors/
│   │   │   │   └── auth.interceptor.ts   # HttpClient 인터셉터(JWT 주입, 401 재로그인)
│   │   │   └── services/            # 기존 업무 Service 재사용
│   │   │       ├── checkin.service.ts
│   │   │       └── approval.service.ts
│   │   └── wecom/                   # WeCom 어댑션 계층(이번에 추가하는 핵심)
│   │       ├── env.service.ts       # WeCom 환경 여부, UA 판단
│   │       ├── oauth.service.ts     # OAuth2 자동 로그인 점프 로직
│   │       ├── jssdk.service.ts     # wx.config / agentConfig / 서명
│   │       └── device.service.ts    # 위치, 사진 촬영, 스캔 래핑
├── public/ (또는 src/)
│   └── WW_verify_xxxx.txt           # 도메인 소유권 검증 파일(정적 리소스 루트에 배치)
└── angular.json
```

### 3.2 WeCom JS-SDK 도입

WeCom H5는 `jweixin` 모듈을 사용합니다(위챗 공식계정 JSSDK와 동일한 기원이며, WeCom이 그 위에 `wx.agentConfig`와 기업 전용 인터페이스를 확장했습니다):

```bash
npm install weixin-js-sdk --save
# 또는 index.html에 직접 도입
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
    // WeCom UA는 wxwork와 micromessenger를 모두 포함
    return /wxwork/.test(ua) && /micromessenger/.test(ua);
  }

  /** iOS 여부(JS-SDK 서명 URL 처리에 차이가 있음, 5장 참고) */
  isIOS(): boolean {
    return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  }
}
```

### 3.3 라우트와 자동 로그인 가드

모바일의 모든 업무 라우트는 동일한 `CanActivate` 가드 아래에 겁니다: 시스템 토큰이 없으면 OAuth 자동 로그인을 시작하고, 로그인 성공 후 원래 페이지로 돌아갑니다. 이것이 「앱을 누르면 자동 로그인」을 구현하는 마스터 스위치이며, 4장에서 자세히 다룹니다.

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
  // OAuth 콜백 랜딩 페이지: 가드를 걸지 않음
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

  // 핵심: 로그인 여부를 보장; 미로그인 시 redirectToWecomAuth 내부에서 OAuth로 전체 페이지 점프를 트리거
  if (oauth.hasToken()) {
    return true;
  }
  oauth.redirectToWecomAuth(state.url);   // 현재 페이지를 떠남
  return new Promise<boolean>(() => false); // 이번 네비게이션을 차단하고 전체 페이지 점프를 대기
};
```

루트 라우트에서 `mobile` 경로로 전체 모바일 모듈을 지연 로딩합니다:

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
## 4. OAuth2 무소음 자동 로그인(SSO) 전체 체인

이것이 전체 연동의 핵심입니다. 목표로 하는 효과는 다음과 같습니다: 직원이 WeCom에서 앱 아이콘을 누르면(또는 결재 메시지 카드를 누르면), 페이지가 열리는 과정에서 **로그인 페이지도, 확인 버튼도 전혀 없이**, 1~2초 후에 바로 업무 페이지에 도달하고 백엔드는 이미 "그가 시스템의 어떤 사람인지" 알고 있는 상태입니다.

### 4.1 인증 모델 선택: snsapi_base

WeCom 웹 인증은 두 가지 scope를 지원합니다:

| scope | 확인 팝업 여부 | 얻을 수 있는 것 | 적용 |
|-------|-----------|-----------|------|
| `snsapi_base` | **무소음, 팝업 없음** | 구성원 userid만(백엔드에서 교환) | 기업 내부 앱 자동 로그인, **이 글에서 채택** |
| `snsapi_privateinfo` | 사용자의 수동 확인 필요 | userid + 민감 정보(휴대폰/이메일 등, 구성원 동의 필요) | 추가 개인정보 수집이 필요한 극히 일부 시나리오 |

기업 내부 자가구축 앱이고 앱 노출 범위에 사용자가 이미 포함된 경우, `snsapi_base`는 WeCom 클라이언트 내에서 완전히 조용하게 동작합니다——이것이 바로 자동 로그인의 기반입니다. 이 단계에서 휴대폰 번호나 이메일을 가져올 필요는 없습니다(그런 정보는 서버 주소록 API로 userid를 통해 조회하면 됨). 따라서 항상 `snsapi_base`를 사용합니다.

### 4.2 전체 프로세스 시퀀스

```
WeCom 클라이언트      H5 프런트엔드(WebView)    업무 백엔드            WeCom 서버
    │                   │                     │                     │
    │ 앱 메인 페이지 열기 │                     │                     │
    │──────────────────▶│                     │                     │
    │                   │ 라우트 가드: 토큰 없음│                     │
    │                   │ 302 인증 링크로 점프  │                     │
    │◀──────────────────│                     │                     │
    │ 무소음 인증(인지 없음)│                    │                     │
    │───────────────────────────────────────▶│                     │
    │ 302 콜백 callback?code=xxx&state=yyy로 리다이렉트              │
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
    │                   │                     │ userid→시스템 계정 조회/생성│
    │                   │                     │ JWT 발급            │
    │                   │◀────────────────────│                     │
    │                   │ 토큰 저장, 목적 페이지로 점프│              │
    │                   │ 이후 요청에 JWT 포함  │                     │
```

두 가지 핵심 포인트에 주의하세요:

1. **code는 반드시 백엔드에서만 교환**: 프런트엔드는 WeCom API를 절대 직접 호출하지 않습니다(secret이 노출됨). 프런트엔드는 "점프 가이드"와 "리다이렉트 URL의 code를 백엔드에 전달"만 담당합니다.
2. **인증 링크는 프런트엔드에서 조립하든 백엔드에서 조립하든 상관없지만**, `state`를 통한 CSRF 방지와 "로그인 후 원래 페이지로 리다이렉트"하는 로직은 반드시 직접 관리해야 합니다.

### 4.3 1단계: 인증 링크 생성 및 점프

인증 링크 형식:

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
| `appid` | 기업 corpid(이름은 appid지만 입력하는 값은 corpid) |
| `redirect_uri` | 인증 후 리다이렉트 주소, URL Encode 필요, 반드시 신뢰 도메인 하위여야 함 |
| `response_type` | 고정값 `code` |
| `scope` | `snsapi_base` |
| `agentid` | 자가구축 앱 agentid(**반드시 포함**, 일부 버전에서 이 앱의 신원을 얻지 못하는 경우가 있음) |
| `state` | 사용자 정의 파라미터, WeCom이 그대로 반환; CSRF 방지 + 리다이렉트 목적 경로 전달에 사용 |
| `#wechat_redirect` | 고정 접미사, 반드시 hash 형태로 끝나야 함 |

프런트엔드에서는 주입 가능한 `WecomOAuthService`(`src/app/wecom/oauth.service.ts`)로 래핑합니다:

```typescript
import { Injectable, inject } from '@angular/core';
import { WecomEnvService } from './env.service';

@Injectable({ providedIn: 'root' })
export class WecomOAuthService {
  private readonly env = inject(WecomEnvService);

  private readonly CORP_ID = 'ww your_corpid';        // corpid는 고민감 정보가 아니어서 프런트엔드에 둘 수 있음
  private readonly AGENT_ID = '1000002';              // agentid도 마찬가지로 공개 가능
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

  /** 자동 로그인 시작: WeCom 인증 주소로 전체 페이지 점프 */
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

> corpid, agentid는 "공개 식별자"입니다(인증 링크는 애초에 브라우저에 평문으로 나타남). 프런트엔드에 두어도 문제없습니다. 진짜 키는 secret뿐이며, 이는 영원히 서버에만 존재합니다.

### 4.4 2단계: 콜백 랜딩 페이지에서 code로 token 교환

`/mobile/oauth/callback?code=xxx&state=yyy`로 리다이렉트된 후, 콜백 페이지는 세 가지 일을 합니다: state 검증 → code를 백엔드로 전송 → JWT를 받은 후 원래 목적 페이지로 점프.

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

    if (!code) { this.errMsg.set('인증 실패: code가 없습니다'); return; }

    // 1. state 검증, CSRF 방지: 점프 전에 저장한 nonce여야 함
    const savedNonce = sessionStorage.getItem('wx_state_nonce');
    if (!state || state !== savedNonce) {
      this.errMsg.set('로그인 상태 검증에 실패했습니다. 앱에 다시 진입해 주세요');
      return;
    }
    const redirectPath = sessionStorage.getItem(`wx_state_${state}`) || '/mobile/checkin';

    try {
      // 2. code를 백엔드에 전달해 시스템 JWT로 교환
      const { token } = await firstValueFrom(this.auth.loginByWecomCode(code));
      localStorage.setItem('sys_token', token);
      sessionStorage.removeItem(`wx_state_${state}`);
      sessionStorage.removeItem('wx_state_nonce');
      // 3. 원래 가려던 페이지로 복귀(특정 결재 대기 태스크 상세일 수도 있음)
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

  /** code를 JWT로 교환: token이 필요 없는 소수의 인터페이스 중 하나(인터셉터에서 통과) */
  loginByWecomCode(code: string): Observable<WecomLoginResp> {
    return this.http
      .post<{ code: number; message: string; data: WecomLoginResp }>(
        '/api/auth/wecom/login', { code })
      // 백엔드 공통 응답 봉투 { code, message, data }를 분해(에러 코드 처리는 인터셉터에서 공통 처리 가능)
      .pipe(map((resp) => resp.data));
  }
}
```

### 4.5 3단계: 백엔드에서 code로 userid 교환(신원 인증 핵심)

백엔드는 code를 받은 후 먼저 access_token을 얻고, 두 번 인터페이스를 호출해야 합니다:

- `auth/getuserinfo`: code → userid(기업 내부 구성원) 또는 openid(비기업 구성원/외부 연락처)
- userid를 얻은 후, 필요 시 `user/get`(주소록)으로 성명, 부서, 휴대폰 번호를 보완

**인터페이스 1: 접근 자격 증명 획득**

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

`access_token`이 반환됩니다(유효기간 7200초). access_token은 반드시 집중 관리해야 하며(Redis 캐시 + 분산 락, 8장 참고), 프런트엔드와 다른 서비스는 직접 획득하지 않습니다.

**인터페이스 2: code를 userid로 교환**

```
GET https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=TOKEN&code=CODE
```

기업 내부 구성원의 응답:

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "userid": "zhangsan",
  "user_ticket": "xxx"
}
```

> 반환 값에 `userid` 없이 `openid`만 있다면 현재 사용자가 해당 기업 앱의 노출 범위에 없다는 뜻입니다(외부 연락처일 수 있음). 자동으로 계정을 만들지 말고, 로그인을 거부하고 관리자에게 권한 개통을 문의하도록 안내해야 합니다.

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
     * H5 OAuth 무소음 로그인: code를 userid로 교환하고 시스템 계정에 바인딩한 뒤 JWT 발급
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
        // 1. code를 userid로 교환
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
            // openid만 있음: 기업 내부 구성원이 아니며 앱 노출 범위 밖
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE,
                    "현재 계정은 앱 인증 범위에 없습니다. 관리자에게 문의하세요");
        }

        // 2. userid를 시스템 계정에 매핑(핵심, 4.6 참고)
        SysUser user = userService.getOrBindByWecomUserId(wecomUserId);
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "계정이 비활성화되었습니다");
        }

        // 3. 시스템 고유 JWT를 발급해 기존 인증 체계를 재사용
        String jwt = jwtTokenProvider.generateToken(user.getId(), user.getUsername());
        return WecomLoginVO.builder()
                .token(jwt)
                .userInfo(UserInfoVO.of(user))
                .build();
    }
}
```

### 4.6 4단계: WeCom 계정과 시스템 계정 바인딩(기존 시스템에서 가장 중요한 설계)

이것이 "기존 업무 시스템"과 "처음부터 만드는 시스템"의 가장 큰 차이입니다. 시스템에는 이미 많은 계정이 있고(사번, 이메일, 도메인 계정으로 로그인할 수 있음), WeCom에서 들어오는 정보는 userid 하나뿐입니다. **단순히 "userid로 새 사용자를 만드는" 방식은 안 됩니다**. 그렇게 하면 동일한 사람이 두 개의 계정이 되어 근태 기록과 Activiti 결재 대기 태스크가 모두 어긋나게 됩니다.

세 가지 바인딩 전략을 권장하며, 기업 실정에 맞게 선택합니다:

**전략 A: 사번/계정이 일치하면 자동 바인딩(가장 권장, 운영 부담 제로)**

WeCom 주소록의 "계정" 필드는 보통 기업 공통 사번이고, WeCom userid 역시 사번인 경우가 많습니다. userid = 시스템 username(또는 사번)으로 규약하고, 로그인 시 바로 계정으로 연결합니다:

```java
/**
 * WeCom userid로 시스템 계정 바인딩
 * 규약: WeCom userid와 시스템 사번(username)은 일치
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
        // 바인딩 관계를 생성해 두면 다음 번에는 바로 적중
        user.setWecomUserId(wecomUserId);
        userMapper.updateById(user);
        log.info("시스템 계정 {}이(가) WeCom userid {}에 자동 바인딩되었습니다", user.getUsername(), wecomUserId);
        return user;
    }

    // 3. 여전히 매칭 안 됨: 조용히 계정을 만들지 말고 바인딩 유도 상태를 반환해 관리자 또는 셀프 바인딩 프로세스가 처리
    throw new BusinessException(ErrorCode.WECOM_ACCOUNT_NOT_BOUND,
            "WeCom 계정과 연결된 시스템 계정을 찾을 수 없습니다. 관리자에게 바인딩을 문의하세요");
}
```

**전략 B: 셀프 바인딩(계정 체계가 통일되지 않은 경우)**

처음 로그인할 때 자동 매칭이 되지 않으면, 사용자가 시스템 계정/비밀번호를 한 번 입력해 바인딩을 완료합니다. 이후 해당 wecom_user_id와 user_id의 매핑이 DB에 저장되어 영구적으로 자동 로그인이 적용됩니다:

```
최초 WeCom 로그인 → 백엔드가 매핑 없음을 발견 → NEED_BIND 상태 반환
  → H5가 바인딩 페이지 표시(시스템 계정/비밀번호 입력, 또는 사번 + SMS 인증코드 입력)
  → 백엔드 검증 통과 → sys_user.wecom_user_id에 기록 → JWT 발급
```

바인딩 관계는 한 번만 생성되고, 자격 증명은 검증 후 즉시 폐기하며 평문 비밀번호를 저장하지 않습니다.

**전략 C: 관리자 사전 바인딩 / 주소록 동기화**

주소록 API(`user/list`)로 부서 단위 배치 동기화를 수행해 WeCom userid와 시스템 계정을 사번 기준으로 정렬합니다(동기화 방안은 8장에서 제시). 오픈 전 일괄 초기화에 적합합니다.

**사용자 테이블 개조**(기존 사용자 테이블에 필드만 추가, 기존 구조는 건드리지 않음):

```sql
ALTER TABLE sys_user ADD COLUMN wecom_user_id VARCHAR(64);
COMMENT ON COLUMN sys_user.wecom_user_id IS 'WeCom userid(외부 신원)';
CREATE UNIQUE INDEX uk_sys_user_wecom ON sys_user (wecom_user_id) WHERE wecom_user_id IS NOT NULL;
```

> 설계 요점: **내부 userId는 그대로 유지**. 근태 기록 외래키, Activiti의 `ACT_RU_TASK.ASSIGNEE_`, 후보자 그룹은 모두 계속 시스템 내부 userId(username)를 사용합니다. WeCom userid는 "로그인 시 신원 확인"과 "푸시 시 주소 지정"에만 쓰이며, `sys_user.wecom_user_id` 매핑 계층으로 디커플링합니다. 이렇게 하면 워크플로우 정의를 오염시키지 않으면서 PC 계정/비밀번호, 다른 SSO 등 로그인 방식의 공존도 유지됩니다.

### 4.7 5단계: JWT와 기존 인증 체계의 끊김 없는 연결

자동 로그인으로 userid를 얻은 이후의 요청은 PC와 완전히 동일하게 시스템의 기존 JWT/Session 인증을 따릅니다. 이로써 근태, 결재 인터페이스는 변경이 제로입니다.

프런트엔드는 Angular의 `HttpInterceptor`로 토큰을 일괄 주입하고 401 시 자동 로그인을 다시 수행합니다:

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
    authed = req.clone({ setHeaders: { Authorization: *** ${token}` } });
  }

  return next(authed).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // 토큰 만료: WeCom 내에서는 다시 무소음 자동 로그인(인지 없음), 외부 환경은 로그인 페이지로 점프
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

> 자동 로그인 인터페이스 `/api/auth/wecom/login` 자체는 토큰이 없으며, 인터셉터는 "로컬 스토리지에 토큰 없음" 상황을 그대로 통과시키므로 특별한 판단이 필요 없습니다. 401일 때만 자동 재로그인이 트리거됩니다.

백엔드는 기존 Spring Security 설정(SecurityFilterChain Bean 형식)을 그대로 사용하고, WeCom 로그인 엔드포인트와 콜백 엔드포인트만 통과시킵니다:

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
            // 프런트/백 분리 + JWT: 무상태, CSRF 비활성화, JWT 필터가 토큰을 파싱
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter(),
                    UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
    // JwtAuthenticationFilter: Authorization 헤더를 파싱해 SecurityContext에 기록, 기존 구현을 그대로 사용
}
```

> 프로젝트가 여전히 Spring Security 5.x의 `WebSecurityConfigurerAdapter`를 사용한다면, 동등한 작성법은 `configure(HttpSecurity)`를 재정의하고 동일한 두 경로에 `permitAll()` 및 `csrf().disable()`을 적용하는 것입니다. 자동 로그인으로 발급된 JWT는 기존 JWT 필터가 일괄 검증하므로 계정/비밀번호 로그인과 완전히 공유됩니다.

이로써 "앱 열기 → 자동 로그인 → 자신의 근태와 결재 대기 태스크를 바로 확인" 체인이 완전히 연결되었으며, **근태와 Activiti의 기존 인터페이스, 권한, 데이터는 한 줄도 바꾸지 않았습니다**.
## 5. JS-SDK: H5에서 위치, 사진 촬영, 스캔 사용하기

근태 시나리오는 위치, 사진 촬영, 스캔을 떼놓을 수 없습니다. H5는 미니프로그램처럼 네이티브 API를 직접 호출할 수 없어서 WeCom JS-SDK를 통해 서명 인증을 거친 후 호출해야 합니다. 이 장에서는 바로 적용 가능한 서명 방안을 제시하고, 가장 함정에 빠지기 쉬운 iOS/Android 서명 URL 차이를 중점적으로 다룹니다.

### 5.1 wx.config와 wx.agentConfig

WeCom JS-SDK에는 두 계층의 구성이 있는데, 초보자가 가장 헷갈리는 부분입니다:

| 구성 | 용도 | 서명 티켓 |
|------|------|----------|
| `wx.config` | 기본 구성을 주입하고 일반 기능(공유, 위치 `getLocation`, 스캔 `scanQRCode`, 이미지 선택 등 대부분의 인터페이스)을 호출 | `jsapi_ticket`으로 서명 |
| `wx.agentConfig` | 현재 **자가구축 앱** 신원을 주입하고 WeCom 전용 인터페이스(예: `selectEnterpriseContact` 구성원 선택, 일부 결재 관련 인터페이스)를 호출 | `get_jsapi_ticket`(기업 앱 티켓)으로 서명 |

근태 체크인의 위치/사진/스캔은 `wx.config` 통과만으로 충분합니다. "조직도 기반 결재자/참조인 선택기" 같은 기업 전용 기능만 추가로 `agentConfig`가 필요합니다.

### 5.2 백엔드: jsapi_ticket 관리와 서명

`jsapi_ticket`은 access_token으로 교환하며 유효기간은 7200초, 마찬가지로 집중 캐시가 필요합니다:

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

    /** 프런트엔드가 페이지에 진입한 후 현재 URL로 서명을 교환 */
    @GetMapping("/config")
    public Result<WxConfigSignatureVO> config(@RequestParam("url") String url) {
        return Result.success(jsapiService.buildConfigSignature(url));
    }
}
```

### 5.3 프런트엔드: 서명 초기화(iOS 진입 페이지 문제 중점 처리)

JS-SDK의 가장 고전적인 함정: **Android는 현재 페이지 URL로 서명하고, iOS(WKWebView)는 앱에 처음 진입했을 때의 진입 페이지 URL로 서명**합니다. SPA에서는 프런트엔드 라우트 전환이 실제 페이지 새로고침을 일으키지 않으므로, iOS에서 "현재 라우트의 href"로 서명하면 랜딩 첫 페이지가 아닌 이상 `wx.config`에서 반드시 `invalid signature` 오류가 발생합니다.

통일된 해법: **진입 페이지에서 첫 URL을 기록해 둔 뒤 이후 모든 서명에 그것을 사용(iOS). Android는 항상 현재 URL을 사용.**

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

  /** 서명에 참여할 URL 추출: #hash 부분 제거(WeCom 서명 규칙상 url에 hash 미포함) */
  private signableUrl(href: string): string {
    const idx = href.indexOf('#');
    return idx >= 0 ? href.slice(0, idx) : href;
  }

  /** 진입 페이지 URL 기록(iOS만 필요, 앱 기동 직후 라우트 점프 전에 한 번 호출) */
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

  /** wx.config 완료를 보장(전역에서 한 번만, SPA 내에서는 재사용 가능) */
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

앱 기동 시(최초 라우트 점프 전) 가능한 한 빨리 iOS 진입 URL을 기록하며, `APP_INITIALIZER`를 사용할 수 있습니다:

```typescript
// src/app/app.config.ts에 기동 초기화로 등록
import { APP_INITIALIZER } from '@angular/core';

function recordWxEntryUrl() {
  const jssdk = inject(WecomJssdkService);
  const env = inject(WecomEnvService);
  return () => {
    // ensureWxConfig의 진입 기록 로직을 한 번 호출(iOS는 최초 점프 전에 랜딩 페이지 URL을 고정)
    if (env.isInWecom()) {
      // wx.config 프리히팅; 블로킹하지 않아도 되며, 실제 위치/스캔 호출 시 service 내부에서도 폴백 처리
      jssdk.ensureWxConfig().catch(() => void 0);
    }
  };
}

// providers에 추가:
// { provide: APP_INITIALIZER, useFactory: recordWxEntryUrl, multi: true }
```

> 핵심은 iOS 진입 URL이 어떤 프런트엔드 라우트 점프도 일어나기 전에 `location.href`를 읽어 고정하는 것입니다. `APP_INITIALIZER`(Angular 라우트 기동 전 실행)에 두는 것이 가장 안정적입니다. 서명을 프리히팅하지 않더라도 최소한 이 훅에서 진입 URL을 sessionStorage에 기록해야 합니다.

> 라우트 모델 권장사항: hash와 서명에 따른 인지 부담을 줄이려면 H5 모바일은 **history 모델**을 사용할 수 있습니다. hash 모델을 쓴다면 반드시 위 `signableUrl`처럼 `#`에서 잘라내어, 프런트/백엔드가 서명에 참여하는 URL이 완전히 일치하도록 하고, `encodeURIComponent` 사용 여부도 양쪽이 동일하게 맞춰야 합니다.

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

  /** JS-SDK 위치(gcj02 화성 좌표계, 국내 지도와 일치) */
  getLocation(): Promise<LngLat> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res: any) => resolve({
          longitude: res.longitude,
          latitude: res.latitude,
          accuracy: res.accuracy,
        }),
        fail: (err: any) => reject(new Error('위치 측위에 실패했습니다. 위치 권한을 확인하세요: ' + err.errMsg)),
      });
    }));
  }

  /** 카메라 촬영 호출(카메라만, 앨범 불가, 부정행위 방지), localId 반환 */
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
        needResult: 1,              // 1=결과를 프런트엔드가 직접 처리
        scanType: ['qrCode'],
        success: (res: any) => resolve(res.resultStr),
        fail: (err: any) => reject(new Error('스캔 실패: ' + err.errMsg)),
      });
    }));
  }
}

/** Haversine 거리(미터), 순수 함수는 공통 utils에 둘 수 있음 */
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

출퇴근 체크인 컴포넌트 호출(`checkin.component.ts`). 안내 메시지는 팀에서 기존에 사용하는 UI 라이브러리(예: NG-ZORRO의 `NzMessageService`)를 사용합니다:

```typescript
// src/app/mobile/pages/checkin/checkin.component.ts（발췌）
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
      this.msg.error(`체크인 범위를 벗어났습니다. 회사와의 거리 ${Math.round(dist)}m`);
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

백엔드 체크인 인터페이스는 시스템의 기존 구현과 동일합니다(거리 2차 검증, 중복 체크인 방지, DB 저장, 푸시). 이 로직들은 이미 오래전부터 존재하며 H5는 단지 새로운 호출자일 뿐입니다. 백엔드는 **반드시 거리를 재검증해야 하며**, 프런트엔드가 전달한 위도/경도를 그대로 신뢰해서는 안 됩니다(프런트엔드 좌표는 패킷 캡처로 변조될 수 있음).

### 5.5 사진 촬영 체크인과 QR 코드 스캔 체크인

사진 촬영과 QR 스캔은 이미 5.4의 `WecomDeviceService`에 캡슐화되어 있습니다(`takePhoto()`는 localId를 반환하고 `scanQRCode()`는 QR 코드 내용을 반환). 컴포넌트에서 직접 await으로 호출하면 됩니다. `takePhoto`로 얻은 localId 이미지는 업로드가 추가로 필요합니다:

- `wx.uploadImage`로 먼저 이미지를 기업위챗(WeCom)에 업로드하여 `serverId`를 얻은 뒤, 백엔드가 다시 위챗워크 미디어 인터페이스 `media/get`을 호출해 인트라넷으로 가져오는 방식 — H5에서 파일을 직접 업로드하고 싶지 않은 시나리오에 적합합니다.
- 또는 localId를 canvas에 그려 Blob으로 변환한 뒤 Angular의 `FormData` + `HttpClient`로 기존 파일 서비스에 직접 POST하여 시스템의 기존 첨부파일 저장소를 재사용하는 방식.

두 방식 모두 백엔드는 기존의 사진 저장 및 워터마크(시간+위치+기기 정보) 로직을 그대로 사용합니다. QR 스캔 체크인의 경우 백엔드가 QR 코드 토큰의 유효성과 만료 시간을 검증하고 위치 기반 이중 검증을 적용하며, 마찬가지로 기존 인터페이스를 재사용합니다.
## 6. Activiti 복잡한 결재 플로우의 위챗워크 적용

근태 관련 결재(근태 보정(보강), 휴가, 외근, 초과근무 이의신청 등) 플로우는 이미 Activiti에 정의되어 동작하고 있으므로, 위챗워크에서 플로우를 다시 구현할 필요가 없습니다. 다음 세 가지만 하면 됩니다: **결재 대기 태스크를 꺼내고, 결재 조작을 연결하고, 결재 대기 태스크를 능동적으로 위챗워크에 푸시하는 것**. 이 장에서는 회람(전원 승인), 또는결재(아무 1명 승인), 조직도 기반 결재 세 가지 대표 노드를 다루며 재사용 방법을 설명합니다.

### 6.1 먼저 담당자 식별자를 통일하라

Activiti는 태스크 담당자(`ACT_RU_TASK.ASSIGNEE_`) 또는 후보자/후보 그룹(`ACT_RU_IDENTITYLINK`)을 하나의 문자열로 식별합니다. 반드시 보장해야 할 점: **플로우 정의에 하드코딩되었거나 런타임에 계산된 담당자 식별자가 `sys_user.username`(내부 계정, 즉 wecom_user_id에 바인딩된 고유 키)과 일치해야 한다는 것**입니다.

전 시스템에서 사번/사용자명(예: `zhangsan`)을 고유 인원 식별자로 통일하는 것을 권장합니다:

- Activiti assignee / candidateUser = `sys_user.username`
- 위챗워크 매핑 = `sys_user.wecom_user_id`（많은 기업에서 역시 사번을 쓰므로 둘이 같을 수 있지만 논리적으로는 분리）
- 위챗워크 메시지 푸시 시: `username → sys_user 조회 → wecom_user_id 획득`을 `touser`로 사용

이렇게 하면 Activiti의 플로우 정의, UEL 표현식, 후보자 조회 모두 위챗워크를 위해 전혀 변경할 필요가 없습니다.

### 6.2 세 가지 대표 노드의 플로우 정의 표현

"근태 보정(보강) 신청" 플로우를 예로 들어 회람(전원 승인), 또는결재(아무 1명 승인), 조직도 기반 결재를 BPMN으로 작성하는 방법을 시연합니다.

**회람(전원 승인, 여러 명이 모두 동의해야 통과)** — 다중 인스턴스 노드(multiInstanceLoopCharacteristics) + 완료 조건을 사용합니다:

```xml
<userTask id="countersignLeaderHr" name="직속 상위자와 HR 회람">
  <documentation>모든 사람이 결재하고 모두 동의해야 통과하며, 한 명이라도 반려하면 종료됩니다</documentation>
  <multiInstanceLoopCharacteristics isSequential="false"
                                   activiti:collection="${countersignUsers}"
                                   activiti:elementVariable="approver">
    <completionCondition>${approveResultList.size() == nrOfInstances
        &amp;&amp; !approveResultList.contains('REJECT')}</completionCondition>
  </multiInstanceLoopCharacteristics>
  <userTask><extensionElements/></userTask>
</userTask>
```

- `isSequential="false"`: 병렬 회람. 동시에 각 사람에게 태스크가 하나씩 생성됩니다
- `nrOfInstances`: 회람 총인원; `approveResultList`: 각 사람의 결재 결과를 수집하는 플로우 변수
- 완료 조건: 모든 사람이 처리를 완료하고 REJECT가 없을 때만 다음으로 진행

**또는결재(아무 1명 승인, 여러 명 중 임의의 한 명만 처리하면 됨)** — 마찬가지로 다중 인스턴스지만 완료 조건을 "1개 처리되면 종료"로 변경합니다. 더 일반적인 방식은 후보자(candidateUsers)를 사용하는 것으로, 하나의 태스크를 여러 명이 볼 수 있고 먼저 클레임한 사람이 처리합니다:

```xml
<userTask id="orSignDuty" name="당직조 또는결재" activiti:candidateUsers="${dutyGroupUsers}">
  <documentation>후보 그룹 중 아무 한 명이 클레임하고 결재하면 됩니다</documentation>
</userTask>
```

또는 다중 인스턴스 + `nrOfCompletedInstances >= 1`로 각자에게 결재 대기 태스크를 하나씩 만들고 한 명이 처리하면 나머지는 자동으로 취소되도록 구현할 수도 있습니다.

**조직도 기반 동적 결재** — 담당자를 하드코딩하지 않고 플로우 표현식이 조직도에서 실시간으로 계산합니다(신청인 → 직속 부서 책임자 → 담당 임원):

```xml
<userTask id="deptLeaderApprove" name="부서 책임자 결재"
          activiti:assignee="${orgService.findLeader(applyUserId)}"/>
<userTask id="directorApprove" name="담당 임원 결재"
          activiti:assignee="${orgService.findDirector(applyUserId)}"/>
```

`orgService`는 Activiti 표현식 컨텍스트에 등록된 Spring Bean으로, 내부에서 부서 트리를 따라 위로 책임자를 조회합니다. 부서 책임자가 인사이동된 경우 새 플로우 인스턴스는 자동으로 최신 조직도에 따라 라우팅되므로 플로우 정의를 변경할 필요가 없습니다.

> 이 BPMN 세트는 PC에서 이미 동작하고 있습니다. 위챗워크는 단지 "처리 진입점"을 하나 추가할 뿐이고, 처리 동작의 하위 계층은 동일한 `taskService.complete()`를 호출합니다. 따라서 회람 카운트, 또는결재 클레임, 조직 라우팅, 게이트웨이 조건이 모두 엔진에 의해 동일하게 보장되며, "PC가 따르는 플로우와 모바일이 따르는 플로우가 다른" 문제는 존재하지 않습니다.

### 6.3 위챗워크 결재 대기 태스크 목록과 상세

**결재 대기 태스크 목록** — Activiti의 TaskQuery를 직접 사용해 현재 로그인 사용자의 username으로 결재 대기 태스크를 조회합니다(회람 시 각 사람에게 태스크가 하나씩 있음; 또는결재 후보 태스크는 taskCandidateUser로 조회):

```java
/**
 * 모바일 결재 Service（Activiti TaskService 재사용）
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

    /** 현재 사용자의 결재 대기 태스크（직접 지정 + 또는결재 후보, 미클레임 포함） */
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
                .candidate(Objects.isNull(task.getAssignee()))  // 또는결재 미클레임
                .build();
    }
}
```

**결재 상세** — 양식, 회람 진행 상황(누가 동의했고 누가 처리 대기인지), 결재 의견 타임라인을 표시합니다:

```java
/** 회람 진행 상황: 이력 태스크 + 현재 태스크에서 각 담당자의 상태를 집계 */
public List<ApproverProgressVO> countersignProgress(String processInstanceId) {
    List<HistoricTaskInstance> done = historyService.createHistoricTaskInstanceQuery()
            .processInstanceId(processInstanceId)
            .finished()
            .list();
    List<Task> pending = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .list();
    // 병합: done에는 결재 의견(COMMENT)이 있고, pending은 "결재 대기"로 표시
    // 조립 코드는 생략, [{user, userName, status: APPROVED/REJECTED/PENDING, comment, time}] 반환
    return mergeProgress(done, pending);
}
```

프런트엔드의 `ApprovalDetailComponent`는 `nodeType`에 따라 렌더링합니다: 회람은 여러 아바타 진행 바(처리완료/대기)를 표시하고, 또는결재는 "당직조 멤버 누구나 결재할 수 있으며, 클릭하여 클레임 후 처리하세요"를 표시합니다.

### 6.4 클레임(또는결재)과 결재 조작

또는결재의 후보 태스크는 반드시 먼저 클레임(claim)하여 assignee가 되어야 처리할 수 있습니다. 회람 태스크는 직접 지정 방식이므로 클레임을 건너뜁니다.

```java
@Transactional(rollbackFor = Exception.class)
public void approve(String taskId, String username, boolean agree, String comment) {
    Task task = taskService.createTaskQuery().taskId(taskId).active().singleResult();
    if (task == null) {
        throw new BusinessException(ErrorCode.TASK_NOT_FOUND, "결재 대기 태스크가 존재하지 않거나 이미 처리되었습니다");
    }

    // 또는결재: 후보자 태스크는 먼저 클레임
    if (task.getAssignee() == null) {
        boolean isCandidate = taskService.createTaskQuery()
                .taskId(taskId).taskCandidateUser(username).count() > 0;
        if (!isCandidate) {
            throw new BusinessException(ErrorCode.NO_PERMISSION, "이 태스크를 처리할 권한이 없습니다");
        }
        taskService.claim(taskId, username);
    } else if (!username.equals(task.getAssignee())) {
        throw new BusinessException(ErrorCode.NO_PERMISSION, "이 태스크는 귀하에게 속하지 않습니다");
    }

    // 결재 의견 기록
    Authentication.setAuthenticatedUserId(username);
    taskService.addComment(taskId, task.getProcessInstanceId(),
            (agree ? "동의: " : "반려: ") + comment);

    // 플로우 변수 기록: 회람 완료 조건이 approveResultList에 의존
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

    // 결재 후 처리: 다음 노드 결재 대기 태스크 푸시, 플로우 종료 시 근태 연동(6.5, 6.6 참고)
    afterTaskComplete(task.getProcessInstanceId(), agree);
}
```

반려 전략은 기업 규칙에 따라 선택할 수 있습니다: 신청인에게 반려(재제출), 이전 노드로 반려, 또는 플로우를 즉시 종료. 근태 보정 시나리오에서는 "한 명이라도 반려하면 종료 + 신청인 통지"가 자주 쓰이며, 이는 바로 회람 완료 조건의 `!contains('REJECT')` 의미와 일치합니다.

### 6.5 결재와 근태 데이터 연동(기존 역량 재사용)

플로우 종료 시 비즈니스 유형에 따라 근태를 다시 기록합니다. 이 로직은 시스템에 이미 있으며, 위챗워크 결재가 트리거하는 것도 동일한 `taskService.complete()`이므로 연동이 당연히 적용됩니다. 근태 보정의 대표적인 처리:

```java
public void afterProcessFinished(String processInstanceId) {
    // 플로우 종료 후 플로우 인스턴스 변수는 이력 테이블로 이관되므로 HistoricVariableInstance에서 비즈니스 변수를 가져옴
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
            // 보정 통과: 해당 날짜의 체크인 기록을 수정/보충 등록(기존 근태 Service)
            attendanceService.applyMakeupCard(
                (Long) vars.get("recordId"),
                (String) vars.get("makeupTime"),
                String.valueOf(vars.get("reason")));
            break;
        case "LEAVE":
            // 휴가 통과: 휴가 기록, 휴가 잔여일 차감
            leaveService.grantLeave(vars);
            break;
        default:
            break;
    }
    notifyApplicant(processInstanceId, true);
}
```

Activiti 플로우 종료 이벤트를 리스닝하여 트리거하는 것이 각 결재 인터페이스에서 수동으로 호출하는 것보다 안정적입니다(PC, 위챗워크, 스케줄 작업 등 어떤 진입점에서 완료해도 거치게 됨):

```java
import org.activiti.engine.delegate.event.ActivitiEntityEvent;
import org.activiti.engine.delegate.event.ActivitiEvent;
import org.activiti.engine.delegate.event.ActivitiEventListener;
import org.activiti.engine.delegate.event.ActivitiEventType;

/**
 * Activiti 플로우 종료 리스너: 결재가 최종 종료된 후 근태와 연동
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
        return false;   // 리스너 예외가 플로우 자체에 영향을 주지 않음
    }
}
```

### 6.6 결재 대기 태스크를 기업위챗(WeCom)에 능동 푸시

H5 결재 대기 태스크 목록만으로는 부족합니다 — 직원이 스스로 들어가서 새로고침하지 않기 때문입니다. 플로우가 이동해 새로운 결재 대기 태스크가 생기면, 백엔드가 능동적으로 "결재 카드"를 다음 담당자의 위챗워크에 푸시해야 합니다. 카드를 클릭하면 H5의 해당 결재 상세 페이지가 바로 열리고, 4장의 자동 로그인(SSO) 덕분에 열자마자 로그인된 상태가 됩니다.

태스크 생성 리스너에서 푸시를 트리거합니다(Activiti 이벤트 리스닝):

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

        // 직접 지정(회람은 각 사람에게 태스크 하나씩) → assignee에게 푸시
        if (StrUtil.isNotBlank(task.getAssignee())) {
            pushToUser(task, task.getAssignee());
        } else {
            // 또는결재 후보 태스크 → 모든 후보자/후보 그룹을 펼친 멤버에게 푸시, 진입 후 선착순 클레임
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
            log.warn("사용자 {}가(이) 기업위챗(WeCom)에 바인딩되지 않아 결재 대기 태스크 푸시를 건너뜁니다", username);
            return;
        }
        wecomMessageService.sendApprovalTodoCard(u.getWecomUserId(), task);
    }

    @Override
    public boolean isFailOnException() {
        return false;   // 푸시 실패가 Activiti의 태스크 생성을 롤백해서는 안 됨
    }
}
```

텍스트 카드 메시지(클릭 시 H5 결재 페이지로 바로 이동):

```json
{
  "touser": "wangwu",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "결재 대기: 리스의 근태 보정 신청",
    "description": "노드: 직속 상위자 결재<br/>보정 일자: 2026-09-08 오전<br/>사유: 외근 고객 현장에서 체크인을 잊음",
    "url": "https://attendance.yourcompany.com/mobile/approval/123456",
    "btntxt": "즉시 결재"
  }
}
```

핵심: **카드 url을 결재 상세 페이지로 바로 연결**하는 것입니다. 직원이 클릭 → 토큰 없음 → 4장 OAuth 무음 자동 로그인(SSO) → 콜백 후 `state`에 담긴 리다이렉트 경로(4.3의 redirectPath 참고)를 통해 이 결재 상세로 돌아옵니다. 이 효과를 구현하려면 메시지 카드 링크에 위챗워크가 정한 자동 로그인 파라미터를 붙이거나, 프런트엔드 가드가 모든 `/mobile/**`에 로그인을 강제하기만 하면 되며 특별한 처리는 필요 없습니다.

**템플릿 카드 버튼 콜백(고급: 페이지를 열지 않고 바로 동의/반려)**

결재자가 메시지 알림에서 바로 "동의/거부"를 누르게 하려면 `template_card`(button_interaction) + 6장의 콜백 수신을 사용하고, 백엔드가 버튼 이벤트를 받은 뒤 바로 `mobileApprovalService.approve()`를 호출하고 카드 상태를 갱신합니다. 이 방식은 결재 동작이 극도로 단순한(원클릭 동의) 노드에 적합합니다; 의견 작성, 회람 상세 확인이 필요한 경우는 여전히 H5로 점프하는 것을 권장합니다. 두 방식의 하위 계층이 호출하는 결재 메서드는 완전히 동일합니다.

### 6.7 조직도 동기화: 동적 결재자에게 푸시할 수 있도록 보장

"조직도 기반 결재"로 동적 계산된 담당자는 username이므로, 푸시 시 그의 wecom_user_id를 조회할 수 있어야 합니다. 두 가지 보장 방식이 있습니다:

1. **주소록 콜백 증분 동기화**(권장, 실시간): `change_contact` 이벤트(멤버 추가/수정/삭제, 부서 변경)를 구독하여 `sys_user`의 wecom_user_id와 부서 소속을 실시간으로 갱신합니다.
2. **정기 전량 동기화**: 매일 새벽에 주소록 부서/멤버 인터페이스를 호출해 전량 동기화를 한 번 수행하여 안전망으로 삼습니다.

```
GET /cgi-bin/department/list?id=0            # 부서 트리
GET /cgi-bin/user/list?department_id=1&fetch_child=1   # 부서 멤버 상세
```

동기화 시 사번(username)으로 매핑하고 위챗워크 userid를 `sys_user.wecom_user_id`에 채워 넣으며 부서 관계를 동기화하여 `orgService.findLeader()` 조직 라우팅과 푸시 주소 지정에 사용합니다. 주소록 조회 인터페이스에는 일일 호출 한도가 있으므로(9.4 참고), 반드시 "증분 콜백 위주 + 매일 1회 전량 동기화를 안전망으로" 방식을 따르고 고빈도 폴링은 하지 마세요.
## 7. 메시지 푸시와 이벤트 콜백

### 7.1 access_token과 메시지 발송

애플리케이션 메시지는 서버에서 일괄 발송하며, 인터페이스는:

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

자주 쓰는 메시지 유형:

- `text`: 근태 리마인더 등 순수 텍스트
- `textcard`: 제목+설명+버튼, 클릭 시 H5로 이동(결재 대기 태스크에 적합)
- `template_card`: 인터랙티브 버튼이 있어 알림 내에서 바로 조작 가능(콜백과 함께 사용)
- `markdown`: 결재 요약 등 리치 텍스트(기업위챗(WeCom) 내에서 지원)

푸시 서비스 캡슐화(`duplicate_check_interval`은 짧은 시간 내 중복 푸시 방지에 사용):

```java
@Service
@Slf4j
public class WecomMessageService {

    @Resource private WecomTokenManager tokenManager;
    @Resource private RestTemplate restTemplate;
    @Value("${wecom.agentid}") private Integer agentId;

    /** 결재 대기 태스크 카드 발송, 클릭 시 H5 결재 상세로 이동 */
    public void sendApprovalTodoCard(String wecomUserId, Task task) {
        Map<String, Object> card = new HashMap<>();
        card.put("title", "결재 대기: " + task.getName());
        card.put("description", "새로운 결재 대기 태스크가 귀하의 처리를 기다리고 있습니다");
        card.put("btntxt", "즉시 결재");
        card.put("url", "https://attendance.yourcompany.com/mobile/approval/" + task.getId());

        Map<String, Object> msg = new HashMap<>();
        msg.put("touser", wecomUserId);
        msg.put("msgtype", "textcard");
        msg.put("agentid", agentId);
        msg.put("textcard", card);
        msg.put("duplicate_check_interval", 1800);

        send(msg);
    }

    public void send(String msg) { /* post message/send, invaliduser/errcode 기록 */ }
}
```

> 응답 본문의 `invaliduser`/`invalidparty`는 반드시 기록해야 합니다: 푸시 대상 중 바인딩되지 않았거나 표시 범위 밖인 사람이 있음을 나타내며, "왜 어떤 사람이 결재 대기 알림을 받지 못하는가"를 조사하는 첫 번째 단서입니다.

### 7.2 콜백 서명 검증과 암호화/복호화

"메시지 수신"을 구성하면 기업위챗(WeCom)이 콜백 URL로 두 종류의 요청을 보냅니다:

- **GET**: 구성 저장 시 URL 유효성 검증. `echostr`을 복호화하여 그대로 반환해야 함
- **POST`: 정식 이벤트 푸시(템플릿 카드 버튼, 주소록 변경). 암호화된 XML이며 서명 검증 + AES 복호화가 필요함

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
            log.error("위챗워크 콜백 URL 검증 실패", e);
            return "";
        }
    }

    /** 이벤트 수신: 반드시 빠르게 success를 반환하고 오래 걸리는 처리는 비동기로 두어 위챗워크 재시도를 방지 */
    @PostMapping(value = "/message", produces = "application/xml")
    public String receive(@RequestParam("msg_signature") String signature,
                          @RequestParam String timestamp,
                          @RequestParam String nonce,
                          @RequestBody String encryptedBody) {
        try {
            callbackService.handleAsync(signature, timestamp, nonce, encryptedBody);
        } catch (Exception e) {
            log.error("위챗워크 콜백 처리 실패", e);
        }
        return "success";   // 비즈니스 성패와 관계없이 먼저 success를 반환하여 위챗워크의 지수 백오프 재시도를 방지
    }
}
```

암호화/복호화를 직접 구현하지 말고 공식 `aes-256` 예제 코드 패키지(기업위챗(WeCom) 공식 Java 버전 `WXBizMsgCrypt`)를 그대로 사용하세요. SHA1 서명 검증, AES-256-CBC 복호화, corpId 검증, XML 조립이 캡슐화되어 있습니다. `Token`, `EncodingAESKey`, `corpid` 세 파라미터는 백오피스 콜백 구성에서 가져옵니다.

### 7.3 템플릿 카드 버튼과 주소록 이벤트 처리

```java
@Service
@Slf4j
public class WecomCallbackService {

    @Resource private MobileApprovalService approvalService;
    @Resource private ContactSyncService contactSyncService;
    @Resource private WXBizMsgCrypt crypt;   // 공식 암호화/복호화 클래스

    /** 복호화 후 이벤트 유형별로 분배 */
    public void handle(String sig, String ts, String nonce, String body) throws Exception {
        String xml = crypt.DecryptMsg(sig, ts, nonce, body);
        // XStream/Digester로 XML을 파싱하여 Event / ChangeType / TaskId / EventKey / FromUserName 추출
        CallbackEvent event = CallbackEvent.parse(xml);

        switch (event.getEvent()) {
            case "template_card_event":
                // 템플릿 카드 버튼: EventKey가 버튼 key, FromUserName이 클릭한 사람의 userid
                onCardButton(event);
                break;
            case "change_contact":
                contactSyncService.handleChange(event.getChangeType(), event.getUserId());
                break;
            default:
                log.info("처리하지 않는 위챗워크 이벤트: {}", xml);
        }
    }

    private void onCardButton(CallbackEvent e) {
        boolean agree = "approve".equals(e.getEventKey());
        String username = contactSyncService.wecomUserIdToUsername(e.getFromUserName());
        // task_id는 카드 발송 시 우리가 생성해 Activiti taskId와 연결하고 Redis/DB에 저장해 회수
        String taskId = taskCardMapping.get(e.getTaskId());
        approvalService.approve(taskId, username, agree, agree ? "동의" : "반려");
        // update_template_card을 호출해 원본 카드를 "동의됨/반려됨"으로 갱신하여 중복 클릭을 방지할 수 있음
    }
}
```

이벤트 처리는 반드시 **멱등**해야 합니다: 위챗워크가 타임아웃으로 동일한 이벤트를 재푸시할 수 있으며, `approve` 내부에서 "태스크 종료/처리 완료" 여부를 판단하므로(6.4에서 active 태스크 조회), 중복 푸시가 2차 결재를 만들지 않습니다. 오래 걸리는 작업(여러 메시지 발송, 여러 테이블 쓰기 등)은 비동기 스레드나 메시지 큐로 보내고, 콜백이 초 단위로 `success`를 반환하도록 보장하세요.

## 8. 서버 인프라스트럭처

### 8.1 access_token / jsapi_ticket 중앙 관리

두 티켓 모두 7200초간 유효하고 동일 기업 동일 애플리케이션에서 고유합니다(중복 획득 시 기존 것이 무효화됨). 반드시 서버에서 중앙 캐싱해야 합니다. 다중 인스턴스 배포 시 분산 락으로 한 인스턴스만 갱신하도록 보장합니다:

```java
@Component
@Slf4j
public class WecomTokenManager {

    private static final String TOKEN_KEY = "wecom:access_token";
    private static final String LOCK_KEY  = "wecom:access_token:lock";
    private static final long EXPIRE_SECONDS = 7100;   // 7200보다 100초 여유

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

`jsapi_ticket`, agent_config ticket은 완전히 동일한 패턴으로 독립 캐싱하면 됩니다(캐시 key는 분리).

### 8.2 민감 설정 분리

corpid/agentid는 공개 가능하지만, secret, 콜백 Token, EncodingAESKey는 반드시 환경 변수나 설정 센터로 주입하고 Git에 넣지 마세요:

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

- OAuth 로그인 엔드포인트, 위챗워크 콜백 엔드포인트는 통과 허용; 그 외는 모두 기존 JWT 인증을 따름
- `state` 일회성 랜덤 문자열 + sessionStorage 검증으로 CSRF 방지
- code는 한 번만 사용 가능하고 5분간 유효. 백엔드가 수신하자마자 교환하고 절대 캐싱하지 않음
- 체크인 좌표는 백엔드가 거리를 2차 검증하고 프런트엔드를 불신; 사진 워터마크; QR 스캔에 위치 정보 결합
- 콜백 인터페이스는 서명 검증 + AES 복호화 + corpId 검증으로 위조 이벤트 거부
- 핵심 인터페이스는 속도 제한(Redis 슬라이딩 윈도우)으로 요청 폭주 방지

### 8.4 주소록 동기화 서비스

```java
@Service
public class ContactSyncService {

    /** 전량 동기화(매일 새벽 안전망 실행) */
    public void syncAll() {
        String token = tokenManager.getAccessToken();
        // 1. 부서 트리 department/list
        // 2. 리프 부서를 순회하며 user/list?fetch_child=1로 멤버를 가져옴
        // 3. 사번으로 sys_user.username을 정렬하고 wecom_user_id, 부서, 이름, 휴대폰, 상태를 채워 넣음
        // 4. 위챗워크 status=5(퇴사)/멤버 삭제 이벤트 → 시스템 계정 비활성화
    }

    /** 증분 이벤트(실시간) */
    public void handleChange(String changeType, String wecomUserId) {
        switch (changeType) {
            case "create_user": case "update_user": upsertOne(wecomUserId); break;
            case "delete_user": disableByWecomUserId(wecomUserId); break;
            // 부서 변경은 부서 테이블을 동기화하여 orgService.findLeader 조직 라우팅에 사용
            default: break;
        }
    }

    public String wecomUserIdToUsername(String wecomUserId) {
        return userMapper.findUsernameByWecomId(wecomUserId);
    }
}
```

## 9. 함정 피하기 가이드

### 9.1 OAuth 자동 로그인(SSO) 관련

- **애플리케이션 홈/콜백 도메인은 반드시 "신뢰 도메인" 하위에 있어야 합니다**. 그렇지 않으면 인가 페이지에서 `redirect_uri 파라미터 오류`가 발생합니다.
- **인가 링크에는 반드시 `agentid`를 포함해야 합니다**. 그렇지 않으면 일부 기업위챗(WeCom) 버전에서 `getuserinfo`로 애플리케이션 신원을 가져올 수 없습니다.
- **`appid`에는 agentid가 아니라 corpid를 입력합니다**. 초보자가 자주 바꿔 입력합니다.
- **userid가 아닌 openid 반환**: 사용자가 애플리케이션 표시 범위 밖에 있습니다. 애플리케이션 "표시 범위"에 해당 멤버의 부서가 포함되는지 확인하고, 코드에서 조용히 계정을 생성하지 마세요.
- **PC 브라우저에서 링크를 열면 무음 인가되지 않습니다**: `snsapi_base`는 위챗워크 클라이언트 내에서만 조용히(사용자 인지 없이) 동작합니다. 프런트엔드는 반드시 먼저 UA를 판별하고, 비위챗워크 환경은 시스템 계정/비밀번호 로그인으로 보내세요.
- **code는 한 번만 사용 가능하고 5분 후 만료**: 리다이렉트 후 페이지 새로고침은 code 재사용 오류를 유발합니다. 로그인 성공 후 애플리케이션은 `router.replace`로 URL의 code를 지워 새로고침 재생을 방지하세요.

### 9.2 JS-SDK 서명 관련

- **iOS는 진입 페이지 URL, Android는 현재 페이지 URL로 서명**합니다(5.3 참고). SPA 환경에서 이것이 `invalid signature`의 첫 번째 원인입니다. 진입 URL은 첫 라우팅 점프 전에 기록해야 합니다.
- **서명에 참여하는 URL과 `location.href`는 한 글자도 빠짐없이 일치해야 합니다**: 프로토콜, 도메인, 포트, query를 모두 포함해야 하고, hash 부분은 규칙에 따라 통일 처리합니다(history 모드를 사용해 회피하는 것을 권장).
- **프런트엔드가 encode하면 백엔드도 encode; 둘 다 인코딩하지 않으면 둘 다 하지 않음**. 서명 문자열 조립 순서는 반드시 `jsapi_ticket&noncestr&timestamp&url`이어야 합니다.
- 기업위챗(WeCom) 전용 인터페이스를 호출하려면 `wx.config`에 `beta: true`를 설정하고 `wx.agentConfig`를 한 번 더 수행해야 합니다.
- 로컬 실기기 디버깅은 반드시 인트라넷 터널링 https 도메인을 사용해야 하며, hosts 방식은 휴대폰에서 동작하지 않습니다.

### 9.3 Activiti와 계정 매핑 관련

- **담당자 식별자는 반드시 내부 username으로 통일**하고, wecom_user_id를 BPMN assignee에 직접 넣지 마세요. 그렇지 않으면 신원 소스가 바뀔 때(향후 딩딩/페이수 연동) 플로우 정의를 전부 변경해야 합니다.
- **wecom_user_id로 중복 계정을 생성하지 마세요**: 기존 시스템의 첫 번째 원칙은 바인딩 매핑입니다(4.6). 그렇지 않으면 근태와 이력 결재 대기 태스크가 두 사람으로 분열됩니다.
- **또는결재 후보 태스크는 처리 전 반드시 claim해야 합니다**. 클레임 없이 바로 complete하면 태스크가 현재 사용자 소속이 아니라는 오류가 발생합니다.
- **회람 반려 시 남은 인스턴스를 미리 종료해야 합니다**: completionCondition에 REJECT 판단을 포함 + 리스너에서 남은 task를 delete해야 합니다. 그렇지 않으면 반려 후 다른 사람이 계속 결재 대기 태스크를 받습니다.
- **근태 연동은 플로우 종료 리스너에 작성**하고, 특정 결재 버튼 인터페이스에 넣지 마세요. PC, H5, 카드 콜백 등 임의의 진입점에서 모두 적용되고, 결재가 실제로 통과되지 않으면 근태를 오수정하지 않도록 보장합니다.

### 9.4 위챗워크 API 빈도 및 기타

| API | 제한(참고용, 공식 문서 기준) |
|-----|------|
| gettoken | 동일 기업 5분 내 호출 횟수 제한, 반드시 캐싱 |
| 메시지 발송 | 애플리케이션별 분당 상한 있음, touser는 가급적 배치/중복 제거 |
| 주소록 조회 | 일일 총 횟수 상한 있음, 증분 콜백 위주 |
| 메시지 카드 갱신 | 인터페이스 빈도 제한 적용, 순환 갱신 회피 |

기타 자주 묻는 문제:

- **서버 아웃바운드 IP를 "기업 신뢰 IP" 화이트리스트에 추가**해야 합니다. 그렇지 않으면 `60020` 오류가 발생합니다.
- **반드시 HTTPS + ICP 비안(중국 본토 서버)**이 필요합니다. 인증서 만료 시 애플리케이션 전체가 열리지 않는데도 뚜렷한 안내가 없으므로 모니터링에 포함하세요.
- **콜백은 반드시 초 단위로 `success`를 반환**하고 비즈니스는 비동기화하세요. 그렇지 않으면 위챗워크 재푸시로 중복 결재가 발생합니다(멱등성으로 방지).
- **textcard의 url은 가급적 상세 페이지로 바로 연결**하고, 자동 로그인 + state 리다이렉트와 연동하여 "알림 클릭 시 결재로 직행"을 구현하세요.
- **secret 유출** 시 즉시 백오피스에서 재설정하고 서비스를 재시작하세요; 코드 리뷰 시 "프런트엔드/로그에 secret 등장"을 레드라인으로 지정하세요.

## 10. 출시 체크리스트

**위챗워크 백오피스**

- [ ] 자체 구축 애플리케이션의 표시 범위가 모든 사용자 부서를 커버
- [ ] 애플리케이션 홈이 H5 모바일 주소(https)로 구성됨
- [ ] 신뢰 도메인 구성 완료, 소속 검증 파일 접근 가능
- [ ] 기업 신뢰 IP 화이트리스트 추가 완료(서버 아웃바운드 IP)
- [ ] 메시지 수신 URL/Token/EncodingAESKey 구성 완료 및 GET 검증 통과

**계정과 신원**

- [ ] `sys_user.wecom_user_id`가 주소록 동기화로 초기화되었고 사번 매핑이 정확함
- [ ] 미매칭 계정에 "관리자 문의/셀프 바인딩" 안내가 명확하고 조용한 계정 생성이 없음
- [ ] `snsapi_base` 무음 자동 로그인이 실기기(iOS + Android)에서 검증 통과
- [ ] 토큰 만료 후 재자동 로그인이 조용히 동작하고 리다이렉트된 원래 페이지가 정확함(결재 상세 딥링크 포함)

**기능**

- [ ] JS-SDK `wx.config`가 iOS/Android 양쪽에서 통과(서명 URL 중점 검증)
- [ ] 위치/사진/스캔이 실기기에서 동작하고 백엔드 거리 2차 검증이 적용됨
- [ ] 회람: 각자 독립된 결재 대기 태스크, 한 명이라도 반려 시 종료 및 신청인 통지
- [ ] 또는결재: 후보자 모두 수신, 한 명이 클레임 처리하면 다른 사람의 결재 대기 태스크가 사라짐
- [ ] 조직도 결재: 신청인 부서에 따라 책임자/담당 임원으로 정확히 라우팅
- [ ] 결재 통과 후 근태 연동(보정 수정/휴가 차감)이 정확히 DB에 반영
- [ ] 결재 대기 카드 푸시가 도달하고 클릭 시 바로 이동 및 로그인된 상태; 카드 버튼 콜백이 멱등함

**보안과 운영**

- [ ] secret/Token/AESKey는 환경 변수로 주입, Git 미포함, 로그 미등장
- [ ] access_token/jsapi_ticket 캐싱 + 분산 락 검증(다중 인스턴스)
- [ ] HTTPS 인증서 유효기간 모니터링, 인터페이스 속도 제한 및 핵심 조작 감사 로그
- [ ] 주소록 증분 콜백 + 매일 전량 동기화 안전망 작업 활성화

## 마무리

"기존 근태 시스템 + Activiti 복잡한 결재"를 전제로 기업위챗(WeCom) 연동을 할 때, 올바른 접근은 통째로 다시 작성하는 것이 아니라 위챗워크를 **진입점, 신원 제공자, 메시지 채널**로 대하는 것입니다:

- **선택**: 기존 Web 시스템이 있고, 결재 양식이 복잡하며, 빠른 반복과 심사 없는 출시가 요구될 때는 미니프로그램보다 H5가 더 적합합니다; OAuth2 `snsapi_base` 무음 인가만으로 애플리케이션 클릭 시 자동 로그인을 구현할 수 있고, JS-SDK로 위치, 사진 촬영, QR 스캔을 충분히 커버할 수 있습니다.
- **자동 로그인 체인**: 프런트엔드 라우팅 가드가 토큰 없음을 발견 → 302 위챗워크 인가(state 포함) → code를 동반한 무음 리다이렉트 → 백엔드 gettoken + `auth/getuserinfo`로 userid 획득 → **사번으로 기존 시스템 계정에 매핑(신규 생성이 아님)** → 시스템의 기존 JWT 발급, 이후 모든 근태/결재 인터페이스를 무개조로 재사용.
- **계정 디커플링**: Activiti assignee/후보자는 계속 내부 username을 사용하고, 위챗워크 userid는 `sys_user`의 외부 신원 필드로만 두어, 로그인 시 신원 확인과 푸시 주소 지정 시에만 변환하여 다양한 로그인 방식이 공존하는 역량을 보존합니다.
- **결재 재사용**: 회람(다중 인스턴스 + 완료 조건), 또는결재(candidateUsers + claim), 조직도 기반 결재(UEL 표현식으로 책임자 동적 해석)는 모두 기존 BPMN을 그대로 사용; H5는 결재 대기 태스크 목록/상세/처리 진입점만 추가하고 하위 계층은 모두 동일한 `taskService.complete()`를 따릅니다.
- **연동과 도달**: 근태 연동은 플로우 종료 리스너에 두어 각 진입점의 일관성을 보장; 새로운 결재 대기 태스크는 textcard로 푸시하고 링크는 결재 상세로 직행하며 자동 로그인을 재사용; 카드 내 원클릭 결재는 콜백을 따르고 조작은 반드시 멱등해야 합니다.
- **중점 함정**: 신뢰 도메인과 기업 신뢰 IP, iOS/Android 서명 URL 차이, code 일회성과 state CSRF 방지, 중복 계정 생성 절대 금지, 또는결재 클레임, 콜백의 초 단위 success 반환, 티켓 중앙 캐싱.

공식 문서: [기업위챗(WeCom) 개발자 센터](https://developer.work.weixin.qq.com/document/)

> 이 방안의 본질은 "재작성"이 아니라 "연동"입니다: 최소한의 신규 코드(하나의 OAuth 로그인 엔드포인트, 한 계층의 계정 매핑, 하나의 JS-SDK 서명 서비스, 한 조의 결재 대기 푸시 리스너)로, 수년간 축적된 근태와 Activiti 결재 역량을 직원의 기업위챗(WeCom) 안에 매끄럽게 등장시키고 무인 자동 로그인을 구현하는 것입니다. 향후 체크인 경험을 더 높여야 한다면 미니프로그램 체크인 진입점을 추가로 도입하여 H5 결재와 동일한 백엔드 계정 및 워크플로를 공유하며 매끄럽게 발전시킬 수 있습니다.
