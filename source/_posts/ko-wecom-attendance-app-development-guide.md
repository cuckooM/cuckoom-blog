---
title: "기업위챗 앱 개발 완전 가이드: 출퇴근 시스템을 사례로"
date: 2026-07-09 21:00:00
tags:
  - 기업위챗
  - 미니프로그램 개발
  - 출퇴근 시스템
  - API 연동
  - 모바일 개발
categories:
  - 기술 실무
lang: ko
---

기업위챗(WeCom)은 기업급 통신 및 협업 플랫폼으로서 풍부한 개방 API를 제공하며, 기업 자체 구축 앱, 서드파티 앱, 대리 개발 앱을 지원합니다. 기업위챗 미니프로그램(WeCom Mini Program) 역량이 지속적으로 완성됨에 따라, 점점 더 많은 기업이 미니프로그램 모드로 내부 앱을 개발하여 원래 경험에 더 가깝고 더 강력한 디바이스 역량 호출을 얻고 있습니다.

본문은 출퇴근 시스템을 사례로 하여, **기업위챗 미니프로그램 모드를 주선으로** 앱 개발 전체 과정을 체계적으로 설명합니다. 미니프로그램 등록 생성, 프로젝트 구조, 신원 인증, 지리적 위치 기반 출퇴근 체크, 사진 촬영 출퇴근 체크, QR 코드 스캔 출퇴근 체크, 백엔드 API 연동, 메시지 푸시, 보안 설계 등 핵심环节을 다루며, 동시에 H5 앱 모드의 차이점을 비교 설명하여 개발팀의 선정과落地를 돕습니다.

<!-- more -->

## 一、기업위챗 앱 개발 개요

### 1.1 플랫폼 포지셔닝

기업위챗 개방 플랫폼은 개발자에게 완전한 API 체계를 제공하며, 주소록 관리, 메시지 푸시, OAuth 인증, JS-SDK, 미니프로그램, 효율 도구(출퇴근 체크, 승인, 보고) 등 역량을 다룹니다. 개발자는 이러한 API를 기반으로 기업 내부 앱을 구축하거나, 다수 기업을 대상으로 하는 서드파티 앱을 개발할 수 있습니다.

### 1.2 앱 유형

| 유형 | 적용 시나리오 | 특징 |
|------|----------|------|
| 자체 구축 앱 | 기업 내부 사용 | 본 기업만 볼 수 있으며, 설정이 유연하고 API 권한은 관리자가 할당 |
| 서드파티 앱 | 다수 기업에 서비스 제공 | 기업위챗 심사 통과 필요, 다수 기업 권한부여 설치 지원 |
| 대리 개발 앱 | 서비스 제공자가 기업을 대리하여 개발 | 기업이 서비스 제공자에 권한 위임, 서비스 제공자가 대리 개발 및 운영 |

본문은 **자체 구축 앱**을 위주로 하며, 이는 가장 일반적인 개발 시나리오입니다.

### 1.3 개발 모드: 미니프로그램 vs H5

기업위챗 앱 개발은 주로 두 가지 모드가 있습니다: **미니프로그램 모드**와 **H5 앱 모드**. 양자는 각각 장단점이 있어, 선정 시 종합적으로 고려해야 합니다.

| 비교 차원 | 기업위챗 미니프로그램 | H5 앱 |
|----------|--------------|---------|
| 실행 환경 | 기업위챗 미니프로그램 런타임 | 기업위챗 내장 브라우저 WebView |
| 개발 프레임워크 | WXML/WXSS/JS(위챗 미니프로그램과 유사) | 임의 프론트엔드 프레임워크(Vue/React 등) |
| 성능 경험 | 원래에 가깝고, 시작이 빠르며, 페이지 전환이 유창함 | WebView에 의존, 첫 화면 로딩이 비교적 느림 |
| 오프라인 역량 | 로컬 캐시 지원, 약한 네트워크에서 사용 가능 | 오프라인 미지원, 네트워크에 의존 |
| 디바이스 역량 | 원래 API 직접 호출(`wx.getLocation` 등) | JS-SDK를 통한 간접 호출 필요, 서명 검증 필요 |
| 신원 인증 | `wx.qyLogin`으로 code 획득, 자동 무감각 | OAuth2 웹페이지 권한부여 이동, 사용자 감지 필요 |
| 출시 프로세스 | 심사 제출 필요, 버전 관리 엄격 | 배포 즉시 효력 발생, 심사 불필요 |
| 업데이트 유연성 | 버전 재배포 필요 | 언제든 핫 업데이트 가능, 유연성 높음 |
| 크로스 플랫폼 일치성 | 기업위챗이 다중 단말 일치 보장 | iOS/Android WebView 차이 자체 적응 필요 |
| 적용 시나리오 | 고빈도 사용, 성능 요구 높음, 디바이스 역량 호출 필요 | 빠른 개발, 빈번한 반복, 콘텐츠형 앱 |

**선정 권장사항**:

- **출퇴근 시스템은 미니프로그램 모드 권장**: 출퇴근은 고빈도 작업으로, 위치 정확도, 촬영 속도, 시작 속도에 요구가 있으며, 미니프로그램의 원래 API 호출이 더 직접적이고 경험이 더 좋습니다
- **승인 시스템은 H5 모드 사용 가능**: 승인 프로세스 양식이 복잡하고 변동이 빈번하여, H5의 유연성이 더 높습니다
- **혼합 모드**: 동일 자체 구축 앱에 미니프로그램 입구와 H5 입구를 동시 설정, 시나리오별 사용자 안내

본문은 **미니프로그램 모드를 주선으로** 출퇴근 시스템 개발을 설명하며, 핵심 노드에서 H5 모드의 차이를 비교 설명합니다.

## 二、개발 환경 구축

### 2.1 기업위챗 가입 및 앱 생성

1. [기업위챗 관리 백엔드](https://work.weixin.qq.com/) 방문, 기업위챗 가입(관리자 조작 필요)
2. 「앱 관리」->「자체 구축」->「앱 생성」 진입
3. 앱 이름, logo, 가시 범위 작성(어느 부서/직원이 사용 가능한지)
4. 생성 완료 후 세 가지 핵심 파라미터 획득:

| 파라미터 | 설명 | 획득 위치 |
|------|------|----------|
| `corpid` | 기업 유일 식별자 | 나의 기업 -> 기업 정보 -> 기업ID |
| `agentid` | 앱 유일 식별자 | 앱 관리 -> 자체 구축 앱 -> AgentId |
| `secret` | 앱 비밀키 | 앱 관리 -> 자체 구축 앱 -> Secret |

> ⚠️ `secret`는 최고 민감 증명서로, **절대 프론트엔드 코드에 나타나서는 안 되며**, 반드시 서버 측에 보관해야 합니다.

### 2.2 기업위챗 미니프로그램 생성

기업위챗 미니프로그램의 생성 흐름은 위챗 미니프로그램과 유사하나, 바인딩되는 것은 기업위챗 주체입니다:

1. [기업위챗 관리 백엔드](https://work.weixin.qq.com/) 로그인 ->「앱 관리」-> 자체 구축 앱 선택
2. 앱 상세 페이지에서「미니프로그램」 모듈 찾기, 「바인딩/미니프로그램 생성」 클릭
3. 기업위챗은 두 가지 방식으로 미니프로그램 연결 지원:
   - **기존 위챗 미니프로그램 연결**: 위챗 개방 플랫폼에 등록된 미니프로그램 재사용, 동일 주체 필요
   - **기업위챗 내에서 직접 생성**: 기업위챗 자체 구축 미니프로그램, 위챗 개방 플랫폼에 의존하지 않음
4. 생성 후 미니프로그램 관리 페이지에서 `wx_app_id`(미니프로그램 AppID) 획득

**개발 도구**: [위챗 개발자 도구](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)를 사용하여 개발 및 디버깅, 「기업위챗 미니프로그램」 모드 선택 또는 기업위챗 플러그인 연결을 통해 진행.

```bash
# 위챗 개발자 도구 다운로드(명령행 버전, CI용)
# 공식 다운로드 페이지: https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
# CLI 경로 예시(macOS):
/Applications/wechatwebdevtools.app/Contents/MacOS/cli \
  --login --project /path/to/miniprogram \
  --preview --qr-output /tmp/preview-qr.png
```

### 2.3 신뢰 도메인 및 서버 도메인 설정

**H5 모드**는 신뢰 도메인(웹페이지 권한부여 및 JS-SDK) 설정이 필요합니다:

```
앱 관리 -> 자체 구축 앱 -> 개발자 인터페이스 -> 웹페이지 권한부여 및 JS-SDK
  -> 신뢰 도메인 설정: attendance.yourcompany.com
  -> 도메인 소속 검증 파일 다운로드 필요, 도메인 루트 디렉토리에 배치
```

**미니프로그램 모드**는 관리 백엔드에서「서버 도메인」(request, uploadFile, downloadFile, socket) 설정이 필요합니다:

```
앱 관리 -> 자체 구축 앱 -> 개발자 인터페이스 -> 미니프로그램
  -> 서버 도메인:
    request 합법 도메인: https://api.attendance.yourcompany.com
    uploadFile 합법 도메인: https://upload.attendance.yourcompany.com
    downloadFile 합법 도메인: https://download.attendance.yourcompany.com
```

도메인은 반드시 다음을 만족해야 합니다:
- HTTPS 지원(프로덕션 환경, 미니프로그램 강제 요구)
- ICP 비안 통과(중국 대륙 서버)
- request 도메인은 IP 주소, localhost 미지원
- 매월 최대 50회 도메인 설정 수정 가능

### 2.4 로컬 개발 환경

미니프로그램 개발은 위챗 개발자 도구를 사용하며, 로컬에서 HTTPS 도메인 관통이 불필요하나, 여전히 백엔드 서비스가 필요합니다:

```bash
# 백엔드 로컬 시작(SpringBoot)
cd ~/work/code/attendance-backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev

# 미니프로그램 개발자 도구에서 설정:
# - 개발 설정 -> 합법 도메인 미검사(개발 단계 체크)
# - AppID에 기업위챗 미니프로그램의 AppID 입력
# - 디버그 기본 라이브러리 최신 안정 버전 선택
```

H5 모드 로컬 개발은 HTTPS 및 도메인 검증 문제 해결이 필요합니다:

```bash
# H5 모드: ngrok 또는 frp를 사용하여 내부망 관통
ngrok http 8080

# 또는 mkcert로 로컬 HTTPS 증명서 생성
mkcert -install
mkcert localhost 127.0.0.1

# hosts 파일 설정(신뢰 도메인을 로컬로 지정)
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

개발 단계에서 기업위챗 백엔드에 신뢰 도메인을 내부망 관통 주소로 설정할 수 있으나, token 보안에 주의해야 합니다.

## 三、미니프로그램 프로젝트 구조

기업위챗 미니프로그램의 프로젝트 구조는 위챗 미니프로그램과 일치하며, TypeScript로 개발하면 더 나은 타입 안전과 개발 경험을 얻을 수 있습니다.

### 3.1 디렉토리 구조

```
miniprogram/
├── app.ts                    # 미니프로그램 진입 로직
├── app.json                  # 미니프로그램 전역 설정
├── app.wxss                  # 전역 스타일
├── sitemap.json              # 검색 설정
├── project.config.json       # 프로젝트 설정(AppID, 컴파일 설정 등)
├── tsconfig.json             # TypeScript 설정
├── typings/                  # 타입 선언
│   ├── index.d.ts
│   └── wecom.d.ts            # 기업위챗 API 타입 보충
├── pages/
│   ├── index/                # 홈페이지(출퇴근 체크)
│   │   ├── index.ts
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   ├── records/              # 출퇴근 기록
│   │   ├── index.ts
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   ├── apply/                # 보충 출퇴근 신청
│   │   ├── index.ts
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   └── scan/                 # QR 스캔 출퇴근 체크
│       ├── index.ts
│       ├── index.wxml
│       ├── index.wxss
│       └── index.json
├── components/
│   ├── checkin-button/      # 출퇴근 체크 버튼 컴포넌트
│   └── location-card/       # 위치 정보 카드
├── services/                 # 비즈니스 서비스 층
│   ├── auth.service.ts       # 인증 서비스
│   ├── checkin.service.ts   # 출퇴근 체크 서비스
│   └── api.service.ts       # HTTP 요청 캡슐화
├── utils/
│   ├── request.ts            # 요청 도구(token 주입 포함)
│   ├── location.ts           # 위치 도구
│   └── format.ts             # 포맷 도구
└── config/
    ├── env.ts               # 환경 설정
    └── constant.ts           # 상수
```

### 3.2 app.json 전역 설정

```json
{
  "pages": [
    "pages/index/index",
    "pages/records/index",
    "pages/apply/index",
    "pages/scan/index"
  ],
  "window": {
    "navigationBarTitleText": "출퇴근 시스템",
    "navigationBarBackgroundColor": "#128BF3",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#F5F5F5",
    "enablePullDownRefresh": false
  },
  "tabBar": {
    "color": "#999999",
    "selectedColor": "#128BF3",
    "list": [
      {
        "pagePath": "pages/index/index",
        "text": "출퇴근 체크"
      },
      {
        "pagePath": "pages/records/index",
        "text": "기록"
      }
    ]
  },
  "permission": {
    "scope.userLocation": {
      "desc": "출퇴근 체크 위치 검증용"
    }
  },
  "requiredPrivateInfos": [
    "getLocation"
  ],
  "usingComponents": {}
}
```

> ⚠️ 기업위챗 미니프로그램은 2023년부터 `app.json`에 `requiredPrivateInfos`를 선언하도록 요구하며, 그렇지 않으면 `wx.getLocation` 등 프라이버시 API를 호출할 수 없습니다.

### 3.3 app.ts 진입 로직

```typescript
// app.ts
interface AppData {
  userInfo?: WeComUserInfo;
  sessionKey?: string;
  serverToken?: string;
}

interface WeComUserInfo {
  userid: string;
  name: string;
  avatar?: string;
  department?: number[];
}

App<AppData>({
  globalData: {
    userInfo: undefined,
    sessionKey: undefined,
    serverToken: undefined,
  },

  onLaunch() {
    // 미니프로그램 시작 시 기업위챗 로그인 실행
    this.qyLogin();
  },

  /**
   * 기업위챗 로그인 흐름
   * 1. wx.qyLogin 호출로 code 획득
   * 2. code를 백엔드로 전송
   * 3. 백엔드에서 code로 userid와 session_key 교환
   * 4. server token을 캐시하여 후속 비즈니스 요청에 사용
   */
  async qyLogin() {
    try {
      const { code } = await wx.qyLogin({
        desc: '기업위챗 신원 획득',
      });

      if (!code) {
        console.error('qyLogin이 code를 반환하지 않았습니다');
        return;
      }

      // code를 백엔드로 전송하여 token 교환
      const result = await this.requestLogin(code);

      this.globalData.serverToken = result.token;
      this.globalData.userInfo = result.userInfo;

      console.log('기업위챗 로그인 성공', result.userInfo.userid);
    } catch (err) {
      console.error('기업위챗 로그인 실패', err);
      wx.showToast({ title: '로그인 실패, 재시도해 주세요', icon: 'error' });
    }
  },

  /**
   * 백엔드 로그인 인터페이스 호출
   */
  requestLogin(code: string): Promise<{ token: string; userInfo: WeComUserInfo }> {
    return new Promise((resolve, reject) => {
      wx.request({
        url: 'https://api.attendance.yourcompany.com/api/auth/qy-login',
        method: 'POST',
        data: { code },
        success: (res) => {
          if (res.statusCode === 200 && res.data.code === 0) {
            resolve(res.data.data);
          } else {
            reject(new Error(res.data.message || '로그인 실패'));
          }
        },
        fail: reject,
      });
    });
  },

  /**
   * 서버 측 token 획득(로컬 캐시 포함)
   */
  getServerToken(): string | undefined {
    return this.globalData.serverToken;
  },
});
```

> 💡 **H5 모드와의 비교**: H5 모드는 OAuth2 웹페이지 권한부여 이동을 통해 code를 획득해야 하며, 페이지 리디렉션과 URL 파라미터 처리가 관련됩니다; 미니프로그램 모드는 `wx.qyLogin`으로 직접 code를 획득하여 페이지 이동이 불필요하며 경험이 더 유창합니다.

### 3.4 TypeScript 설정

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2017"],
    "typeRoots": ["./node_modules/@types", "./typings"],
    "rootDir": ".",
    "outDir": "miniprogram"
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 3.5 기업위챗 API 타입 선언

위챗 미니프로그램의 기본 라이브러리 타입은 기업위챗 전용 API를 포함하지 않으므로, 보충 선언이 필요합니다:

```typescript
// typings/wecom.d.ts

declare interface WeComQyLoginOption {
  desc?: string;
  success?: (res: { code: string }) => void;
  fail?: (err: { errMsg: string }) => void;
  complete?: () => void;
}

declare interface WeComSelectEnterpriseContactOption {
  from?: number;
  selectedDepartmentIds?: number[];
  selectedUserIds?: string[];
  mode?: 'multi' | 'single';
  type?: 'department' | 'user' | 'department_and_user';
  selectedDepartmentPaths?: string[];
  success?: (res: {
    result: {
      departmentIdList: number[];
    };
  }) => void;
  fail?: (err: { errMsg: string }) => void;
}

declare interface WeComOption {
  corpId: string;
  agentId: string;
  timestamp: string;
  nonceStr: string;
  signature: string;
}

declare namespace WeCom {
  interface UserInfo {
    userid: string;
    name: string;
    department?: number[];
    avatar?: string;
    email?: string;
    mobile?: string;
  }

  interface InvokeResult {
    err_msg: string;
    [key: string]: any;
  }
}

declare const wx: {
  // 기업위챗 전용 API
  qyLogin(option: WeComQyLoginOption): void;
  selectEnterpriseContact(option: WeComSelectEnterpriseContactOption): void;
  qwChooseEnterpriseContact(option: WeComSelectEnterpriseContactOption): void;

  // 일반 API(위챗 미니프로그램 기본 라이브러리)
  request(option: any): WeApp.RequestTask;
  getLocation(option: WeApp.GetLocationOption): void;
  chooseImage(option: any): void;
  chooseMedia(option: any): void;
  scanCode(option: any): void;
  setStorage(option: any): void;
  getStorage(option: any): void;
  showToast(option: any): void;
  [key: string]: any;
};
```

## 四、기업위챗 미니프로그램 신원 인증

### 4.1 로그인 흐름 전경

기업위챗 미니프로그램의 로그인 흐름은 H5 OAuth보다 간결하며, 전 과정이 무감각입니다:

```
미니프로그램 측                    백엔드 서비스                 기업위챗 API
  │                          │                        │
  │  1. wx.qyLogin()         │                        │
  │ ─────────────────────────│                        │
  │  code 획득               │                        │
  │                          │                        │
  │  2. POST /auth/qy-login  │                        │
  │    (code)                │                        │
  │ ─────────────────────────▶                        │
  │                          │  3. gettoken            │
  │                          │ ────────────────────────▶
  │                          │  access_token          │
  │                          │ ◀───────────────────────│
  │                          │                        │
  │                          │  4. jscode2session      │
  │                          │ ────────────────────────▶
  │                          │  userid + session_key  │
  │                          │ ◀───────────────────────│
  │                          │                        │
  │                          │  5. JWT/Session 생성   │
  │                          │    Redis에 캐시         │
  │                          │                        │
  │  6. JWT + userInfo 반환   │                        │
  │ ◀─────────────────────────                        │
  │                          │                        │
  │  7. 후속 요청에 JWT 휴대   │                        │
  │ ─────────────────────────▶                        │
```

### 4.2 미니프로그램 측: wx.qyLogin

`wx.qyLogin`은 기업위챗 미니프로그램 전용 API로, 반환된 `code`는 서버 측에서 사용자 신원으로 교환하는 데 사용됩니다.

```typescript
// services/auth.service.ts

export class AuthService {
  private static instance: AuthService;
  private serverToken: string | null = null;
  private userInfo: WeCom.UserInfo | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * 기업위챗 로그인
   * wx.qyLogin이 반환한 code는 유효기간 5분이며, 한 번만 사용 가능
   */
  async qyLogin(): Promise<void> {
    const { code } = await this.callQyLogin();
    if (!code) {
      throw new Error('qyLogin에서 code를 획득하지 못했습니다');
    }

    const result = await this.exchangeToken(code);
    this.serverToken = result.token;
    this.userInfo = result.userInfo;

    // 로컬 캐시 token(유효기간 내 재로그인 면제)
    wx.setStorage({
      key: 'server_token',
      data: result.token,
    });
  }

  private callQyLogin(): Promise<{ code: string }> {
    return new Promise((resolve, reject) => {
      wx.qyLogin({
        desc: '기업위챗 신원 획득',
        success: resolve,
        fail: reject,
      });
    });
  }

  private async exchangeToken(code: string) {
    return new Promise<{ token: string; userInfo: WeCom.UserInfo }>(
      (resolve, reject) => {
        wx.request({
          url: 'https://api.attendance.yourcompany.com/api/auth/qy-login',
          method: 'POST',
          data: { code },
          success: (res) => {
            if (res.statusCode === 200 && res.data.code === 0) {
              resolve(res.data.data);
            } else {
              reject(new Error(res.data?.message || 'token 교환 실패'));
            }
          },
          fail: reject,
        });
      },
    );
  }

  getToken(): string | null {
    return this.serverToken;
  }

  getUserInfo(): WeCom.UserInfo | null {
    return this.userInfo;
  }
}
```

### 4.3 백엔드: code로 userid 교환

백엔드는 `code`를 사용하여 기업위챗 `jscode2session` 인터페이스를 호출하고, `userid`와 `session_key`를 획득합니다.

**인터페이스 주소**:

```
GET https://qyapi.weixin.qq.com/cgi-bin/service/miniprogram/jscode2session
  ?access_token=ACCESS_TOKEN
  &js_code=CODE
  &grant_type=authorization_code
```

**SpringBoot 구현**:

```java
/**
 * 기업위챗 인증 Controller
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/api/auth")
@Slf4j
public class QyAuthController {

    @Resource
    private QyAuthService qyAuthService;

    @Resource
    private JwtTokenProvider jwtTokenProvider;

    /**
     * 미니프로그램 로그인: code로 userid 교환, JWT 발급
     *
     * @param request 미니프로그램 로그인 요청
     * @return JWT token + 사용자 정보
     */
    @PostMapping("/qy-login")
    public Result<QyLoginVO> qyLogin(@RequestBody @Valid QyLoginDTO request) {
        log.info("기업위챗 미니프로그램 로그인, code={}", request.getCode());
        try {
            // 1. code로 userid와 session_key 교환
            QySessionDTO session = qyAuthService.code2Session(request.getCode());
            log.info("로그인 성공, userid={}", session.getUserid());

            // 2. 사용자 기록 조회/생성
            SysUser user = qyAuthService.getOrCreateUser(session.getUserid());

            // 3. JWT 발급
            String token = jwtTokenProvider.generateToken(user.getId(), user.getWecomUserId());

            // 4. session_key 캐시(후속 암호화 데이터 복호화에 사용)
            qyAuthService.cacheSessionKey(session.getUserid(), session.getSessionKey());

            // 5. 반환 객체 구성
            QyLoginVO vo = new QyLoginVO();
            vo.setToken(token);
            vo.setUserInfo(QyUserInfoVO.builder()
                    .userid(user.getWecomUserId())
                    .name(user.getName())
                    .avatar(user.getAvatar())
                    .department(user.getDepartmentIds())
                    .build());

            return Result.success(vo);
        } catch (BusinessException e) {
            log.warn("기업위챗 로그인 비즈니스 예외: {}", e.getMessage());
            return Result.fail(e.getCode(), e.getMessage());
        } catch (Exception e) {
            log.error("기업위챗 로그인 시스템 예외", e);
            return Result.fail(ErrorCode.SYSTEM_ERROR);
        }
    }
}
```

```java
/**
 * 기업위챗 인증 Service
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class QyAuthService {

    private static final String SESSION_KEY_CACHE_PREFIX = "wecom:session_key:";

    @Value("${wecom.corpid}")
    private String corpId;

    @Value("${wecom.agentid}")
    private String agentId;

    @Value("${wecom.secret}")
    private String secret;

    @Resource
    private WecomTokenManager tokenManager;

    @Resource
    private RestTemplate restTemplate;

    @Resource
    private StringRedisTemplate redisTemplate;

    @Resource
    private SysUserMapper userMapper;

    /**
     * 미니프로그램 code로 session 교환
     *
     * @param code wx.qyLogin이 반환한 code
     * @return userid + session_key
     */
    public QySessionDTO code2Session(String code) {
        String accessToken = tokenManager.getAccessToken();

        String url = String.format(
                "https://qyapi.weixin.qq.com/cgi-bin/service/miniprogram/jscode2session" +
                        "?access_token=%s&js_code=%s&grant_type=authorization_code",
                accessToken, code
        );

        JSONObject response = restTemplate.getForObject(url, JSONObject.class);
        if (response == null || response.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.QY_LOGIN_FAILED,
                    "code로 session 교환 실패: " + (response == null ? "null" : response.getString("errmsg")));
        }

        return QySessionDTO.builder()
                .userid(response.getString("userid"))
                .sessionKey(response.getString("session_key"))
                .build();
    }

    /**
     * 시스템 사용자 조회 또는 생성
     */
    public SysUser getOrCreateUser(String wecomUserId) {
        SysUser user = userMapper.findByWecomUserId(wecomUserId);
        if (user != null) {
            return user;
        }

        // 신규 사용자: 주소록 API로 상세 정보 획득 및入库
        WecomUserDTO wecomUser = getUserInfoByApi(wecomUserId);
        user = new SysUser();
        user.setWecomUserId(wecomUserId);
        user.setName(wecomUser.getName());
        user.setAvatar(wecomUser.getAvatar());
        user.setDepartmentIds(wecomUser.getDepartment());
        user.setMobile(wecomUser.getMobile());
        user.setEmail(wecomUser.getEmail());
        user.setStatus(1);
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        userMapper.insert(user);

        return user;
    }

    /**
     * session_key 캐시(유효기간 7일)
     */
    public void cacheSessionKey(String userid, String sessionKey) {
        String key = SESSION_KEY_CACHE_PREFIX + userid;
        redisTemplate.opsForValue().set(key, sessionKey, 7, TimeUnit.DAYS);
    }

    /**
     * 캐시된 session_key 획득
     */
    public String getSessionKey(String userid) {
        return redisTemplate.opsForValue().get(SESSION_KEY_CACHE_PREFIX + userid);
    }

    /**
     * 주소록 API로 사용자 상세 정보 획득
     */
    private WecomUserDTO getUserInfoByApi(String userid) {
        String accessToken = tokenManager.getAccessToken();
        String url = String.format(
                "https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=%s&userid=%s",
                accessToken, userid
        );

        JSONObject response = restTemplate.getForObject(url, JSONObject.class);
        if (response == null || response.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR,
                    "사용자 정보 획득 실패: " + (response == null ? "null" : response.getString("errmsg")));
        }

        return WecomUserDTO.builder()
                .userid(response.getString("userid"))
                .name(response.getString("name"))
                .avatar(response.getString("avatar"))
                .department(response.getJSONArray("department").toJavaList(Integer.class))
                .mobile(response.getString("mobile"))
                .email(response.getString("email"))
                .build();
    }
}
```

### 4.4 JWT 인증 인터셉터

```java
/**
 * JWT 인증 인터셉터
 * 요청 헤더의 Authorization token 검증
 *
 * @author cuckoom
 */
@Component
@Slf4j
public class JwtAuthInterceptor implements HandlerInterceptor {

    @Resource
    private JwtTokenProvider jwtTokenProvider;

    private static final String AUTH_HEADER = "Authorization";
    private static final String TOKEN_PREFIX = "Bearer ";

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) {
        // 로그인 인터페이스와 콜백 인터페이스 통과
        String uri = request.getRequestURI();
        if (uri.contains("/api/auth/") || uri.contains("/api/wecom/callback/")) {
            return true;
        }

        String header = request.getHeader(AUTH_HEADER);
        if (header == null || !header.startsWith(TOKEN_PREFIX)) {
            sendError(response, 401, "인증 정보 누락");
            return false;
        }

        String token = header.substring(TOKEN_PREFIX.length());
        try {
            Claims claims = jwtTokenProvider.parseToken(token);
            Long userId = claims.get("userId", Long.class);
            String wecomUserId = claims.get("wecomUserId", String.class);

            // 사용자 정보를 request에 저장하여 Controller에서 사용
            request.setAttribute("currentUserId", userId);
            request.setAttribute("currentWecomUserId", wecomUserId);

            return true;
        } catch (ExpiredJwtException e) {
            sendError(response, 401, "token이 만료되었습니다, 재로그인해 주세요");
            return false;
        } catch (Exception e) {
            log.warn("JWT 검증 실패", e);
            sendError(response, 401, "유효하지 않은 인증 정보");
            return false;
        }
    }

    private void sendError(HttpServletResponse response, int code, String msg) {
        response.setStatus(code);
        response.setContentType("application/json;charset=UTF-8");
        try {
            response.getWriter().write(JSONUtil.toJsonStr(Result.fail(code, msg)));
        } catch (IOException e) {
            log.error("오류 응답 기록 실패", e);
        }
    }
}
```

> 💡 **H5 모드와의 차이**: H5 모드는 OAuth2 웹페이지 권한부여를 통해, 권한부여 링크 구성 -> 사용자 동의 -> 리디렉션 콜백 -> 백엔드에서 userid 교환의 흐름이 필요하며, 다수 페이지 이동이 관련됩니다; 미니프로그램 모드는 `wx.qyLogin`으로 한 번에 code를 획득하고, 백엔드에서 직접 userid로 교환하여 사용자 감지가 불필요하며, 경험이 더 좋습니다.

## 五、출퇴근 체크 기능 구현

### 5.1 백엔드 API 연동

#### 5.1.1 access_token 관리

access_token은 기업위챗 API의 전역 티켓으로, 모든 서버 측 API 호출 시 휴대해야 합니다.

**획득 인터페이스**:

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

**응답**:

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "access_token": "***",
  "expires_in": 7200
}
```

**핵심 전략**:
- 유효기간 7200초(2시간), 사전 갱신 필요
- 동일 앱의 유효 access_token은 유일하며, 중복 획득 시 구 token이 무효화됨
- **반드시 서버 측에서 획득**, 프론트엔드에서 직접 호출 불가(secret 노출)
- Redis 캐시 사용 권장, 만료 시간 7100초로 설정(100초 여유 확보)
- 다중 인스턴스 배포 시 분산 락으로 동시 갱신 방지 필요

**SpringBoot Token 관리자**:

```java
/**
 * 기업위챗 access_token 관리자
 * Redis 캐시 + 분산 락으로 동시 갱신 방지
 *
 * @author cuckoom
 */
@Component
@Slf4j
public class WecomTokenManager {

    private static final String TOKEN_CACHE_KEY = "wecom:access_token";
    private static final String TOKEN_LOCK_KEY = "wecom:access_token:lock";
    private static final long TOKEN_EXPIRE_SECONDS = 7100;

    @Value("${wecom.corpid}")
    private String corpId;

    @Value("${wecom.secret}")
    private String secret;

    @Resource
    private StringRedisTemplate redisTemplate;

    @Resource
    private RestTemplate restTemplate;

    /**
     * access_token 획득(이중 검사 + 분산 락)
     */
    public String getAccessToken() {
        // 1. 먼저 캐시 조회
        String cached = redisTemplate.opsForValue().get(TOKEN_CACHE_KEY);
        if (StrUtil.isNotBlank(cached)) {
            return cached;
        }

        // 2. 분산 락 획득
        Boolean locked = redisTemplate.opsForValue()
                .setIfAbsent(TOKEN_LOCK_KEY, "1", 10, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(locked)) {
            // 락 획득 실패, 대기 후 재시도
            return waitForToken();
        }

        try {
            // 3. 이중 검사
            cached = redisTemplate.opsForValue().get(TOKEN_CACHE_KEY);
            if (StrUtil.isNotBlank(cached)) {
                return cached;
            }

            // 4. 기업위챗 API 호출 갱신
            return refreshTokenFromWecom();
        } finally {
            // 5. 락 해제
            redisTemplate.delete(TOKEN_LOCK_KEY);
        }
    }

    /**
     * 기업위챗 API 호출로 신규 token 획득
     */
    private String refreshTokenFromWecom() {
        String url = String.format(
                "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=%s&corpsecret=%s",
                corpId, secret
        );

        JSONObject response = restTemplate.getForObject(url, JSONObject.class);
        if (response == null || response.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR,
                    "access_token 획득 실패: " + (response == null ? "null" : response.getString("errmsg")));
        }

        String accessToken = response.getString("access_token");
        redisTemplate.opsForValue().set(
                TOKEN_CACHE_KEY, accessToken,
                TOKEN_EXPIRE_SECONDS, TimeUnit.SECONDS
        );

        log.info("기업위챗 access_token 갱신 성공");
        return accessToken;
    }

    /**
     * 다른 인스턴스의 token 갱신 대기
     */
    private String waitForToken() {
        for (int i = 0; i < 5; i++) {
            try {
                Thread.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            String token = redisTemplate.opsForValue().get(TOKEN_CACHE_KEY);
            if (StrUtil.isNotBlank(token)) {
                return token;
            }
        }
        throw new BusinessException(ErrorCode.WECOM_API_ERROR, "access_token 획득 시간 초과");
    }
}
```

#### 5.1.2 주소록 관리

주소록 API를 통해 기업 조직 구조와 직원 정보를 동기화할 수 있습니다.

**부서 목록 획득**:

```
GET https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=TOKEN&id=0
```

**부서 멤버 상세 정보 획득**:

```
GET https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token=TOKEN&department_id=1&fetch_child=1
```

**응답 예시**:

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "userlist": [
    {
      "userid": "zhangsan",
      "name": "张三",
      "department": [1, 2],
      "position": "产品经理",
      "mobile": "13800138000",
      "email": "zhangsan@company.com",
      "status": 1,
      "avatar": "https://..."
    }
  ]
}
```

**동기화 전략**: 매일 새벽에 주소록 전량 동기화 1회 실행을 권장하며, 동시에 주소록 변경 콜백 설정(후속 콜백 장 참조)으로 증분 실시간 동기화를 구현합니다.

#### 5.1.3 요청 도구 캡슐화

미니프로그램 측에서 통일된 요청 도구를 캡슐화하여, JWT token을 자동 주입합니다:

```typescript
// utils/request.ts

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, any>;
  header?: Record<string, string>;
}

interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

const BASE_URL = 'https://api.attendance.yourcompany.com';

export async function request<T = any>(options: RequestOptions): Promise<T> {
  const app = getApp<AppData>();

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.header,
  };

  // JWT token 자동 주입
  const token = app.getServerToken();
  if (token) {
    header['Authorization'] = `Bearer ${token}`;
  }

  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      header,
      success: (res) => {
        if (res.statusCode === 401) {
          // token 만료, 재로그인
          app.qyLogin();
          reject(new Error('로그인이 만료되었습니다'));
          return;
        }
        if (res.statusCode === 200) {
          const body = res.data as ApiResponse<T>;
          if (body.code === 0) {
            resolve(body.data);
          } else {
            wx.showToast({ title: body.message || '요청 실패', icon: 'error' });
            reject(new Error(body.message));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      },
      fail: (err) => {
        wx.showToast({ title: '네트워크 오류', icon: 'error' });
        reject(err);
      },
    });
  });
}
```

### 5.2 지리적 위치 출퇴근 체크

지리적 위치는 출퇴근 시스템의 핵심 기능입니다. 미니프로그램은 `wx.getLocation`으로 직접 디바이스 위치를 획득하며, JS-SDK 서명 검증이 불필요합니다(H5 모드에서는 필요).

#### 5.2.1 미니프로그램 측 구현

```typescript
// utils/location.ts

interface LocationInfo {
  latitude: number;
  longitude: number;
  accuracy: number;  // 위치 정확도(미터)
  speed: number;
}

/**
 * 현재 위치 획득
 * app.json에 requiredPrivateInfos: ["getLocation"] 선언 필요
 */
export async function getCurrentLocation(): Promise<LocationInfo> {
  // 위치 권한 확인
  const hasPermission = await checkLocationPermission();
  if (!hasPermission) {
    const granted = await requestLocationPermission();
    if (!granted) {
      throw new Error('출퇴근 체크 기능 사용을 위해 위치 권한을 허용해 주세요');
    }
  }

  // 고정밀 위치 모드
  return new Promise((resolve, reject) => {
    wx.getLocation({
      type: 'gcj02',
      altitude: true,
      isHighAccuracy: true,
      highAccuracyExpireTime: 5000,
      success: (res) => {
        resolve({
          latitude: res.latitude,
          longitude: res.longitude,
          accuracy: res.accuracy,
          speed: res.speed,
        });
      },
      fail: (err) => {
        console.error('위치 획득 실패', err);
        reject(new Error('위치 획득 실패, GPS가 켜져 있는지 확인해 주세요'));
      },
    });
  });
}

/**
 * 위치 권한 확인
 */
function checkLocationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => {
        resolve(res.authSetting['scope.userLocation'] === true);
      },
      fail: () => resolve(false),
    });
  });
}

/**
 * 위치 권한 요청
 */
function requestLocationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.authorize({
      scope: 'scope.userLocation',
      success: () => resolve(true),
      fail: () => {
        // 사용자를 설정 페이지로 안내
        wx.showModal({
          title: '위치 권한',
          content: '출퇴근 체크에 위치 권한이 필요합니다, 설정에서 활성화해 주세요',
          confirmText: '설정으로',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting({
                success: (settingRes) => {
                  resolve(settingRes.authSetting['scope.userLocation'] === true);
                },
                fail: () => resolve(false),
              });
            } else {
              resolve(false);
            }
          },
        });
      },
    });
  });
}

/**
 * 두 점 간 거리 계산(Haversine 공식)
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // 지구 반경(미터)
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}
```

#### 5.2.2 출퇴근 체크 페이지

```typescript
// pages/index/index.ts

import { getCurrentLocation, calculateDistance } from '../../utils/location';
import { request } from '../../utils/request';

interface CheckinPageData {
  currentDate: string;
  currentTime: string;
  locationText: string;
  distance: number;
  inRange: boolean;
  loading: boolean;
}

// 회사 출퇴근 체크 범위 설정
const COMPANY_LAT = 30.2741;
const COMPANY_LNG = 120.1551;
const ALLOWED_RADIUS = 200; // 출퇴근 체크 허용 반경(미터)

Page<CheckinPageData, WeApp.IAnyObject>({
  data: {
    currentDate: '',
    currentTime: '',
    locationText: '',
    distance: 0,
    inRange: false,
    loading: false,
  },

  onShow() {
    this.updateTime();
    setInterval(this.updateTime, 1000);
  },

  updateTime() {
    const now = new Date();
    this.setData({
      currentDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      currentTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
    });
  },

  async handleCheckin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      // 1. 위치 획득
      const location = await getCurrentLocation();

      // 2. 거리 계산
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        COMPANY_LAT,
        COMPANY_LNG,
      );

      const inRange = distance <= ALLOWED_RADIUS;

      this.setData({
        distance: Math.round(distance),
        inRange,
        locationText: inRange ? '출퇴근 체크 범위 내에 있습니다' : `회사까지 ${Math.round(distance)}미터`,
      });

      if (!inRange) {
        wx.showModal({
          title: '출퇴근 체크 범위 외',
          content: `현재 회사까지 ${Math.round(distance)}미터, 허용 범위 ${ALLOWED_RADIUS}미터를 초과합니다.`,
          showCancel: false,
        });
        return;
      }

      // 3. 출퇴근 체크 제출
      const result = await request<{ checkinId: string; time: string }>({
        url: '/api/checkin/submit',
        method: 'POST',
        data: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          distance: Math.round(distance),
          checkinTime: new Date().toISOString(),
        },
      });

      wx.showToast({ title: '출퇴근 체크 성공', icon: 'success' });
      console.log('출퇴근 체크 결과', result);
    } catch (err) {
      console.error('출퇴근 체크 실패', err);
      wx.showToast({
        title: err.message || '출퇴근 체크 실패',
        icon: 'error',
      });
    } finally {
      this.setData({ loading: false });
    }
  },
});
```

#### 5.2.3 백엔드 출퇴근 체크 인터페이스

```java
/**
 * 출퇴근 체크 Controller
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/api/checkin")
@Slf4j
public class CheckinController {

    @Resource
    private CheckinService checkinService;

    /**
     * 출퇴근 체크 제출
     *
     * @param request 출퇴근 체크 요청
     * @param userId 현재 사용자 ID(JWT 인터셉터에서 주입)
     */
    @PostMapping("/submit")
    public Result<CheckinVO> submit(
            @RequestBody @Valid CheckinDTO request,
            HttpServletRequest httpRequest
    ) {
        Long userId = (Long) httpRequest.getAttribute("currentUserId");
        String wecomUserId = (String) httpRequest.getAttribute("currentWecomUserId");

        log.info("사용자 {} 출퇴근 체크 제출, 위치=({},{})",
                wecomUserId, request.getLatitude(), request.getLongitude());

        CheckinVO vo = checkinService.checkin(userId, request);
        return Result.success(vo);
    }

    /**
     * 금일 출퇴근 체크 기록 조회
     */
    @GetMapping("/today")
    public Result<List<CheckinVO>> todayRecords(HttpServletRequest httpRequest) {
        Long userId = (Long) httpRequest.getAttribute("currentUserId");
        return Result.success(checkinService.getTodayRecords(userId));
    }
}
```

```java
/**
 * 출퇴근 체크 Service
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class CheckinService {

    @Value("${attendance.company.latitude}")
    private double companyLat;

    @Value("${attendance.company.longitude}")
    private double companyLng;

    @Value("${attendance.allowed-radius:200}")
    private double allowedRadius;

    @Resource
    private CheckinRecordMapper checkinMapper;

    @Resource
    private WecomMessageService messageService;

    /**
     * 출퇴근 체크
     */
    @Transactional(rollbackFor = Exception.class)
    public CheckinVO checkin(Long userId, CheckinDTO dto) {
        // 1. 거리 검증
        double distance = calculateDistance(
                dto.getLatitude(), dto.getLongitude(),
                companyLat, companyLng
        );

        if (distance > allowedRadius) {
            throw new BusinessException(ErrorCode.OUT_OF_RANGE,
                    String.format("출퇴근 체크 범위 외, 회사까지 %.0f미터", distance));
        }

        // 2. 중복 출퇴근 체크 방지(동일 유형 5분 이내 재체크 불가)
        String checkinType = determineCheckinType(LocalDateTime.now());
        CheckinRecord existing = checkinMapper.findRecentRecord(
                userId, checkinType, 5
        );
        if (existing != null) {
            throw new BusinessException(ErrorCode.DUPLICATE_CHECKIN,
                    "5분 이내 이미 출퇴근 체크를 했습니다, 중복 체크하지 마세요");
        }

        // 3. 출퇴근 체크 기록 저장
        CheckinRecord record = new CheckinRecord();
        record.setUserId(userId);
        record.setCheckinType(checkinType);
        record.setLatitude(dto.getLatitude());
        record.setLongitude(dto.getLongitude());
        record.setAccuracy(dto.getAccuracy());
        record.setDistance(Math.round(distance));
        record.setCheckinTime(LocalDateTime.now());
        record.setCreateTime(LocalDateTime.now());
        checkinMapper.insert(record);

        // 4. 출퇴근 체크 성공 알림 푸시
        messageService.sendCheckinNotification(record);

        return CheckinVO.builder()
                .checkinId(record.getId().toString())
                .time(record.getCheckinTime().toString())
                .type(checkinType)
                .distance(Math.round(distance))
                .build();
    }

    private static double calculateDistance(double lat1, double lng1,
                                            double lat2, double lng2) {
        final double R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * R * Math.asin(Math.sqrt(a));
    }

    private String determineCheckinType(LocalDateTime now) {
        int hour = now.getHour();
        if (hour < 12) {
            return "CLOCK_IN";  // 출근 체크
        } else {
            return "CLOCK_OUT"; // 퇴근 체크
        }
    }
}
```

> 💡 **H5 모드와의 비교**: H5 모드는 JS-SDK의 `wx.getLocation`로 위치를 획득해야 하며, 먼저 `wx.config` 서명 검증이 필요하고, iOS/Android의 서명 URL 처리가 달라 함정이 많습니다; 미니프로그램 모드는 `wx.getLocation`을 직접 호출하여 서명이 불필요하고, API가 통일되어 있어 개발 경험이 현저히 좋습니다.

### 5.3 사진 촬영 출퇴근 체크

사진 촬영 출퇴근 체크는 현장 사진 증빙이 필요한 시나리오(외근 출퇴근 체크, 보충 출퇴근 설명 등)에 사용됩니다.

#### 5.3.1 미니프로그램 측 구현

```typescript
// pages/index/index.ts (사진 촬영 출퇴근 체크 부분)

import { request } from '../../utils/request';

/**
 * 사진 촬영 출퇴근 체크
 * wx.chooseMedia로 사진 획득(권장, 폐기된 wx.chooseImage 대체)
 */
async handlePhotoCheckin() {
  if (this.data.loading) return;
  this.setData({ loading: true });

  try {
    // 1. 사진 촬영
    const media = await this.takePhoto();
    if (!media.tempFilePath) {
      throw new Error('사진 촬영 실패');
    }

    // 2. 위치 획득(사진 출퇴근 체크도 위치 검증 필요)
    const location = await getCurrentLocation();
    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      COMPANY_LAT,
      COMPANY_LNG,
    );

    // 3. 사진을 서버에 업로드
    const uploadResult = await this.uploadPhoto(
      media.tempFilePath,
      location.latitude,
      location.longitude,
    );

    wx.showToast({ title: '사진 출퇴근 체크 성공', icon: 'success' });
    console.log('업로드 결과', uploadResult);
  } catch (err) {
    console.error('사진 출퇴근 체크 실패', err);
    wx.showToast({ title: err.message || '사진 출퇴근 체크 실패', icon: 'error' });
  } finally {
    this.setData({ loading: false });
  }
}

/**
 * 카메라 호출 사진 촬영
 */
private takePhoto(): Promise<{ tempFilePath: string }> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],     // 사진 촬영만 허용, 앨범 선택 불허(부정행위 방지)
      camera: 'back',              // 후면 카메라
      sizeType: ['compressed'],    // 압축 업로드
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          resolve({ tempFilePath: res.tempFiles[0].tempFilePath });
        } else {
          reject(new Error('사진을 획득하지 못했습니다'));
        }
      },
      fail: (err) => {
        reject(new Error('사진 촬영 취소 또는 실패'));
      },
    });
  });
}

/**
 * 사진을 서버에 업로드
 */
private uploadPhoto(filePath: string, latitude: number, longitude: number): Promise<any> {
  const app = getApp<AppData>();
  const token = app.getServerToken();

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: 'https://api.attendance.yourcompany.com/api/checkin/photo',
      filePath,
      name: 'photo',
      formData: {
        latitude: String(latitude),
        longitude: String(longitude),
        checkinTime: new Date().toISOString(),
      },
      header: {
        Authorization: token ? `Bearer ${token}` : '',
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const body = JSON.parse(res.data);
          if (body.code === 0) {
            resolve(body.data);
          } else {
            reject(new Error(body.message || '업로드 실패'));
          }
        } else {
          reject(new Error(`업로드 실패 HTTP ${res.statusCode}`));
        }
      },
      fail: reject,
    });
  });
}
```

#### 5.3.2 백엔드 사진 업로드 인터페이스

```java
/**
 * 사진 촬영 출퇴근 체크 Controller
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/api/checkin")
@Slf4j
public class CheckinPhotoController {

    @Resource
    private CheckinService checkinService;

    @Resource
    private FileStorageService fileStorageService;

    /**
     * 사진 출퇴근 체크 업로드
     *
     * @param file 사진 파일
     * @param latitude 위도
     * @param longitude 경도
     */
    @PostMapping("/photo")
    public Result<CheckinVO> photoCheckin(
            @RequestParam("photo") MultipartFile file,
            @RequestParam("latitude") double latitude,
            @RequestParam("longitude") double longitude,
            HttpServletRequest httpRequest
    ) {
        Long userId = (Long) httpRequest.getAttribute("currentUserId");

        // 1. 파일 검증
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.PARAM_ERROR, "사진은 비어 있을 수 없습니다");
        }
        if (file.getSize() > 5 * 1024 * 1024) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE, "사진은 5MB를 초과할 수 없습니다");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new BusinessException(ErrorCode.FILE_TYPE_ERROR, "이미지 형식만 지원됩니다");
        }

        // 2. 사진을 내부망에 저장(외부 노출하지 않음)
        String photoPath = fileStorageService.store(file, "checkin/" + userId);

        // 3. 출퇴근 체크 기록 생성
        CheckinDTO dto = new CheckinDTO();
        dto.setLatitude(latitude);
        dto.setLongitude(longitude);
        dto.setPhotoPath(photoPath);

        CheckinVO vo = checkinService.photoCheckin(userId, dto);
        return Result.success(vo);
    }
}
```

### 5.4 QR 코드 스캔 출퇴근 체크

QR 코드 스캔 출퇴근 체크는 자리 배정签到, 회의실签到 등 시나리오에 적용되며, 사용자가 고정된 QR 코드를 스캔하여 출퇴근 체크를 완료합니다.

#### 5.4.1 미니프로그램 측 구현

```typescript
// pages/scan/index.ts

import { request } from '../../utils/request';

interface ScanPageData {
  scanning: boolean;
  result: string;
}

Page<ScanPageData, WeApp.IAnyObject>({
  data: {
    scanning: false,
    result: '',
  },

  async handleScan() {
    if (this.data.scanning) return;
    this.setData({ scanning: true });

    try {
      // 1. QR 코드 스캔 호출
      const res = await this.scanQRCode();
      const qrContent = res.result;

      if (!qrContent) {
        throw new Error('스캔 내용이 비어 있습니다');
      }

      // 2. QR 코드 내용 검증(특정 접두사 포함 필요)
      if (!qrContent.startsWith('wecom-attendance://')) {
        throw new Error('출퇴근 QR 코드가 아니어서 체크할 수 없습니다');
      }

      // 3. token 추출
      const qrToken = qrContent.replace('wecom-attendance://', '');

      // 4. 동시에 위치 획득(부정행위 방지: 스캔+위치 이중 검증)
      const location = await getCurrentLocation();

      // 5. QR 스캔 출퇴근 체크 제출
      const result = await request<{ checkinId: string; time: string }>({
        url: '/api/checkin/scan',
        method: 'POST',
        data: {
          qrToken,
          latitude: location.latitude,
          longitude: location.longitude,
        },
      });

      this.setData({ result: '출퇴근 체크 성공' });
      wx.showToast({ title: 'QR 스캔 출퇴근 체크 성공', icon: 'success' });
      console.log('QR 스캔 출퇴근 체크 결과', result);
    } catch (err) {
      console.error('QR 스캔 출퇴근 체크 실패', err);
      this.setData({ result: err.message || 'QR 스캔 출퇴근 체크 실패' });
      wx.showToast({ title: err.message || 'QR 스캔 출퇴근 체크 실패', icon: 'error' });
    } finally {
      this.setData({ scanning: false });
    }
  },

  /**
   * wx.scanCode로 QR 코드 스캔
   */
  scanQRCode(): Promise<{ result: string }> {
    return new Promise((resolve, reject) => {
      wx.scanCode({
        onlyFromCamera: true,   // 카메라 통한 스캔만 허용(스크린샷 부정행위 방지)
        scanType: ['qrCode'],   // QR 코드만 스캔
        success: resolve,
        fail: () => {
          reject(new Error('스캔 취소 또는 실패'));
        },
      });
    });
  },
});
```

#### 5.4.2 백엔드 QR 스캔 출퇴근 체크 인터페이스

```java
/**
 * QR 스캔 출퇴근 체크 Controller
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/api/checkin")
@Slf4j
public class ScanCheckinController {

    @Resource
    private CheckinService checkinService;

    /**
     * QR 스캔 출퇴근 체크
     *
     * @param request QR 스캔 출퇴근 체크 요청
     */
    @PostMapping("/scan")
    public Result<CheckinVO> scanCheckin(
            @RequestBody @Valid ScanCheckinDTO request,
            HttpServletRequest httpRequest
    ) {
        Long userId = (Long) httpRequest.getAttribute("currentUserId");

        log.info("사용자 {} QR 스캔 출퇴근 체크, qrToken={}", userId, request.getQrToken());

        CheckinVO vo = checkinService.scanCheckin(userId, request);
        return Result.success(vo);
    }
}
```

```java
/**
 * QR 스캔 출퇴근 체크 Service 구현
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class ScanCheckinServiceImpl implements CheckinService {

    @Resource
    private QrTokenMapper qrTokenMapper;

    @Resource
    private CheckinRecordMapper checkinMapper;

    @Resource
    private WecomMessageService messageService;

    private static final double COMPANY_LAT = 30.2741;
    private static final double COMPANY_LNG = 120.1551;
    private static final double ALLOWED_RADIUS = 200;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CheckinVO scanCheckin(Long userId, ScanCheckinDTO dto) {
        // 1. QR 코드 token 검증
        QrToken qrToken = qrTokenMapper.findByToken(dto.getQrToken());
        if (qrToken == null) {
            throw new BusinessException(ErrorCode.INVALID_QR_TOKEN, "유효하지 않은 출퇴근 QR 코드");
        }
        if (qrToken.getExpireTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.EXPIRED_QR_TOKEN, "출퇴근 QR 코드가 만료되었습니다");
        }
        if (qrToken.getStatus() == 0) {
            throw new BusinessException(ErrorCode.QR_TOKEN_DISABLED, "출퇴근 QR 코드가 정지되었습니다");
        }

        // 2. 위치 검증
        double distance = calculateDistance(
                dto.getLatitude(), dto.getLongitude(),
                COMPANY_LAT, COMPANY_LNG
        );
        if (distance > ALLOWED_RADIUS) {
            throw new BusinessException(ErrorCode.OUT_OF_RANGE,
                    String.format("출퇴근 체크 범위 외, 회사까지 %.0f미터", distance));
        }

        // 3. 중복 출퇴근 체크 방지
        CheckinRecord existing = checkinMapper.findRecentRecord(userId, "SCAN", 5);
        if (existing != null) {
            throw new BusinessException(ErrorCode.DUPLICATE_CHECKIN, "5분 이내 이미 QR 스캔 출퇴근 체크를 했습니다");
        }

        // 4. 출퇴근 체크 기록 저장
        CheckinRecord record = new CheckinRecord();
        record.setUserId(userId);
        record.setCheckinType("SCAN");
        record.setQrTokenId(qrToken.getId());
        record.setLatitude(dto.getLatitude());
        record.setLongitude(dto.getLongitude());
        record.setDistance(Math.round(distance));
        record.setCheckinTime(LocalDateTime.now());
        record.setCreateTime(LocalDateTime.now());
        checkinMapper.insert(record);

        // 5. 알림 푸시
        messageService.sendCheckinNotification(record);

        return CheckinVO.builder()
                .checkinId(record.getId().toString())
                .time(record.getCheckinTime().toString())
                .type("SCAN")
                .distance(Math.round(distance))
                .build();
    }

    // ... 기타 메서드 생략
}
```

## 六、메시지 푸시 및 콜백

### 6.1 앱 메시지 푸시

메시지 푸시는 기업위챗 앱의 중요한 역량으로, 출퇴근 알림, 승인 통지 등 시나리오에 사용할 수 있습니다.

**앱 메시지 발송**:

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

**텍스트 메시지**:

```json
{
  "touser": "zhangsan|lisi",
  "toparty": "2|3",
  "totag": "tag1",
  "msgtype": "text",
  "agentid": 1000002,
  "text": {
    "content": "오늘 출근 체크 시간은 09:00입니다, 제때 체크해 주세요."
  },
  "duplicate_check_interval": 1800
}
```

**텍스트 카드 메시지**(권장, 앱 페이지로 이동 가능):

```json
{
  "touser": "zhangsan",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "출퇴근 알림",
    "description": "출근 체크 마감까지 15분 남았습니다, 제때 체크해 주세요.",
    "url": "https://attendance.yourcompany.com/checkin",
    "btntxt": "출퇴근 체크하러 가기"
  }
}
```

**템플릿 카드 메시지**(인터랙션 버튼 지원, 승인 통지에 적용):

```json
{
  "touser": "zhangsan",
  "msgtype": "template_card",
  "agentid": 1000002,
  "template_card": {
    "card_type": "button_interaction",
    "source": {
      "desc": "출퇴근 시스템"
    },
    "main_title": {
      "title": "보충 출퇴근 신청 승인",
      "desc": "李四申请补卡 2026-07-08 上午"
    },
    "sub_title_text": "补卡原因：忘记打卡，有工位监控为证",
    "button_list": [
      {
        "text": "同意",
        "style": 1,
        "key": "approve"
      },
      {
        "text": "拒绝",
        "style": 2,
        "key": "reject"
      }
    ],
    "task_id": "task_20260708_001"
  }
}
```

> 💡 **미니프로그램 이동**: 텍스트 카드와 템플릿 카드의 `url` 필드는 미니프로그램 이동 경로(예: `#wecom-miniprogram://pages/index/index`)를 지원하며, 사용자가 메시지를 클릭하면 미니프로그램의 해당 페이지를 직접 열 수 있습니다(H5 링크가 아닌).

**SpringBoot 메시지 푸시 구현**:

```java
/**
 * 기업위챗 메시지 푸시 Service
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class WecomMessageService {

    @Resource
    private WecomTokenManager tokenManager;

    @Resource
    private RestTemplate restTemplate;

    @Value("${wecom.agentid}")
    private Integer agentId;

    /**
     * 출퇴근 체크 성공 알림 발송
     */
    public void sendCheckinNotification(CheckinRecord record) {
        String userid = getUserId(record.getUserId());
        if (StrUtil.isBlank(userid)) {
            log.warn("기업위챗 userid 획득 불가, 푸시 건너뜀: userId={}", record.getUserId());
            return;
        }

        String typeText = "CLOCK_IN".equals(record.getCheckinType()) ? "출근" : "퇴근";
        if ("SCAN".equals(record.getCheckinType())) {
            typeText = "QR 스캔";
        }

        Map<String, Object> message = new HashMap<>();
        message.put("touser", userid);
        message.put("msgtype", "textcard");
        message.put("agentid", agentId);

        Map<String, Object> textCard = new HashMap<>();
        textCard.put("title", "출퇴근 체크 성공");
        textCard.put("description", String.format(
                "%s출퇴근 체크 성공\n시간: %s\n회사까지: %d미터",
                typeText,
                record.getCheckinTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                record.getDistance()
        ));
        // 미니프로그램 이동 링크
        textCard.put("url", "#wecom-miniprogram://pages/records/index");
        textCard.put("btntxt", "기록 보기");
        message.put("textcard", textCard);

        sendMessage(message);
    }

    /**
     * 출퇴근 알림 발송
     */
    public void sendCheckinReminder(String wecomUserId, String content) {
        Map<String, Object> message = new HashMap<>();
        message.put("touser", wecomUserId);
        message.put("msgtype", "text");
        message.put("agentid", agentId);

        Map<String, Object> text = new HashMap<>();
        text.put("content", content);
        message.put("text", text);

        sendMessage(message);
    }

    private void sendMessage(Map<String, Object> message) {
        String accessToken = tokenManager.getAccessToken();
        String url = "https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=" + accessToken;

        try {
            JSONObject response = restTemplate.postForObject(
                    url, message, JSONObject.class
            );
            if (response != null && response.getIntValue("errcode") == 0) {
                log.info("메시지 푸시 성공: {}", response.getString("msgid"));
            } else {
                log.error("메시지 푸시 실패: {}", response);
            }
        } catch (Exception e) {
            log.error("메시지 푸시 예외", e);
        }
    }

    private String getUserId(Long userId) {
        // 시스템 사용자 테이블 조회, 기업위챗 userid 획득
        return userMapper.findWecomUserIdById(userId);
    }
}
```

### 6.2 데이터 콜백

기업위챗은 다양한 이벤트 콜백을 지원하며, 주소록 변경, 주소록 앱 상태 변경, 템플릿 카드 버튼 콜백 등을 포함합니다. 콜백은 HTTP POST 방식으로 개발자가 설정한 URL에 발송됩니다.

#### 6.2.1 콜백 주소 설정

기업위챗 관리 백엔드에서 설정:

```
앱 관리 -> 자체 구축 앱 -> 메시지 수신 -> API 수신 설정
  -> URL: https://api.attendance.yourcompany.com/api/wecom/callback/message
  -> Token: 커스텀 Token(서명 검증용)
  -> EncodingAESKey: 무작위 생성(메시지 가/복호화용)
```

#### 6.2.2 콜백 서명 검증 및 복호화

기업위챗 콜백 메시지는 AES 암호화를 사용하며, 서명 검증과 복호화 구현이 필요합니다:

```java
/**
 * 기업위챗 콜백 Controller
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/api/wecom/callback")
@Slf4j
public class WecomCallbackController {

    @Resource
    private WecomCallbackService callbackService;

    /**
     * URL 검증(GET 요청)
     * 기업위챗에서 콜백 주소 설정 시 URL 유효성 검증
     */
    @GetMapping("/message")
    public String verifyUrl(
            @RequestParam("msg_signature") String msgSignature,
            @RequestParam("timestamp") String timestamp,
            @RequestParam("nonce") String nonce,
            @RequestParam("echostr") String echoStr
    ) {
        log.info("기업위챗 콜백 URL 검증");
        try {
            return callbackService.verifyUrl(msgSignature, timestamp, nonce, echoStr);
        } catch (Exception e) {
            log.error("URL 검증 실패", e);
            return "";
        }
    }

    /**
     * 이벤트 콜백 수신(POST 요청)
     */
    @PostMapping(value = "/message", produces = "application/xml")
    public String receiveCallback(
            @RequestParam("msg_signature") String msgSignature,
            @RequestParam("timestamp") String timestamp,
            @RequestParam("nonce") String nonce,
            @RequestBody String encryptedMsg
    ) {
        log.info("기업위챗 콜백 수신");
        try {
            callbackService.handleCallback(msgSignature, timestamp, nonce, encryptedMsg);
            return "success";
        } catch (Exception e) {
            log.error("콜백 처리 실패", e);
            return "success"; // success 반환하여 기업위챗 재시도 방지
        }
    }
}
```

#### 6.2.3 템플릿 카드 버튼 콜백

사용자가 템플릿 카드 메시지의 버튼을 클릭하면, 기업위챗은 콜백 URL에 버튼 이벤트를 푸시합니다:

```java
/**
 * 기업위챗 콜백 Service
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class WecomCallbackService {

    @Value("${wecom.callback.token}")
    private String callbackToken;

    @Value("${wecom.callback.encoding-aes-key}")
    private String encodingAesKey;

    @Value("${wecom.corpid}")
    private String corpId;

    @Resource
    private RestTemplate restTemplate;

    @Resource
    private ApplyApprovalService approvalService;

    /**
     * 콜백 이벤트 처리
     */
    public void handleCallback(String msgSignature, String timestamp,
                               String nonce, String encryptedMsg) {
        // 1. 메시지 복호화
        WecomCallbackMessage message = decryptMessage(msgSignature, timestamp, nonce, encryptedMsg);

        // 2. 이벤트 유형별 처리
        String eventType = message.getEventType();
        switch (eventType) {
            case "template_card_event":
                handleTemplateCardEvent(message);
                break;
            case "change_contact":
                handleContactChange(message);
                break;
            default:
                log.info("미처리 이벤트 유형: {}", eventType);
        }
    }

    /**
     * 템플릿 카드 버튼 클릭 이벤트 처리
     */
    private void handleTemplateCardEvent(WecomCallbackMessage message) {
        String taskId = message.getTaskId();
        String buttonKey = message.getButtonKey();
        String userId = message.getUserId();

        log.info("템플릿 카드 버튼 클릭: taskId={}, buttonKey={}, userId={}",
                taskId, buttonKey, userId);

        if ("approve".equals(buttonKey)) {
            approvalService.approve(taskId, userId);
        } else if ("reject".equals(buttonKey)) {
            approvalService.reject(taskId, userId);
        }
    }

    /**
     * 주소록 변경 처리
     */
    private void handleContactChange(WecomCallbackMessage message) {
        String changeType = message.getChangeType();
        String userId = message.getUserId();

        log.info("주소록 변경: type={}, userId={}", changeType, userId);

        switch (changeType) {
            case "create_user":
                // 신규 직원: 시스템 사용자 생성
                break;
            case "update_user":
                // 직원 업데이트: 정보 동기화
                break;
            case "delete_user":
                // 직원 삭제: 계정 정지
                break;
            default:
                log.info("미처리 주소록 변경 유형: {}", changeType);
        }
    }

    /**
     * 기업위챗 콜백 메시지 복호화
     */
    private WecomCallbackMessage decryptMessage(String msgSignature, String timestamp,
                                                 String nonce, String encryptedMsg) {
        // 서명 검증
        String calculatedSignature = Sha1Util.sha1(
                callbackToken, timestamp, nonce, encryptedMsg
        );
        if (!calculatedSignature.equals(msgSignature)) {
            throw new BusinessException(ErrorCode.SIGN_VERIFY_FAILED, "콜백 서명 검증 실패");
        }

        // AES 복호화
        String decryptedXml = AesUtil.decrypt(encodingAesKey, encryptedMsg, corpId);
        return XmlUtil.parseXml(decryptedXml, WecomCallbackMessage.class);
    }
}
```

### 6.3 미니프로그램과 H5의 OAuth 차이 비교

| 비교 항목 | 기업위챗 미니프로그램 | H5 앱 |
|--------|--------------|---------|
| 인증 진입 | `wx.qyLogin()` API 호출 | OAuth2 권한부여 링크 페이지 이동 |
| code 출처 | `wx.qyLogin`이 반환한 `code` | OAuth2 리디렉션 파라미터 `code` |
| code 교환 인터페이스 | `jscode2session` | `getuserinfo` |
| 사용자 감지 | 완전 자동, 무감각 | 사용자 권한부여 동의 필요할 수 있음(snsapi_base는 자동, snsapi_privateinfo는 확인 필요) |
| 획득 정보 | userid + session_key | userid(snsapi_base) 또는 상세 정보(snsapi_privateinfo) |
| 보안 메커니즘 | session_key로 암호화 데이터 복호화 | 추가 암호화 층 없음 |
| 도메인 요구 | 서버 도메인(request 도메인) | 신뢰 도메인(웹페이지 권한부여 도메인) |
| 콜백 처리 | 리디렉션 콜백 불필요 | redirect_uri 콜백 페이지에서 code 처리 필요 |
| 다중 단말 일치성 | 기업위챗이 일치 보장 | iOS/Android WebView 차이 처리 필요 |

**H5 OAuth2 권한부여 흐름(참고용)**:

```
사용자가 앱 입구 클릭
  -> 기업위챗이 권한부여 링크 구성, 사용자 권한부여 동의
  -> 콜백 주소로 리디렉션, code 휴대
  -> 백엔드에서 code로 userid 교환
  -> 세션 설정, 비즈니스 token 반환
```

**권한부여 링크 구성**:

```
https://open.weixin.qq.com/connect/oauth2/authorize
  ?appid=CORPID
  &redirect_uri=https%3A%2F%2Fattendance.yourcompany.com%2Fauth%2Fcallback
  &response_type=code
  &scope=snsapi_base
  &agentid=AGENTID
  &state=STATE
#wechat_redirect
```

| 파라미터 | 설명 |
|------|------|
| `appid` | 기업의 corpid |
| `redirect_uri` | 콜백 주소, 반드시 신뢰 도메인 하에 있어야 하며, URL 인코딩 필요 |
| `scope` | `snsapi_base`(자동 권한부여, userid만 획득) 또는 `snsapi_privateinfo`(상세 정보 획득) |
| `agentid` | 앱 agentid |
| `state` | CSRF 방지, 원래대로 반환 |

## 七、보안 설계

### 7.1 access_token 안전 관리

- access_token은 절대 프론트엔드에 노출해서는 안 되며, 반드시 서버 측에서 획득하고 관리해야 합니다
- 캐시(Redis 등) 사용을 권장하며, TTL을 7100초로 설정(100초 여유 확보)
- 다중 인스턴스 배포 시 분산 락으로 동시 갱신으로 인한 구 token 무효화 방지 필요
- token 갱신 빈도 정기 모니터링, 비정상적으로 빈번한 갱신은 유출 가능성 시사

### 7.2 민감 설정 분리

corpid, secret, agentid 등 민감 정보는 하드코딩하거나 코드 저장소에 커밋하지 않아야 합니다:

```yaml
# application-prod.yml(프로덕션 환경)
wecom:
  corpid: ${WECOM_CORPID}        # 환경 변수 주입
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}
```

```bash
# 환경 변수 주입(배포 스크립트)
export WECOM_CORPID="your_corpid"
export WECOM_AGENTID="your_agentid"
export WECOM_SECRET="your_secret"
```

### 7.3 미니프로그램 보안 설계

미니프로그램 모드에서는 다음 보안 요점에 주의해야 합니다:

**1. 서버 도메인 화이트리스트**:
- 모든 `wx.request`, `wx.uploadFile` 호출은 반드시 설정된 합법 도메인을 지정해야 합니다
- 개발자 도구에서「합법 도메인 미검사」체크 가능하나, **프로덕션 환경에서는 반드시 올바르게 설정**해야 합니다
- 도메인은 반드시 HTTPS이며, HTTP와 IP를 지원하지 않습니다

**2. JWT Token 관리**:
- token 유효기간은 너무 길지 않게(2-7일 권장), 만료 후 `wx.qyLogin`으로 자동 갱신
- token은 미니프로그램 Storage에 저장, 기업위챗 종료 시 자동 삭제
- 서버 측에서 token에 대응하는 디바이스 정보를 기록, 원격 폐기 지원

**3. 코드 패키지 보안**:
- 미니프로그램 코드 패키지는 사용자 디바이스에 캐시되므로, 코드에 어떠한 민감 정보도 하드코딩하지 마세요
- 환경 변수와 인터페이스 주소는 빌드 시 주입하여 dev/prod 환경 구분

```typescript
// config/env.ts
const env = __wxConfig.envVersion; // 'develop' | 'trial' | 'release'

export const config = {
  develop: {
    apiUrl: 'http://localhost:8080',
  },
  trial: {
    apiUrl: 'https://api-staging.attendance.yourcompany.com',
  },
  release: {
    apiUrl: 'https://api.attendance.yourcompany.com',
  },
}[env] || {
  apiUrl: 'https://api.attendance.yourcompany.com',
};

export const API_BASE_URL = config.apiUrl;
```

**4. session_key 보호**:
- `session_key`는 서버 측에서만 사용, 절대 프론트엔드에 반환하지 마세요
- 암호화 데이터(휴대전화 번호, 위치 등 암호화 정보) 복호화에 사용
- Redis에 캐시, 합리적인 TTL 설정

### 7.4 API 보안

- 모든 비즈니스 인터페이스는 인증(JWT) 필요, OAuth2 콜백과 기업위챗 콜백 인터페이스 제외
- 재생 방지: 인터페이스 서명 + 타임스탬프 검증
- 속도 제한: 악의적 호출 방지, Redis + 토큰 버킷 또는 슬라이딩 윈도우 사용
- 입력 검증: `@Valid` 어노테이션으로 요청 파라미터 검증

```java
/**
 * 인터페이스 속도 제한 어노테이션
 *
 * @author cuckoom
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {
    /** 속도 제한 key 접두사 */
    String key() default "";
    /** 시간 윈도우 내 허용 요청 수 */
    int limit() default 60;
    /** 시간 윈도우(초) */
    int window() default 60;
}

/**
 * 속도 제한 어스팩트
 */
@Aspect
@Component
@Slf4j
public class RateLimitAspect {

    @Resource
    private StringRedisTemplate redisTemplate;

    @Around("@annotation(rateLimit)")
    public Object around(ProceedingJoinPoint joinPoint, RateLimit rateLimit) throws Throwable {
        String methodName = joinPoint.getSignature().getName();
        String key = "rate_limit:" + rateLimit.key() + ":" + methodName;

        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1) {
            redisTemplate.expire(key, rateLimit.window(), TimeUnit.SECONDS);
        }

        if (count != null && count > rateLimit.limit()) {
            throw new BusinessException(ErrorCode.RATE_LIMIT_EXCEEDED, "요청이 너무 빈번합니다, 잠시 후 재시도해 주세요");
        }

        return joinPoint.proceed();
    }
}
```

### 7.5 데이터 보안

- 출퇴근 체크 사진 등 민감 데이터는 내부망 파일 시스템에 저장, 외부 노출하지 않음
- 사용자 휴대전화 번호 등 민감 필드는 암호화 저장(AES-256)
- 데이터베이스 정기 백업
- 출퇴근 기록의 위치 데이터는 마스킹 표시(백 미터 단위까지)

## 八、함정 회피 가이드

### 8.1 access_token 동시 갱신

**문제**: 다중 인스턴스가 동시에 access_token을 갱신하여, 구 token이 무효화되고 다른 인스턴스의 요청이 오류 발생.

**방안**: 분산 락을 사용하여 하나의 인스턴스만 갱신하도록 보장하고, 다른 인스턴스는 대기. 이중 검사 모드: 락 획득 후 캐시 재확인하여 중복 갱신 방지. 제5장 `WecomTokenManager` 구현 참조.

### 8.2 미니프로그램 code는 한 번만 사용 가능

**문제**: `wx.qyLogin`이 반환한 `code`는 한 번만 사용 가능하며, 5분 이내 유효. 동일 code로 `jscode2session`을 반복 호출하면 오류 발생.

**방안**:
- 미니프로그램 측에서 매 시작 시 `wx.qyLogin`을 호출하여 신규 code 획득
- 백엔드는 code 수신 즉시 교환, 캐시하지 않음
- 교환 성공 후 JWT 발급, 후속 요청은 code가 아닌 JWT 사용

### 8.3 requiredPrivateInfos 선언 누락

**문제**: `wx.getLocation` 호출 시 `getLocation is not a function` 오류 또는 app.json에 선언 필요하다는 안내.

**방안**: `app.json`에 필요한 프라이버시 API 선언:

```json
{
  "requiredPrivateInfos": [
    "getLocation",
    "chooseLocation"
  ]
}
```

동시에 `permission` 필드에 권한 용도 설명을 선언해야 하며, 그렇지 않으면 심사가 반려될 수 있습니다.

### 8.4 위치 정확도 및 부정행위 방지

**문제**: GPS 위치 정확도는 약 10-50미터로, 드리프트가 존재합니다; 일부 사용자가 가상 위치 소프트웨어로 부정행위를 할 수 있습니다.

**방안**:
- 허용 반경을 100-300미터로 설정, 너무 엄격하면 오탐지 발생
- 미니프로그램 측에서 고정밀 위치 요청(`isHighAccuracy: true`), `accuracy` 필드 검증, 정확도가 100미터보다 떨어지면 사용자에게 탁 트인 곳으로 이동 안내
- 백엔드에서 이상 탐지: 빈번한 보충 출퇴근, 비업무일 출퇴근 체크, 타지역 출퇴근 체크 등
- 사진 출퇴근 체크에 워터마크 추가(시간 + 위치 + 디바이스 지문)
- QR 스캔 출퇴근 체크는 위치와 이중 검증 결합
- 모의 위치 탐지: 미니프로그램은 `wx.getLocation`의 `accuracy`로 판단 가능, 모의 위치는 보통 정확도가 0 또는 고정값

### 8.5 미니프로그램 서버 도메인 설정

**문제**: 개발 환경 백엔드 주소가 `http://localhost:8080`이면, 미니프로그램 요청 실패 시「다음 request 합법 도메인 목록에 없습니다」안내.

**방안**:
- 개발 단계: 위챗 개발자 도구 -> 상세 -> 로컬 설정 -> 「합법 도메인, web-view(비즈니스 도메인), TLS 버전 및 HTTPS 증명서 미검사」체크
- 체험판과 정식판: 반드시 관리 백엔드에서 서버 도메인 설정, localhost와 IP 미지원
- request, uploadFile, downloadFile 도메인은 각각 설정 필요
- 매월 최대 50회 도메인 설정 수정 가능

### 8.6 wx.chooseImage 폐기됨

**문제**: `wx.chooseImage` 사용 시 일부 디바이스에서 예외 반환.

**방안**: `wx.chooseMedia`로 마이그레이션, 동시에 이미지와 비디오 선택을 지원하며 API가 더 안정적:

```typescript
// 구 API(폐기됨)
wx.chooseImage({ ... });

// 신규 API(권장)
wx.chooseMedia({
  count: 1,
  mediaType: ['image'],
  sourceType: ['camera'],
  ...
});
```

### 8.7 미니프로그램 버전 출시 및 롤백

**문제**: 미니프로그램은 심사 제출 후 출시 가능하며, 심사 기간 온라인 버전은 여전히 구버전이고, 긴급 버그 발생 시 즉시 롤백 불가.

**방안**:
- 미니프로그램은 「체험판」과 「정식판」 분리 지원, 개발과 테스트는 체험판에서 진행
- 정식판 출시 전 체험판으로 완전 테스트 먼저 진행
- 기업위챗의 점진적 출시 역량 활용, 소범위 출시 후 전량 전환
- 백엔드 API는 하위 호환성 유지, 미니프로그램 구버전 호출 실패 방지
- 긴급 상황 시 관리 백엔드에서 「출시된 버전 회수」가능(횟수 제한 있음)

### 8.8 H5 JS-SDK 서명 URL iOS/Android 차이

**문제**: H5 모드에서 JS-SDK 서명 URL이 iOS와 Android에서 처리 방식이 다름:
- Android: 현재 페이지 URL 사용
- iOS: 진입 페이지 URL(처음 앱에 진입한 URL) 사용

**방안**: iOS에서는 진입 URL을 기록, 후속 서명은 모두 해당 URL 사용; Android는 현재 페이지 URL 사용. 미니프로그램 모드는 이 문제가 없으므로, 미니프로그램 선택의 큰 장점입니다.

### 8.9 기업위챗 API 빈도 제한

| API | 제한 |
|-----|------|
| access_token 획득 | 동일 기업 5분당 최대 1000회 |
| 메시지 발송 | 앱당 분당 최대 200회 |
| 주소록 읽기 | 하루 최대 10000회 |
| 출퇴근 데이터 획득 | 하루 최대 1000회 |
| jscode2session | 앱당 분당 최대 600회 |

고빈도 호출은 캐시와 배치 처리가 필요합니다.

### 8.10 미니프로그램 패키지 크기 제한

**문제**: 미니프로그램 메인 패키지가 2MB 초과 시 미리보기/업로드 불가, 총 패키지가 20MB 초과 시 출시 불가.

**방안**:
- 출퇴근 기록 목록, 보충 출퇴근 신청 등 비핵심 페이지를 분할 패키지에 배치
- 이미지 리소스는 CDN에 업로드, 코드 패키지에 내장하지 않음
- `wx.subPackages`로 분할 패키지 설정

```json
{
  "subPackages": [
    {
      "root": "pages/records",
      "pages": ["index"]
    },
    {
      "root": "pages/apply",
      "pages": ["index"]
    }
  ]
}
```

## 九、프로젝트 구축 실전 보충

### 9.1 백엔드 프로젝트 구조

```
attendance-backend/
├── pom.xml
├── src/main/java/com/company/attendance/
│   ├── AttendanceApplication.java
│   ├── config/
│   │   ├── WebMvcConfig.java          # Web 설정(인터셉터 등록, CORS)
│   │   ├── WecomConfig.java           # 기업위챗 설정 클래스
│   │   ├── RestTemplateConfig.java     # RestTemplate 설정
│   │   └── RedisConfig.java           # Redis 설정
│   ├── controller/
│   │   ├── QyAuthController.java       # 인증(미니프로그램 로그인)
│   │   ├── CheckinController.java      # 출퇴근 체크
│   │   ├── CheckinPhotoController.java # 사진 출퇴근 체크
│   │   ├── ScanCheckinController.java  # QR 스캔 출퇴근 체크
│   │   └── WecomCallbackController.java # 기업위챗 콜백
│   ├── service/
│   │   ├── QyAuthService.java
│   │   ├── CheckinService.java
│   │   ├── WecomTokenManager.java
│   │   └── WecomMessageService.java
│   ├── interceptor/
│   │   └── JwtAuthInterceptor.java
│   ├── entity/
│   ├── dto/
│   ├── vo/
│   ├── mapper/
│   └── common/
│       ├── Result.java
│       ├── ErrorCode.java
│       ├── BusinessException.java
│       └── GlobalExceptionHandler.java
└── src/main/resources/
    ├── application.yml
    ├── application-dev.yml
    ├── application-prod.yml
    └── db/
        └── changelogs/
            └── 001-create-checkin-table.xml
```

### 9.2 핵심 설정 파일

```yaml
# application.yml
server:
  port: 8080
  servlet:
    context-path: /

spring:
  application:
    name: attendance-backend
  datasource:
    url: jdbc:postgresql://localhost:5432/attendance
    username: ${DB_USERNAME:postgres}
    password: ${DB_PASSWORD:postgres}
    driver-class-name: org.postgresql.Driver
  jackson:
    date-format: yyyy-MM-dd HH:mm:ss
    time-zone: Asia/Shanghai
  liquibase:
    enabled: true
    change-log: classpath:db/changelog-master.xml

# 기업위챗 설정
wecom:
  corpid: ${WECOM_CORPID}
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}

# 출퇴근 설정
attendance:
  company:
    latitude: 30.2741
    longitude: 120.1551
  allowed-radius: 200

# JWT 설정
jwt:
  secret: ${JWT_SECRET}
  expiration: 604800  # 7일(초)

mybatis-plus:
  mapper-locations: classpath*:/mapper/**/*.xml
  type-aliases-package: com.company.attendance.entity
  configuration:
    map-underscore-to-camel-case: true
```

### 9.3 데이터베이스 테이블 설계

```sql
-- 출퇴근 체크 기록 테이블
CREATE TABLE checkin_record (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT       NOT NULL,
    checkin_type    VARCHAR(20)  NOT NULL,  -- CLOCK_IN / CLOCK_OUT / SCAN / PHOTO
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    accuracy        DOUBLE PRECISION,
    distance        INTEGER,
    photo_path      VARCHAR(500),
    qr_token_id     BIGINT,
    checkin_time    TIMESTAMP    NOT NULL,
    create_time     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- QR 스캔 token 테이블
CREATE TABLE qr_token (
    id              BIGSERIAL PRIMARY KEY,
    token           VARCHAR(100) NOT NULL UNIQUE,
    location_name   VARCHAR(100),
    status          SMALLINT     NOT NULL DEFAULT 1,
    expire_time     TIMESTAMP    NOT NULL,
    create_time     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 사용자 테이블
CREATE TABLE sys_user (
    id              BIGSERIAL PRIMARY KEY,
    wecom_user_id   VARCHAR(50)  NOT NULL UNIQUE,
    name            VARCHAR(50)  NOT NULL,
    avatar          VARCHAR(500),
    department_ids  VARCHAR(200),
    mobile          VARCHAR(20),
    email           VARCHAR(100),
    status          SMALLINT     NOT NULL DEFAULT 1,
    create_time     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_checkin_user_time ON checkin_record (user_id, checkin_time);
CREATE INDEX idx_checkin_type ON checkin_record (checkin_type);
CREATE INDEX idx_qr_token_token ON qr_token (token);
```

## 결론

기업위챗 앱 개발의 핵심은 다음 핵심环节을 이해하는 데 있습니다:

- **개발 모드 선정**: 미니프로그램 모드는 경험이 원래에 더 가깝고, API 호출이 더 직접적이어서 출퇴근 등 고빈도 시나리오에 적합; H5 모드는 유연성이 높아 빈번한 반복의 콘텐츠형 앱에 적합
- **인증 체계**: corpid/secret/agentid 3요소 -> access_token 전역 티켓 -> 미니프로그램 `wx.qyLogin`으로 code 획득 -> 백엔드 `jscode2session`으로 userid 교환
- **디바이스 역량 호출**: 미니프로그램은 `wx.getLocation`, `wx.chooseMedia`, `wx.scanCode`로 원래 역량을 직접 호출하며, JS-SDK 서명 불필요
- **백엔드 API 연동**: access_token 관리(Redis 캐시 + 분산 락), 주소록 동기화, 메시지 푸시(텍스트 카드 / 템플릿 카드)
- **보안 설계**: 민감 설정 환경 변수 주입, JWT 인증, session_key 보호, API 속도 제한, 데이터 마스킹
- **배포 요구**: 미니프로그램 서버 도메인 HTTPS 강제 요구, 백엔드에서 access_token 집중 관리

핵심 함정 회피 포인트: access_token 동시 갱신, 미니프로그램 code 일회성 사용, `requiredPrivateInfos` 선언, 서버 도메인 설정, 패키지 크기 제한, API 빈도 제한.

공식 문서: [https://developer.work.weixin.qq.com/document/](https://developer.work.weixin.qq.com/document/)

> 본문은 출퇴근 시스템을 실마리로, 기업위챗 미니프로그램 모드를 주선으로, 앱 개발의 완전한 기술 링크를 정리했습니다. 핵심 모드(`wx.qyLogin` 인증 -> 원래 API 호출 -> 백엔드 API 연동 -> 메시지 푸시 -> 콜백 처리)는 모든 유형의 기업위챗 미니프로그램 앱 개발에 적용됩니다. H5 모드는 비교용으로, 빠른 반복이나 콘텐츠 표시 위주의 시나리오에서 여전히 대체 불가능한 장점이 있습니다.
