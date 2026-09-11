---
title: "Complete Guide to WeCom App Development: Integrating an Existing Attendance + Activiti Approval System via H5"
date: 2026-07-09 21:00:00
tags:
  - WeCom
  - H5 Development
  - Attendance System
  - Activiti
  - Workflow
  - Single Sign-On
  - API Integration
categories:
  - Technical Practice
lang: en
---

For most teams, WeCom development is not about building a new system from scratch. They face a more common and more realistic scenario: **the business system already exists and has been running for years** — the attendance module went live long ago, and the approval workflow is built on Activiti with complex processes such as countersign (all must approve), or-sign (any one approves), and organization-chart-based multi-level approval, and the approval process queries and interacts with attendance data along the way. The requirement now is: bring this system into WeCom, so employees can open it from the WeCom Workbench and use it immediately — **no username or password needed; they land straight on their own attendance data and to-do tasks**.

Under these conditions, the H5 app model is often a better fit than a Mini Program: the existing system is already an Angular + SpringBoot web application, so H5 can reuse the frontend pages and backend APIs directly, and with WeCom OAuth2 web authorization (`snsapi_base`) it achieves a fully silent automatic login (SSO). Deployment takes effect immediately with no review or release, and iteration cost is minimal when approval forms change frequently.

Set against the backdrop of "**an existing attendance management system + a complex Activiti approval workflow**," and **taking the H5 model as the main thread**, this article explains systematically how to complete the WeCom-side integration without rewriting the business system. It focuses on the full chain of OAuth2 silent automatic login, the binding and mapping between WeCom accounts and system accounts, JS-SDK device capability invocation, and the WeCom-side implementation of Activiti countersign / or-sign / organization-chart approval interacting with attendance (to-do push, one-tap approval cards, organization-chart synchronization).

<!-- more -->

## 1. Scenario Analysis and Model Selection

### 1.1 Assumptions About the Existing System

This article assumes the business system looks as follows (a typical shape for internal systems in most mid-to-large enterprises):

- **Attendance management**: complete check-in, check-in records, make-up check-in requests, and attendance statistics already exist, with REST APIs provided by the backend
- **Approval workflow engine**: built on Activiti (6.x/7.x); the process definitions include:
  - **Countersign (all must approve)**: one node requires approval from multiple people (e.g., a make-up check-in must be approved by both the direct manager and HR)
  - **Or-sign (any one approves)**: at one node, any one of several people can approve (e.g., a department duty-approval group)
  - **Organization-chart-based approval**: approvers are determined dynamically according to the applicant's department (department head → executive in charge → HRBP)
  - **Attendance data interaction**: the approval process reads/writes attendance data (e.g., after a make-up check-in is approved, the check-in record is corrected automatically; after annual leave is approved, the leave balance is deducted)
- **Account system**: the system has its own user table and role/permission model (e.g., Spring Security + JWT/Session)
- **Frontend**: an existing web client, an Angular single-page application (TypeScript)

There are only two core problems to solve:

1. **Identity**: who is the person entering from WeCom? How do they map to a system account for automatic login?
2. **Entry and reach**: how do users enter the app from the WeCom Workbench? How are approval to-do tasks proactively pushed to employees' WeCom?

None of the business logic (check-in rules, approval transitions) **needs to be moved into WeCom at all**. WeCom only plays three roles: "entry point + identity provider (IdP) + message channel."

### 1.2 Why H5 Is the First Choice for This Scenario

| Dimension | H5 app (the approach in this article) | WeCom Mini Program |
|----------|--------------------|----------------|
| Reuse of existing web frontend | Existing Angular pages reused directly | All pages must be rewritten in WXML/WXSS |
| Reuse of existing backend APIs | Reused directly; only one OAuth login endpoint added | Reused too, but the entire frontend is redone |
| Automatic login | OAuth2 `snsapi_base` silent authorization, completely seamless | `wx.qyLogin` silent, also seamless |
| Release and iteration | Takes effect on deployment; approval forms change anytime | Requires review and release; emergency fixes are slow |
| Complex forms / workflow pages | Web tech is flexible, well suited to form-heavy approval pages | Form-engine-style pages are expensive to build |
| Device capabilities | JS-SDK: geolocation/camera/scan (signature required) | Native API calls, marginally better experience |
| Approval business: "low frequency, form-heavy, fast iteration" | Excellent fit | Overweight |

**Conclusion**: check-in itself is high-frequency and device-heavy, and the Mini Program experience is indeed better; but under the premise of "**integrating an existing system, with complex and frequently changing approval flows, where the primary goals are low-cost launch and automatic login**," H5's overall benefits far outweigh the small gap in experience. H5 can also invoke geolocation, camera, and scan via JS-SDK, fully covering the attendance scenario. Later in the article we provide the complete JS-SDK signature scheme and iOS/Android pitfall handling.

> If check-in experience requirements increase later, a hybrid model is possible: the same self-built app is configured with both an H5 home page (approval, records, statistics) and a Mini Program (check-in); message cards route by business type, and the backend account system is fully shared.

### 1.3 Overall Architecture

```
┌───────────────────────────────┐
│          WeCom Client          │
│  Workbench / message cards /  │
│  Scan                          │
└───────────────┬───────────────┘
                │ Opens H5 (built-in WebView)
                ▼
┌───────────────────────────────┐
│  H5 frontend (reuses existing │
│  web project)                 │
│  Angular SPA + wx JS-SDK      │
│  route guard: no token →      │
│  redirect to OAuth            │
└───────────────┬───────────────┘
                │ HTTPS (JWT)
                ▼
┌───────────────────────────────────────────────────────┐
│              Existing business backend (SpringBoot)    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ WecomOAuth   │  │ Attendance   │  │ Activiti      │ │
│  │ silent login/│  │ module       │  │ approval      │ │
│  │ account bind │  │ (existing,   │  │ (existing,    │ │
│  │              │  │  reused)     │  │  reused)      │ │
│  └──────┬───────┘  └──────────────┘  └───────┬───────┘ │
│         │       account mapping table:       │         │
│         │       user_id ↔ wecom_userid       │         │
└─────────┼────────────────────────────────────┼─────────┘
          ▼                                    ▼
┌───────────────────┐              ┌──────────────────────┐
│ WeCom server API  │              │ PostgreSQL / Redis   │
│ gettoken          │              │ business tables +    │
│ auth/getuserinfo  │              │ act_* workflow tables│
│ jsapi_ticket      │              └──────────────────────┘
│ message/send push │◀──── Backend pushes a card when an
└───────────────────┘       approval to-do is created
```

Key design principle: **the WeCom userid is merely an external identity field on the system's user table**. Attendance and Activiti candidates/assignees still use the internal system userId (or are unified with the userid — see the discussion in section 4.6). Thus WeCom is just one more login method, without intruding on the existing permission and workflow models.

> The diagram places the H5 frontend, the WeCom adaptation logic, and the business backend on the same side to illustrate the call relationships. If your attendance system is deployed in an intranet isolation zone and is not directly reachable from WeCom or external phones, you need to deploy a separate public relay gateway in the DMZ (put the WeCom adaptation logic on the gateway, keep the business in the intranet, and let the two sides communicate in a controlled manner via mTLS + internal tokens). See **Chapter 9, "Public Relay Gateway Under Network Isolation."**

## 2. Setting Up the Development Environment

### 2.1 Create a Self-Built App and Obtain the Three Credentials

1. Go to the [WeCom Admin Console](https://work.weixin.qq.com/) and log in with an administrator account
2. **App Management → Self-built → Create App**; fill in the app name (e.g., "Mobile Attendance & Approval"), logo, and visibility scope
3. After creation, record three key parameters:

| Parameter | Description | Where to get it |
|------|------|----------|
| `corpid` | Unique enterprise ID | My Enterprise → Enterprise Info → Enterprise ID |
| `agentid` | Unique app ID | App Management → Self-built App → AgentId |
| `secret` | App secret | App Management → Self-built App → Secret |

> ⚠️ The `secret` is the most sensitive credential. **Store it only on the server side**; it must never appear in H5 frontend code, Git repositories, or browser requests.

### 2.2 Configure the App Home Page (the H5 Entry)

On the app details page, configure the H5 home URL under **App Home Page**:

```
App Management → Self-built App → App Home Page → Configure Web Page
  Home URL: https://attendance.yourcompany.com/mobile/
```

When an employee taps the app icon in the WeCom Workbench, this URL opens inside WeCom's built-in browser. We recommend using a dedicated path for the mobile H5 app (such as `/mobile/`), separate from the PC admin client, to make routing split and independent layouts easier.

### 2.3 Configure the Trusted Domain (the Most Critical Backend Setting for H5)

In H5 mode, both the OAuth web-authorization callback domain and JS-SDK rely on the "trusted domain":

```
App Management → Self-built App → Developer Interfaces → Web Authorization & JS-SDK
  → Set trusted domain: attendance.yourcompany.com
  → Download the domain-ownership verification file (WW_verify_xxxx.txt)
  → Place the file in the domain root so it is accessible at:
    https://attendance.yourcompany.com/WW_verify_xxxx.txt
```

Domain requirements:

- Must be **HTTPS** (mandatory for OAuth authorization and JS-SDK)
- ICP filing completed (for servers in mainland China)
- The ownership verification file is served directly by the frontend static-resource service or Nginx
- One app can have multiple trusted domains (the domain registrant must be consistent), and the callback URL must live under one of these domains

Also configure the **Enterprise Trusted IPs**: the egress IP of the server calling the server-side APIs must be whitelisted, otherwise endpoints such as `gettoken` return `60020 not allow to access from your ip`.

### 2.4 Configure Message Receiving (Callback, for Card-Button Approval)

To support "tap Approve/Reject directly on the message card" (without opening a page), configure a callback:

```
App Management → Self-built App → Receive Messages → Set API Receiving
  URL:             https://attendance.yourcompany.com/api/wecom/callback/message
  Token:           custom (used for signature verification)
  EncodingAESKey:  randomly generated (used for AES encryption/decryption of the message body)
```

If you only need to-do jumps without in-card interaction, this can wait, but we recommend configuring it from the start (it is used in Chapter 7).

### 2.5 Local Development Environment

The core difficulty of local H5 development: the OAuth callback and JS-SDK require a trusted domain + HTTPS, while locally you have `http://localhost`. Two common approaches exist.

**Option 1: Intranet penetration (recommended; closest to the real environment)**

```bash
# Use frp or ngrok to map local 8080 / frontend port to a sub-path of the filed domain
# e.g. map to https://dev-attendance.yourcompany.com
frpc -c frpc.ini

# Let the Angular dev server accept the host domain (angular.json)
# serve options: host = 0.0.0.0, default port 4200
# angular.json -> projects/<name>.architect.serve.options
{ "host": "0.0.0.0", "port": 4200 }
# or from the command line: ng serve --host 0.0.0.0 --port 4200
```

Add the penetration domain to the admin console's trusted domains (during development) and place the verification file in your local static directory to pass verification.

**Option 2: hosts + mkcert (no public network needed; good for pure page joint debugging)**

```bash
mkcert -install
mkcert attendance.yourcompany.com        # generate a locally trusted certificate
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

> Note: the hosts approach only fools the browser's certificate check. WeCom's OAuth authorization still goes to the real WeCom servers and then redirects back, and during real-device debugging the phone cannot use your computer's hosts. So **real-device debugging must use an intranet-penetration domain**.

**Starting the backend locally**:

```bash
cd ~/work/code/attendance-backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

## 3. Integrating the H5 Frontend Project

### 3.1 Directory Structure (Reuse the Existing Angular Project; Add a Mobile Module)

No new project is needed. In the existing Angular + TypeScript project, add a lazy-loaded mobile module (feature module / routes) and a WeCom adaptation layer:

```
attendance-web/
├── src/
│   ├── main.ts
│   ├── index.html                   # jweixin can also be <script>-included here
│   ├── app/
│   │   ├── app.routes.ts            # root routes (PC/mobile split)
│   │   ├── mobile/                  # in-WeCom H5 mobile app (lazy-loaded module)
│   │   │   ├── mobile.routes.ts     # mobile child routes
│   │   │   ├── guards/
│   │   │   │   └── wecom-auth.guard.ts   # silent-login route guard (CanActivate)
│   │   │   └── pages/
│   │   │       ├── checkin/checkin.component.ts      # check-in home
│   │   │       ├── records/records.component.ts      # check-in records
│   │   │       ├── todo/todo-list.component.ts       # approval to-dos (Activiti tasks)
│   │   │       ├── todo/approval-detail.component.ts # approval detail (countersign/or-sign progress)
│   │   │       ├── apply/makeup-apply.component.ts   # make-up check-in request (triggers process)
│   │   │       └── oauth/oauth-callback.component.ts # OAuth callback landing page
│   │   ├── core/
│   │   │   ├── interceptors/
│   │   │   │   └── auth.interceptor.ts   # HttpClient interceptor (injects JWT, re-login on 401)
│   │   │   └── services/            # existing business services, reused
│   │   │       ├── checkin.service.ts
│   │   │       └── approval.service.ts
│   │   └── wecom/                   # WeCom adaptation layer (the core addition here)
│   │       ├── env.service.ts       # in-WeCom detection, UA checks
│   │       ├── oauth.service.ts     # OAuth2 silent-login redirect logic
│   │       ├── jssdk.service.ts     # wx.config / agentConfig / signatures
│   │       └── device.service.ts    # geolocation, camera, scan wrappers
├── public/ (or src/)
│   └── WW_verify_xxxx.txt           # domain-ownership verification file (at static root)
└── angular.json
```

### 3.2 Import the WeCom JS-SDK

WeCom H5 uses the `jweixin` module (it shares its origin with the WeChat Official Account JSSDK; WeCom extends it with `wx.agentConfig` and enterprise-specific APIs):

```bash
npm install weixin-js-sdk --save
# or include it directly in index.html
# <script src="https://res.wx.qq.com/open/js/jweixin-1.2.0.js"></script>
```

```typescript
// src/app/wecom/env.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WecomEnvService {
  /** Whether we are currently running inside the WeCom client */
  isInWecom(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    // The WeCom UA contains both wxwork and micromessenger
    return /wxwork/.test(ua) && /micromessenger/.test(ua);
  }

  /** Whether this is iOS (JS-SDK signature URL handling differs; see Chapter 5) */
  isIOS(): boolean {
    return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  }
}
```

### 3.3 Routing and the Silent-Login Guard

All mobile business routes sit behind one `CanActivate` guard: without a system token it initiates the OAuth silent login, then returns to the original page after success. This is the master switch for "open the app and you're logged in automatically"; Chapter 4 covers it in detail.

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
  // OAuth callback landing page: no guard
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

  // Core: ensure logged in; if not, redirectToWecomAuth triggers a full-page redirect to OAuth
  if (oauth.hasToken()) {
    return true;
  }
  oauth.redirectToWecomAuth(state.url);     // leaves the current page
  return new Promise<boolean>(() => false); // block this navigation and wait for the full-page redirect
};
```

Lazily load the whole mobile module under the `mobile` path in the root routes:

```typescript
// src/app/app.routes.ts
export const APP_ROUTES: Routes = [
  {
    path: 'mobile',
    loadChildren: () => import('./mobile/mobile.routes').then(m => m.MOBILE_ROUTES),
  },
  // ...PC admin routes
];
```
## 4. The Complete OAuth2 Silent Automatic Login (SSO) Chain

This is the heart of the whole integration. Target behavior: an employee taps the app icon in WeCom (or taps an approval message card), and while the page opens **there is no login page and no confirmation button at all**; after a second or two they land directly on the business page, and the backend already knows "which person in the system this is."

### 4.1 Choosing the Authorization Mode: snsapi_base

WeCom web authorization supports two scopes:

| scope | Confirmation prompt | What you get | When to use |
|-------|---------------------|--------------|-------------|
| `snsapi_base` | **Silent, no popup whatsoever** | Only the member's userid (exchanged by the backend) | Automatic login for internal enterprise apps — **used in this article** |
| `snsapi_privateinfo` | Requires manual user confirmation | userid + sensitive info (phone/email, etc., requiring member authorization) | The rare scenario where extra privacy fields must be collected |

For an internal self-built app whose visibility scope already covers the users, `snsapi_base` is completely silent inside the WeCom client — this is precisely the basis for automatic login. We don't need phone numbers or emails at this step (they can be queried by userid through the server-side Contacts API), so we always use `snsapi_base`.

### 4.2 End-to-End Sequence

```
WeCom client       H5 frontend (WebView)    Business backend        WeCom server
    │                   │                     │                     │
    │ Open app home     │                     │                     │
    │──────────────────▶│                     │                     │
    │                   │ Guard: no token     │                     │
    │                   │ 302 to authorize URL│                     │
    │◀──────────────────│                     │                     │
    │ Silent auth (seamless)                  │                     │
    │───────────────────────────────────────▶│                     │
    │ 302 back to callback?code=xxx&state=yyy│                     │
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
    │                   │                     │ userid→find/create  │
    │                   │                     │  system account;    │
    │                   │                     │  issue JWT          │
    │                   │◀────────────────────│                     │
    │                   │ Store token, jump   │                     │
    │                   │ back to target;     │                     │
    │                   │ later requests      │                     │
    │                   │ carry JWT           │                     │
```

Two key points:

1. **The code is exchanged only on the backend**: the frontend never calls WeCom APIs directly (that would expose the secret). The frontend is only responsible for "guiding the redirect" and "handing the code on the redirect URL to the backend."
2. **The authorization URL can be built on either the frontend or the backend**, but the `state`-based CSRF protection and the "return to the original page after login" logic must be handled by you.

### 4.3 Step 1: Build the Authorization URL and Redirect

Authorization URL format:

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

| Parameter | Description |
|------|------|
| `appid` | The enterprise corpid (note: although it is called appid, you fill in the corpid) |
| `redirect_uri` | The redirect address after authorization; URL-encoded; must be under a trusted domain |
| `response_type` | Fixed to `code` |
| `scope` | `snsapi_base` |
| `agentid` | The self-built app's agentid (**required**; on some versions the app identity cannot be obtained without it) |
| `state` | Custom parameter, returned by WeCom unchanged; used for CSRF protection + carrying the post-login target path |
| `#wechat_redirect` | Fixed suffix; must end the URL as a hash |

The frontend wraps this in an injectable `WecomOAuthService` (`src/app/wecom/oauth.service.ts`):

```typescript
import { Injectable, inject } from '@angular/core';
import { WecomEnvService } from './env.service';

@Injectable({ providedIn: 'root' })
export class WecomOAuthService {
  private readonly env = inject(WecomEnvService);

  private readonly CORP_ID = 'ww your_corpid';        // corpid is not highly sensitive; it can live in the frontend
  private readonly AGENT_ID = '1000002';              // agentid is also public
  private readonly CALLBACK =
    'https://attendance.yourcompany.com/mobile/oauth/callback';

  hasToken(): boolean {
    return !!localStorage.getItem('sys_token');
  }

  /** Generate a random state, and stash "the page to visit after login" in sessionStorage */
  private buildState(redirectPath: string): string {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(`wx_state_${nonce}`, redirectPath || '/mobile/checkin');
    sessionStorage.setItem('wx_state_nonce', nonce);   // verified on callback
    return nonce;
  }

  /** Start silent login: full-page redirect to the WeCom authorization URL */
  redirectToWecomAuth(redirectPath: string): void {
    if (!this.env.isInWecom()) {
      // Outside WeCom (e.g. opened directly in a PC browser): go to the system username/password login page
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

The route guard only needs to call `hasToken()` to check, and `redirectToWecomAuth()` if not logged in (see `WecomAuthGuard` in 3.3).

> corpid and agentid are "public identifiers" (the authorization URL appears in plaintext in the browser anyway), so keeping them in the frontend is fine. The only real secret is `secret`, which always stays on the server.

### 4.4 Step 2: The Callback Landing Page Exchanges the Code for a Token

After redirecting back to `/mobile/oauth/callback?code=xxx&state=yyy`, the callback page does three things: verify state → send the code to the backend → jump back to the original target page after receiving the JWT.

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

  protected errMsg = signal('Signing in...');

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code') ?? '';
    const state = this.route.snapshot.queryParamMap.get('state') ?? '';

    if (!code) { this.errMsg.set('Authorization failed: missing code'); return; }

    // 1. Verify state against CSRF: it must be a nonce we stored before redirecting
    const savedNonce = sessionStorage.getItem('wx_state_nonce');
    if (!state || state !== savedNonce) {
      this.errMsg.set('Login state verification failed, please re-enter the app');
      return;
    }
    const redirectPath = sessionStorage.getItem(`wx_state_${state}`) || '/mobile/checkin';

    try {
      // 2. Hand the code to the backend in exchange for a system JWT
      const { token } = await firstValueFrom(this.auth.loginByWecomCode(code));
      localStorage.setItem('sys_token', token);
      sessionStorage.removeItem(`wx_state_${state}`);
      sessionStorage.removeItem('wx_state_nonce');
      // 3. Return to the originally intended page (possibly a specific approval to-do detail)
      this.router.navigateByUrl(redirectPath, { replaceUrl: true });
    } catch (e: any) {
      this.errMsg.set('Automatic login failed: ' + (e?.message || 'please try again'));
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

  /** Exchange code for JWT: one of the few endpoints that does not require a token (whitelisted in the interceptor) */
  loginByWecomCode(code: string): Observable<WecomLoginResp> {
    return this.http
      .post<{ code: number; message: string; data: WecomLoginResp }>(
        '/api/auth/wecom/login', { code })
      // Unwrap the backend's uniform response envelope { code, message, data } (error-code handling can be centralized in an interceptor)
      .pipe(map((resp) => resp.data));
  }
}
```

### 4.5 Step 3: The Backend Exchanges the Code for a userid (Core of Authentication)

After receiving the code, the backend must first obtain an access_token, then call two endpoints:

- `auth/getuserinfo`: code → userid (internal enterprise member) or openid (non-member / external contact)
- After obtaining the userid, if needed use `user/get` (Contacts) to fill in name, department, and mobile number

**Endpoint 1: obtain the access credential**

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

Returns an `access_token` (valid for 7200 seconds). The access_token must be centrally managed (Redis cache + distributed lock; see Chapter 8); neither the frontend nor other services fetch it themselves.

**Endpoint 2: exchange code for userid**

```
GET https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=TOKEN&code=CODE
```

For an internal enterprise member it returns:

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "userid": "zhangsan",
  "user_ticket": "xxx"
}
```

> If it returns an `openid` without a `userid`, the current user is not within the enterprise app's visibility scope (possibly an external contact). You should reject the login and prompt them to contact an administrator for access, rather than auto-creating an account.

**Login Controller**:

```java
/**
 * WeCom H5 silent login
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
     * H5 OAuth silent login: exchange code for userid, bind the system account, then issue a JWT
     */
    @PostMapping("/login")
    public Result<WecomLoginVO> login(@RequestBody @Valid WecomLoginDTO dto) {
        log.info("WeCom H5 silent login, code={}", dto.getCode());
        WecomLoginVO vo = wecomAuthService.loginByCode(dto.getCode());
        return Result.success(vo);
    }
}
```

```java
/**
 * WeCom silent-login Service
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
        // 1. Exchange code for userid
        String accessToken = tokenManager.getAccessToken();
        String url = String.format(
                "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=%s&code=%s",
                accessToken, code);

        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_AUTH_FAILED,
                    "Failed to obtain WeCom identity: " + (resp == null ? "null" : resp.getString("errmsg")));
        }

        String wecomUserId = resp.getString("userid");
        if (StrUtil.isBlank(wecomUserId)) {
            // Only openid: not an internal enterprise member, outside the app's visibility scope
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE,
                    "This account is outside the app's authorization scope; please contact an administrator");
        }

        // 2. Map userid to a system account (key; see 4.6)
        SysUser user = userService.getOrBindByWecomUserId(wecomUserId);
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "Account has been disabled");
        }

        // 3. Issue the system's own JWT, reusing the existing authentication system
        String jwt = jwtTokenProvider.generateToken(user.getId(), user.getUsername());
        return WecomLoginVO.builder()
                .token(jwt)
                .userInfo(UserInfoVO.of(user))
                .build();
    }
}
```

### 4.6 Step 4: Bind WeCom Accounts to System Accounts (The Most Critical Design for an Existing System)

This is the biggest difference between "an existing business system" and "building a system from scratch": the system already has a set of accounts (users may log in with employee number, email, or domain account), and everything that arrives from WeCom is a single userid. **You cannot simply "create a new user from the userid"** — otherwise the same person becomes two accounts, and attendance records and Activiti to-dos all fail to line up.

Three binding strategies are recommended; choose according to the enterprise's reality:

**Strategy A: Employee number/account is consistent — automatic binding (most recommended, zero ops)**

The "account" field in the WeCom Contacts is usually the enterprise's unified employee number, and the WeCom userid often uses the employee number too. Agree that userid = system username (or employee number), and associate directly by account at login:

```java
/**
 * Bind a system account by WeCom userid
 * Convention: WeCom userid equals the system employee number (username)
 */
public SysUser getOrBindByWecomUserId(String wecomUserId) {
    // 1. First look up by the already-bound wecom_user_id
    SysUser user = userMapper.findByWecomUserId(wecomUserId);
    if (user != null) {
        return user;
    }

    // 2. Not bound: try to auto-match an existing account by employee number (username)
    user = userMapper.findByUsername(wecomUserId);
    if (user != null) {
        // Establish the binding; next time it hits directly
        user.setWecomUserId(wecomUserId);
        userMapper.updateById(user);
        log.info("System account {} auto-bound to WeCom userid {}", user.getUsername(), wecomUserId);
        return user;
    }

    // 3. Still no match: do not silently create an account. Return a needs-binding state, handled by an admin or self-service binding flow
    throw new BusinessException(ErrorCode.WECOM_ACCOUNT_NOT_BOUND,
            "No system account associated with this WeCom account was found; please contact an administrator to bind");
}
```

**Strategy B: Self-service binding (when account systems are not unified)**

If automatic matching fails on first login, have the user enter their system account password once to complete binding; afterward the mapping between wecom_user_id and user_id is persisted and login is permanently silent:

```
First WeCom login → backend finds no mapping → returns NEED_BIND state
  → H5 shows a binding page (enter system account/password, or employee number + SMS code)
  → backend verifies → writes sys_user.wecom_user_id → issues JWT
```

The binding is established only once; credentials are discarded immediately after verification, and no plaintext password is stored.

**Strategy C: Admin pre-binding / Contacts sync**

Use the Contacts API (`user/list`) to batch-sync by department, aligning WeCom userids with system accounts by employee number (the sync approach is in Chapter 8). Suitable for a one-time initialization before launch.

**User table change** (add a column to the existing user table without touching its existing structure):

```sql
ALTER TABLE sys_user ADD COLUMN wecom_user_id VARCHAR(64);
COMMENT ON COLUMN sys_user.wecom_user_id IS 'WeCom userid (external identity)';
CREATE UNIQUE INDEX uk_sys_user_wecom ON sys_user (wecom_user_id) WHERE wecom_user_id IS NOT NULL;
```

> Design point: **the internal userId stays unchanged**. Attendance-record foreign keys, Activiti's `ACT_RU_TASK.ASSIGNEE_`, and candidate groups all continue to use the internal system userId (username). The WeCom userid is used only for "recognizing the person at login" and "addressing them at push time," decoupled through the `sys_user.wecom_user_id` mapping layer. This neither pollutes workflow definitions nor removes the ability to coexist with PC username/password and other SSO login methods.

### 4.7 Step 5: Seamlessly Connect JWT with the Existing Authentication System

After silent login obtains the userid, subsequent requests work exactly as on PC: they all go through the system's existing JWT/Session authentication. Thus attendance and approval APIs need zero changes.

The frontend uses an Angular `HttpInterceptor` to inject the token uniformly and re-run silent login on 401:

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
        // Token expired: re-run silent login inside WeCom (seamless); in external environments jump to the login page
        localStorage.removeItem('sys_token');
        const env = inject(WecomEnvService);
        if (env.isInWecom()) {
          location.reload();   // the route guard automatically initiates OAuth again
        } else {
          location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
        }
      }
      return throwError(() => error);
    }),
  );
};
```

Register it in `app.config.ts` (functional interceptors, Angular 15+):

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

> The silent-login endpoint `/api/auth/wecom/login` carries no token itself; the interceptor passes requests through unchanged when there is no token in local storage, so no special check is needed — re-login is triggered only on 401.

The backend keeps the existing Spring Security configuration (SecurityFilterChain Bean style) and only permits the WeCom login endpoint and callback endpoint:

```java
/**
 * Spring Security configuration
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
                        "/api/auth/wecom/**",      // WeCom silent login
                        "/api/wecom/callback/**"   // WeCom callback
                ).permitAll()
                .anyRequest().authenticated()
            )
            // Frontend-backend separation + JWT: stateless, CSRF disabled, JWT filter parses the token
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter(),
                    UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
    // JwtAuthenticationFilter: parses the Authorization header and writes the SecurityContext; reuse the existing implementation
}
```

> If your project still uses Spring Security 5.x's `WebSecurityConfigurerAdapter`, the equivalent is to override `configure(HttpSecurity)`, call `permitAll()` on the same two paths and `csrf().disable()`; the JWT issued by silent login is verified uniformly by the existing JWT filter, fully shared with username/password login.

At this point the chain "open the app → automatic login → see your own attendance and to-dos directly" is fully connected, and **none of the existing attendance and Activiti APIs, permissions, or data changed by a single line**.
## 5. JS-SDK: Geolocation, Camera, and Scan in H5

Attendance cannot do without geolocation, camera, and scan. Unlike a Mini Program, H5 cannot call native APIs directly; it must go through the WeCom JS-SDK after signature-based authorization. This chapter gives a signature scheme that can be put into practice directly, focusing on the iOS/Android signature-URL difference that trips people up most often.

### 5.1 wx.config and wx.agentConfig

The WeCom JS-SDK has two layers of configuration, which beginners most often confuse:

| Configuration | Purpose | Signature ticket |
|------|------|----------|
| `wx.config` | Inject basic configuration; invoke common capabilities (sharing, `getLocation`, `scanQRCode`, choose image, and most other interfaces) | Signed with `jsapi_ticket` |
| `wx.agentConfig` | Inject the current **self-built app** identity; invoke WeCom-specific interfaces (e.g., `selectEnterpriseContact` contact picker, some approval-related interfaces) | Signed with `get_jsapi_ticket` (enterprise app ticket) |

For check-in geolocation/camera/scan, passing `wx.config` is enough; only enterprise-specific capabilities such as the "select approver/CC recipient by organization chart" contact picker require `agentConfig` in addition.

### 5.2 Backend: jsapi_ticket Management and Signing

The `jsapi_ticket` is exchanged with an access_token, is valid for 7200 seconds, and likewise needs centralized caching:

```
GET https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=TOKEN
```

The ticket endpoint for enterprise-app agentConfig is `ticket/get?type=agent_config`.

Signature algorithm (as specified by WeCom):

```
string1 = jsapi_ticket={ticket}&noncestr={nonce}&timestamp={timestamp}&url={current page URL}
signature = SHA1(string1)
```

```java
/**
 * JS-SDK signature Service
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

    /** Get jsapi_ticket (cached; same logic as access_token; distributed lock omitted, see 8.1) */
    public String getJsapiTicket() {
        String cached = redisTemplate.opsForValue().get(JSAPI_TICKET_KEY);
        if (StrUtil.isNotBlank(cached)) {
            return cached;
        }
        String token = tokenManager.getAccessToken();
        String url = "https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=" + token;
        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR, "Failed to obtain jsapi_ticket");
        }
        String ticket = resp.getString("ticket");
        redisTemplate.opsForValue().set(JSAPI_TICKET_KEY, ticket, 7100, TimeUnit.SECONDS);
        return ticket;
    }

    /**
     * Build the signature required by wx.config
     * @param pageUrl the page URL sent from the frontend for signing (see 5.3 for the iOS special case)
     */
    public WxConfigSignatureVO buildConfigSignature(String pageUrl) {
        String ticket = getJsapiTicket();
        String nonceStr = IdUtil.fastSimpleUUID();
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);

        // Note: the signed url must exactly match the frontend's location.href (including hash handling rules; see below)
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

    /** After the frontend enters a page, exchange the current URL for a signature */
    @GetMapping("/config")
    public Result<WxConfigSignatureVO> config(@RequestParam("url") String url) {
        return Result.success(jsapiService.buildConfigSignature(url));
    }
}
```

### 5.3 Frontend: Signature Initialization (Handling the iOS Entry-Page Problem)

The most classic JS-SDK pitfall: **Android signs with the current page URL, while iOS (WKWebView) signs with the URL of the entry page when the app was first opened**. In an SPA, client-side route changes never truly refresh the page; on iOS, if you sign with "the current route's href," then as long as it isn't the first landing page, `wx.config` will inevitably report `invalid signature`.

The unified solution: **record the first URL on the entry page and use it for all subsequent signatures (iOS); Android always uses the current URL.**

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

  /** Get the URL used for signing: strip the #hash (per WeCom signing rules the url excludes the hash) */
  private signableUrl(href: string): string {
    const idx = href.indexOf('#');
    return idx >= 0 ? href.slice(0, idx) : href;
  }

  /** Record the entry-page URL (only needed on iOS; call once at app startup, before any route navigation) */
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
    return this.signableUrl(location.href);   // Android uses the current page
  }

  /** Ensure wx.config is done (globally once only; reusable within the SPA) */
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
          beta: true,                 // required! WeCom-specific interfaces need beta:true
          debug: false,
          appId: cfg.corpId,
          agentId: cfg.agentId,
          timeStamp: cfg.timestamp,
          nonceStr: cfg.nonceStr,
          signature: cfg.signature,
          jsApiList: ['getLocation', 'chooseImage', 'scanQRCode'],
        });
        wx.ready(() => resolve());
        wx.error((res: any) => reject(new Error('wx.config failed: ' + res.errMsg)));
      });
    })();

    return this.configPromise;
  }
}
```

At app startup (before the first route navigation), record the iOS entry URL as early as possible; `APP_INITIALIZER` works well:

```typescript
// Register startup initialization in src/app/app.config.ts
import { APP_INITIALIZER } from '@angular/core';

function recordWxEntryUrl() {
  const jssdk = inject(WecomJssdkService);
  const env = inject(WecomEnvService);
  return () => {
    // Trigger ensureWxConfig's entry-recording logic once (on iOS it fixes the landing-page URL before the first navigation)
    if (env.isInWecom()) {
      // Pre-warm wx.config; non-blocking is fine — the service itself falls back when geolocation/scan is actually called
      jssdk.ensureWxConfig().catch(() => void 0);
    }
  };
}

// Add to providers:
// { provide: APP_INITIALIZER, useFactory: recordWxEntryUrl, multi: true }
```

> The key point is that on iOS the entry URL must be captured from `location.href` before any client-side route navigation happens. Putting it in `APP_INITIALIZER` (which runs before Angular routing starts) is the most reliable approach; even if you don't pre-warm the signature, at minimum write the entry URL to sessionStorage in this hook.

> Routing-mode recommendation: to reduce the mental burden of hashes and signatures, the mobile H5 app can use **history mode**; if you use hash mode, be sure to truncate at `#` via `signableUrl` above, ensuring the URLs signed by frontend and backend match exactly — both using `encodeURIComponent`, or neither, consistently.

### 5.4 Geolocation Check-in

```typescript
// src/app/wecom/device.service.ts
import { Injectable, inject } from '@angular/core';
import wx from 'weixin-js-sdk';
import { WecomJssdkService } from './jssdk.service';

export interface LngLat { longitude: number; latitude: number; accuracy: number; }

@Injectable({ providedIn: 'root' })
export class WecomDeviceService {
  private jssdk = inject(WecomJssdkService);

  /** JS-SDK geolocation (gcj02 "Mars coordinates", consistent with maps in mainland China) */
  getLocation(): Promise<LngLat> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res: any) => resolve({
          longitude: res.longitude,
          latitude: res.latitude,
          accuracy: res.accuracy,
        }),
        fail: (err: any) => reject(new Error('Location failed, please check location permission: ' + err.errMsg)),
      });
    }));
  }

  /** Invoke the camera (camera only, no album — anti-cheating); returns a localId */
  takePhoto(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera'],
        sizeType: ['compressed'],
        success: (res: any) => resolve(res.localIds[0]),
        fail: (err: any) => reject(new Error('Photo capture failed: ' + err.errMsg)),
      });
    }));
  }

  /** Scan (check-in via desk/meeting-room QR codes) */
  scanQRCode(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.scanQRCode({
        needResult: 1,              // 1 = frontend receives the result and handles it
        scanType: ['qrCode'],
        success: (res: any) => resolve(res.resultStr),
        fail: (err: any) => reject(new Error('Scan failed: ' + err.errMsg)),
      });
    }));
  }
}

/** Haversine distance (meters); a pure function that can live in shared utils */
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

Called by the check-in component (`checkin.component.ts`); use the team's existing UI library for prompts (e.g. NG-ZORRO's `NzMessageService`):

```typescript
// src/app/mobile/pages/checkin/checkin.component.ts (excerpt)
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
      this.msg.error(`Outside the check-in area, ${Math.round(dist)} m from the office`);
      return;
    }
    await firstValueFrom(this.checkinApi.submit({
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      distance: Math.round(dist),
    }));
    this.msg.success('Check-in successful');
  }
}
```

The backend check-in API is identical to the system's existing implementation (secondary distance validation, duplicate check-in prevention, persistence, push notifications). This logic already exists; H5 is just a new caller. The backend **must re-validate the distance** and must not trust the latitude/longitude sent by the frontend (frontend coordinates can be tampered with via packet capture).

### 5.5 Photo Check-in and QR Code Check-in

Photo and QR code scanning are already wrapped in the `WecomDeviceService` from 5.4 (`takePhoto()` returns a localId, `scanQRCode()` returns the QR code content); the component can simply await them. The localId image from `takePhoto` needs an additional upload:

- `wx.uploadImage` first uploads the image to WeCom to obtain a `serverId`; the backend then calls WeCom's media API `media/get` to pull it back into the intranet — suitable when you don't want to upload files directly from H5;
- Or draw the localId onto a canvas to convert it to a Blob, then POST it directly to the existing file service using Angular's `FormData` + `HttpClient`, reusing the system's existing attachment storage.

With either approach, the backend reuses the existing photo storage and watermark (time + location + device info) logic. For QR code check-in, the backend validates the QR code token's validity and expiry time, and layers location validation on top as a double check — again reusing the existing API.

## 6. Implementing Complex Activiti Approval Flows on the WeCom Client

Attendance-related approvals (make-up check-in, leave, off-site work, overtime appeal, etc.) are already defined and running in Activiti. The WeCom client does not need to re-implement the processes — it only needs to do three things: **bring the to-do tasks out, wire the approval actions in, and actively push to-do tasks to WeCom**. This chapter explains how to reuse the engine with three typical node types: countersign, or-sign, and organization-chart-based approval.

### 6.1 Unify the Assignee Identity First

Activiti identifies a task assignee (`ACT_RU_TASK.ASSIGNEE_`) or candidate users/groups (`ACT_RU_IDENTITYLINK`) with a string. Make sure that: **the assignee identifier hard-coded in the process definition or computed at runtime matches `sys_user.username` (the internal account, i.e. the unique key bound to wecom_user_id)**.

We recommend using the employee number / username (e.g. `zhangsan`) as the unique person identifier across the whole system:

- Activiti assignee / candidateUser = `sys_user.username`
- WeCom mapping = `sys_user.wecom_user_id` (in many companies this is also the employee number, so the two may be identical, but they are logically separate)
- When pushing WeCom messages: `username → look up sys_user → take wecom_user_id` as `touser`

This way Activiti process definitions, UEL expressions, and candidate queries need no changes whatsoever for WeCom.

### 6.2 Expressing the Three Typical Node Types in Process Definitions

Using the "make-up check-in application" process as an example, here is how countersign, or-sign, and organization-chart-based approval are written in BPMN.

**Countersign (passes only when all members approve)** — use a multi-instance node (multiInstanceLoopCharacteristics) plus a completion condition:

```xml
<userTask id="countersignLeaderHr" name="Direct leader and HR countersign">
  <documentation>Everyone must approve; any rejection ends the task</documentation>
  <multiInstanceLoopCharacteristics isSequential="false"
                                   activiti:collection="${countersignUsers}"
                                   activiti:elementVariable="approver">
    <completionCondition>${approveResultList.size() == nrOfInstances
        &amp;&amp; !approveResultList.contains('REJECT')}</completionCondition>
  </multiInstanceLoopCharacteristics>
  <userTask><extensionElements/></userTask>
</userTask>
```

- `isSequential="false"`: parallel countersign — a task is generated for every person at the same time
- `nrOfInstances`: total number of countersigners; `approveResultList`: a process variable collecting each person's decision
- Completion condition: proceed only when everyone has handled it and there is no REJECT

**Or-sign (any one of several people can handle it)** — also a multi-instance node, but with the completion condition changed to "finish as soon as 1 is handled." The more common approach is candidate users (candidateUsers): one task visible to multiple people, and whoever claims it handles it:

```xml
<userTask id="orSignDuty" name="Duty team or-sign" activiti:candidateUsers="${dutyGroupUsers}">
  <documentation>Any member of the candidate group may claim and approve</documentation>
</userTask>
```

Or use multi-instance + `nrOfCompletedInstances >= 1` to give each person a separate to-do task, with the rest automatically canceled after one person handles it.

**Dynamic approval by organization chart** — the assignee is not hard-coded; it is computed in real time from the org chart by a process expression (applicant → direct department head → managing director):

```xml
<userTask id="deptLeaderApprove" name="Department head approval"
          activiti:assignee="${orgService.findLeader(applyUserId)}"/>
<userTask id="directorApprove" name="Managing director approval"
          activiti:assignee="${orgService.findDirector(applyUserId)}"/>
```

`orgService` is a Spring Bean registered in the Activiti expression context; internally it walks up the department tree to find the person in charge. After a department head transfers positions, new process instances are automatically routed according to the latest org chart — no process definition changes needed.

> This BPMN already runs on the PC client. The WeCom client merely adds a new "handling entry point"; underneath, the approval action still calls the same `taskService.complete()`, so countersign counting, or-sign claiming, organization routing, and gateway conditions are all guaranteed consistent by the engine. There is no problem of "the process on PC differs from the process on mobile."

### 6.3 To-do List and Details on the WeCom Client

**To-do list** — directly use Activiti's TaskQuery to query to-do tasks by the current logged-in user's username (with countersign each person has their own task; or-sign candidate tasks are queried with taskCandidateUser):

```java
/**
 * Mobile approval Service (reuses Activiti TaskService)
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

    /** Current user's to-dos (directly assigned + or-sign candidates, unclaimed) */
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
                .candidate(Objects.isNull(task.getAssignee()))  // or-sign, unclaimed
                .build();
    }
}
```

**Approval details** — display the form, countersign progress (who has approved, who is pending), and the approval-comment timeline:

```java
/** Countersign progress: aggregate each handler's status from historic tasks + current tasks */
public List<ApproverProgressVO> countersignProgress(String processInstanceId) {
    List<HistoricTaskInstance> done = historyService.createHistoricTaskInstanceQuery()
            .processInstanceId(processInstanceId)
            .finished()
            .list();
    List<Task> pending = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .list();
    // Merge: done items carry the approval comment (COMMENT); pending items are marked "pending approval"
    // Assembly omitted; returns [{user, userName, status: APPROVED/REJECTED/PENDING, comment, time}]
    return mergeProgress(done, pending);
}
```

The frontend `ApprovalDetailComponent` renders based on `nodeType`: countersign shows a multi-avatar progress bar (handled / pending); or-sign shows "Any member of the duty team can approve; tap to claim and handle."

### 6.4 Claiming (Or-sign) and Approval Actions

An or-sign candidate task must first be claimed so the user becomes the assignee before it can be handled; countersign tasks are directly assigned and skip the claim step.

```java
@Transactional(rollbackFor = Exception.class)
public void approve(String taskId, String username, boolean agree, String comment) {
    Task task = taskService.createTaskQuery().taskId(taskId).active().singleResult();
    if (task == null) {
        throw new BusinessException(ErrorCode.TASK_NOT_FOUND, "To-do task does not exist or has already been handled");
    }

    // Or-sign: candidate task must be claimed first
    if (task.getAssignee() == null) {
        boolean isCandidate = taskService.createTaskQuery()
                .taskId(taskId).taskCandidateUser(username).count() > 0;
        if (!isCandidate) {
            throw new BusinessException(ErrorCode.NO_PERMISSION, "You are not authorized to handle this task");
        }
        taskService.claim(taskId, username);
    } else if (!username.equals(task.getAssignee())) {
        throw new BusinessException(ErrorCode.NO_PERMISSION, "This task does not belong to you");
    }

    // Record the approval comment
    Authentication.setAuthenticatedUserId(username);
    taskService.addComment(taskId, task.getProcessInstanceId(),
            (agree ? "Approved: " : "Rejected: ") + comment);

    // Write process variables: the countersign completion condition depends on approveResultList
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

    // Post-approval handling: push the next node's to-do, link attendance data when the process ends (see 6.5, 6.6)
    afterTaskComplete(task.getProcessInstanceId(), agree);
}
```

The rejection strategy can follow company rules: reject back to the initiator (resubmit), reject to the previous node, or end the process outright. The make-up check-in scenario commonly uses "any rejection terminates + notify the initiator", which is exactly the semantics of `!contains('REJECT')` in the countersign completion condition.

### 6.5 Linking Approval with Attendance Data (Reusing Existing Capabilities)

When the process ends, attendance data is written back according to the business type. This logic already exists in the system, and WeCom-side approvals trigger the same `taskService.complete()`, so the linkage works out of the box. Typical handling for make-up check-in:

```java
public void afterProcessFinished(String processInstanceId) {
    // After the process ends, instance variables have been migrated to history tables;
    // read business variables from HistoricVariableInstance
    Map<String, Object> vars = historyService.createHistoricVariableInstanceQuery()
            .processInstanceId(processInstanceId)
            .list()
            .stream()
            .collect(Collectors.toMap(HistoricVariableInstance::getVariableName,
                    HistoricVariableInstance::getValue, (a, b) -> a));
    String bizType = String.valueOf(vars.get("bizType"));     // MAKEUP / LEAVE / OVERTIME
    Boolean approved = (Boolean) vars.get("approved");

    if (!Boolean.TRUE.equals(approved)) {
        notifyApplicant(processInstanceId, false);   // rejection notification
        return;
    }

    switch (bizType) {
        case "MAKEUP":
            // Make-up check-in approved: correct / retroactively add the check-in record for the date (existing attendance Service)
            attendanceService.applyMakeupCard(
                (Long) vars.get("recordId"),
                (String) vars.get("makeupTime"),
                String.valueOf(vars.get("reason")));
            break;
        case "LEAVE":
            // Leave approved: write leave record, deduct leave balance
            leaveService.grantLeave(vars);
            break;
        default:
            break;
    }
    notifyApplicant(processInstanceId, true);
}
```

Listening for the Activiti process-completed event is more robust than manually calling this from every approval API (completion from any entry point — PC, WeCom, or scheduled task — will reach it):

```java
import org.activiti.engine.delegate.event.ActivitiEntityEvent;
import org.activiti.engine.delegate.event.ActivitiEvent;
import org.activiti.engine.delegate.event.ActivitiEventListener;
import org.activiti.engine.delegate.event.ActivitiEventType;

/**
 * Activiti process-completion listener: links attendance data after final approval
 * Register via RuntimeService.addEventListener(...) or ProcessEngineConfiguration
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
        return false;   // listener exceptions must not affect the process itself
    }
}
```

### 6.6 Actively Pushing To-do Tasks to WeCom

An H5 to-do list alone is not enough — employees will not open it proactively to refresh. When process flow generates a new to-do task, the backend should actively push an "approval card" to the next handler's WeCom. Tapping the card opens the corresponding H5 approval detail page directly, and thanks to the silent login from chapter 4, the user is already logged in when it opens.

Trigger the push in a task-creation listener (Activiti event listener):

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

        // Directly assigned (countersign gives each person a task) -> push to the assignee
        if (StrUtil.isNotBlank(task.getAssignee())) {
            pushToUser(task, task.getAssignee());
        } else {
            // Or-sign candidate task -> push to all candidate users / members expanded from candidate groups;
            // first to claim after entering handles it
            for (IdentityLink link : taskService.getIdentityLinksForTask(task.getId())) {
                if (StrUtil.isNotBlank(link.getUserId())) {
                    pushToUser(task, link.getUserId());
                } else if (StrUtil.isNotBlank(link.getGroupId())) {
                    // Candidate group: look up member usernames by group and push to each (implementation omitted)
                    userMapper.findUsernamesByGroup(link.getGroupId())
                            .forEach(username -> pushToUser(task, username));
                }
            }
        }
    }

    private void pushToUser(TaskEntity task, String username) {
        SysUser u = userMapper.findByUsername(username);
        if (u == null || StrUtil.isBlank(u.getWecomUserId())) {
            log.warn("User {} has not bound WeCom; skipping to-do push", username);
            return;
        }
        wecomMessageService.sendApprovalTodoCard(u.getWecomUserId(), task);
    }

    @Override
    public boolean isFailOnException() {
        return false;   // push failure must not roll back Activiti task creation
    }
}
```

A text card message (tap to jump straight to the H5 approval page):

```json
{
  "touser": "wangwu",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "Pending approval: Li Si's make-up check-in request",
    "description": "Node: Direct leader approval<br/>Make-up date: 2026-09-08 morning<br/>Reason: Forgot to check in at the off-site client site",
    "url": "https://attendance.yourcompany.com/mobile/approval/123456",
    "btntxt": "Approve now"
  }
}
```

Key point: **the card URL points directly to the approval detail page**. The employee taps it → no token → chapter 4's OAuth silent login → after the callback, the redirect-back path carried in `state` (see redirectPath in 4.3) returns to this approval detail. To achieve this, simply include the login parameters WeCom expects in the message card link, or have the frontend guard enforce login for all `/mobile/**` routes — no special handling is required.

**Template card button callbacks (advanced: approve/reject without opening the page)**

If you want approvers to tap "Approve/Reject" directly in the message notification, use `template_card` (button_interaction) plus the callback reception from chapter 6. After the backend receives the button event, it calls `mobileApprovalService.approve()` directly and then updates the card status. This suits nodes where the approval action is extremely simple (one-tap approve); for cases involving comments or viewing countersign details, jumping to H5 is still recommended. Both approaches call the exact same approval method underneath.

### 6.7 Organization Sync: Ensuring Dynamic Approvers Can Be Reached

The handler dynamically computed by "organization-chart-based approval" is a username; when pushing, its wecom_user_id must be findable. There are two ways to guarantee this:

1. **Incremental contact-book callback sync** (recommended, real-time): subscribe to `change_contact` events (member create/update/delete, department changes) and update `sys_user`'s wecom_user_id and department membership in real time.
2. **Scheduled full sync**: call the contact-book department/member APIs for a full alignment once every night as a safety net.

```
GET /cgi-bin/department/list?id=0            # department tree
GET /cgi-bin/user/list?department_id=1&fetch_child=1   # department member details
```

Align by employee number (username) during sync, write the WeCom userid back to `sys_user.wecom_user_id`, and sync department relationships for use by `orgService.findLeader()` org routing and push addressing. The contact-book read APIs have daily call limits (see 9.4), so be sure to use "incremental callbacks as primary + one daily full sync as fallback" — do not poll at high frequency.

## 7. Message Push and Event Callbacks

### 7.1 access_token and Sending Messages

App messages are sent uniformly by the server, via:

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

Common message types:

- `text`: plain text such as attendance reminders
- `textcard`: title + description + button, tap to jump to H5 (first choice for approval to-dos)
- `template_card`: interactive buttons allowing direct action within the notification (paired with callbacks)
- `markdown`: rich text such as approval summaries (supported inside WeCom)

Push service wrapper (`duplicate_check_interval` prevents duplicate pushes within a short window):

```java
@Service
@Slf4j
public class WecomMessageService {

    @Resource private WecomTokenManager tokenManager;
    @Resource private RestTemplate restTemplate;
    @Value("${wecom.agentid}") private Integer agentId;

    /** Send an approval to-do card; tapping it opens the H5 approval detail */
    public void sendApprovalTodoCard(String wecomUserId, Task task) {
        Map<String, Object> card = new HashMap<>();
        card.put("title", "Pending approval: " + task.getName());
        card.put("description", "A new approval to-do is waiting for you");
        card.put("btntxt", "Approve now");
        card.put("url", "https://attendance.yourcompany.com/mobile/approval/" + task.getId());

        Map<String, Object> msg = new HashMap<>();
        msg.put("touser", wecomUserId);
        msg.put("msgtype", "textcard");
        msg.put("agentid", agentId);
        msg.put("textcard", card);
        msg.put("duplicate_check_interval", 1800);

        send(msg);
    }

    public void send(String msg) { /* post to message/send, log invaliduser/errcode */ }
}
```

> The `invaliduser`/`invalidparty` fields in the response body must be logged: they indicate that someone in the push target has not bound the app or is outside the visible scope, and are the first clue when troubleshooting "why doesn't someone receive to-do notifications".

### 7.2 Callback Signature Verification and Encryption/Decryption

After "receive messages" is configured, WeCom sends two kinds of requests to the callback URL:

- **GET**: URL validity verification when saving the configuration; decrypt the `echostr` and return it verbatim
- **POST**: formal event pushes (template card buttons, contact-book changes) as encrypted XML; verify the signature and AES-decrypt

```java
@RestController
@RequestMapping("/api/wecom/callback")
@Slf4j
public class WecomCallbackController {

    @Resource private WecomCallbackService callbackService;

    /** URL verification */
    @GetMapping("/message")
    public String verify(@RequestParam("msg_signature") String signature,
                         @RequestParam String timestamp,
                         @RequestParam String nonce,
                         @RequestParam String echostr) {
        try {
            return callbackService.verifyUrl(signature, timestamp, nonce, echostr);
        } catch (Exception e) {
            log.error("WeCom callback URL verification failed", e);
            return "";
        }
    }

    /** Event reception: always return success quickly; do time-consuming work asynchronously to avoid WeCom retries */
    @PostMapping(value = "/message", produces = "application/xml")
    public String receive(@RequestParam("msg_signature") String signature,
                          @RequestParam String timestamp,
                          @RequestParam String nonce,
                          @RequestBody String encryptedBody) {
        try {
            callbackService.handleAsync(signature, timestamp, nonce, encryptedBody);
        } catch (Exception e) {
            log.error("WeCom callback handling failed", e);
        }
        return "success";   // Return success regardless of business outcome, to prevent WeCom's exponential-backoff retries
    }
}
```

Do not implement the crypto yourself — use the official `aes-256` sample code package (WeCom officially provides the Java `WXBizMsgCrypt`), which encapsulates: SHA1 signature verification, AES-256-CBC decryption, corpId verification, and XML assembly. The three parameters `Token`, `EncodingAESKey`, and `corpid` come from the backend callback configuration.

### 7.3 Handling Template Card Buttons and Contact-Book Events

```java
@Service
@Slf4j
public class WecomCallbackService {

    @Resource private MobileApprovalService approvalService;
    @Resource private ContactSyncService contactSyncService;
    @Resource private WXBizMsgCrypt crypt;   // official crypto class

    /** After decryption, dispatch by event type */
    public void handle(String sig, String ts, String nonce, String body) throws Exception {
        String xml = crypt.DecryptMsg(sig, ts, nonce, body);
        // Parse XML with XStream/Digester; extract Event / ChangeType / TaskId / EventKey / FromUserName
        CallbackEvent event = CallbackEvent.parse(xml);

        switch (event.getEvent()) {
            case "template_card_event":
                // Template card button: EventKey is the button key, FromUserName is the clicker's userid
                onCardButton(event);
                break;
            case "change_contact":
                contactSyncService.handleChange(event.getChangeType(), event.getUserId());
                break;
            default:
                log.info("Unhandled WeCom event: {}", xml);
        }
    }

    private void onCardButton(CallbackEvent e) {
        boolean agree = "approve".equals(e.getEventKey());
        String username = contactSyncService.wecomUserIdToUsername(e.getFromUserName());
        // task_id was generated by us when sending the card and associated with the Activiti taskId;
        // retrieve it from Redis/DB
        String taskId = taskCardMapping.get(e.getTaskId());
        approvalService.approve(taskId, username, agree, agree ? "Approved" : "Rejected");
        // Optionally call update_template_card to change the original card to "Approved/Rejected", preventing repeat taps
    }
}
```

Event handling must be **idempotent**: WeCom may re-push the same event on timeout. `approve` internally checks "task already ended / already handled" (6.4 queries for an active task), so duplicate pushes never produce a second approval. Time-consuming operations (e.g. sending multiple messages, writing to multiple tables) go to an async thread or message queue to guarantee the callback returns `success` within seconds.

## 8. Server-Side Infrastructure

### 8.1 Centralized Management of access_token / jsapi_ticket

Both tickets are valid for 7200 seconds and unique per corp per application (repeated acquisition invalidates the old one), so they must be cached centrally on the server. In multi-instance deployments, use a distributed lock to ensure only one instance refreshes:

```java
@Component
@Slf4j
public class WecomTokenManager {

    private static final String TOKEN_KEY = "wecom:access_token";
    private static final String LOCK_KEY  = "wecom:access_token:lock";
    private static final long EXPIRE_SECONDS = 7100;   // keep a 100s margin under 7200

    @Value("${wecom.corpid}") private String corpId;
    @Value("${wecom.secret}") private String secret;
    @Resource private StringRedisTemplate redis;
    @Resource private RestTemplate restTemplate;

    public String getAccessToken() {
        String cached = redis.opsForValue().get(TOKEN_KEY);
        if (StrUtil.isNotBlank(cached)) return cached;

        Boolean locked = redis.opsForValue().setIfAbsent(LOCK_KEY, "1", 10, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(locked)) return waitForToken();   // wait for another instance to refresh

        try {
            String again = redis.opsForValue().get(TOKEN_KEY);      // double-check
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
            throw new BusinessException(ErrorCode.WECOM_API_ERROR, "Failed to obtain access_token");
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
        throw new BusinessException(ErrorCode.WECOM_API_ERROR, "Timed out obtaining access_token");
    }

    public String getCorpId() { return corpId; }
}
```

Cache `jsapi_ticket` and the agent_config ticket independently using the exact same pattern (with separate cache keys).

### 8.2 Separating Sensitive Configuration

corpid/agentid may be public, but the secret, callback Token, and EncodingAESKey must be injected via environment variables or a config center and must never enter Git:

```yaml
# application-prod.yml
wecom:
  corpid: ${WECOM_CORPID}
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  oauth:
    redirect: https://attendance.yourcompany.com/mobile/oauth/callback
  jssdk:
    # Frontend domain participating in signatures, used by the backend for validation / link generation
    frontend-base: https://attendance.yourcompany.com
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}
```

### 8.3 API Security

- Let the OAuth login endpoint and WeCom callback endpoint through; everything else goes through the existing JWT authentication
- One-time random `state` string + sessionStorage validation to prevent CSRF
- A code can only be used once and is valid for 5 minutes; the backend exchanges it immediately on receipt and never caches it
- The backend re-validates the distance from check-in coordinates and does not trust the frontend; photos get watermarks; QR scanning layers on location
- Callback endpoints verify the signature + AES-decrypt + verify corpId, rejecting forged events
- Rate-limit critical APIs (Redis sliding window) against abuse

### 8.4 Contact-Book Sync Service

```java
@Service
public class ContactSyncService {

    /** Full sync (nightly safety net) */
    public void syncAll() {
        String token = tokenManager.getAccessToken();
        // 1. Department tree via department/list
        // 2. Iterate leaf departments, pull members via user/list?fetch_child=1
        // 3. Align by employee number to sys_user.username; write back wecom_user_id, department, name, phone, status
        // 4. WeCom status=5 (resigned) / member-deleted event -> disable the system account
    }

    /** Incremental events (real-time) */
    public void handleChange(String changeType, String wecomUserId) {
        switch (changeType) {
            case "create_user": case "update_user": upsertOne(wecomUserId); break;
            case "delete_user": disableByWecomUserId(wecomUserId); break;
            // Department changes sync the department table for orgService.findLeader org routing
            default: break;
        }
    }

    public String wecomUserIdToUsername(String wecomUserId) {
        return userMapper.findUsernameByWecomId(wecomUserId);
    }
}
```

## 9. Public Relay Gateway Under Network Isolation

The previous chapters assume the backend services can be accessed directly by the WeCom cloud and by users' phones. But many companies deploy their attendance system in an **intranet isolation zone**: no public IP, no inbound access allowed, and sometimes the servers themselves cannot directly reach the public internet. WeCom's servers are on the public internet, and mobile clients are outside the corporate intranet (off-site 4G/5G), so neither can reach the system directly. In this situation you deploy a dedicated **public relay gateway** in the DMZ (demilitarized zone): reachable by WeCom and mobile phones on one side, and able to reach the intranet attendance system through a controlled channel on the other.

### 9.1 Current Network State and Goals

Typical current state:

- The intranet attendance system (SpringBoot + PostgreSQL + Redis + Activiti) is open only to the office network, at an address like `http://10.10.20.30:8080`
- The perimeter firewall denies all public inbound traffic by default
- When phones connect to WeCom (especially off-site), traffic travels over the public internet and cannot be routed to `10.x` intranet addresses
- WeCom's OAuth callback, JS-SDK trusted domain, and event callback all require a **publicly reachable, ICP-filed HTTPS domain**

Goals:

- H5 pages on users' phones load normally, complete silent login, and call attendance and approval APIs
- The WeCom cloud can deliver OAuth authorization results and message card event callbacks
- The intranet system is **not directly exposed to the internet**; the database, Activiti, and business logic stay safely inside the intranet
- If the public-facing side is compromised, the blast radius is limited to the gateway; attackers cannot directly reach business databases or move laterally inside the intranet

### 9.2 Two Connectivity Models

| Model | Connection direction | Prerequisites | Characteristics |
|------|----------|----------|------|
| Model 1: DMZ gateway + firewall whitelist reverse proxy | DMZ gateway → intranet (perimeter firewall opens specified ports) | The firewall supports a restricted "DMZ → intranet" access policy | Most common, short path, good performance, clear auditing; **the main recommendation of this article** |
| Model 2: intranet-initiated reverse tunnel | Intranet → DMZ/public actively establishes a tunnel (frp/WireGuard) | The intranet allows no inbound traffic at all, only outbound | No inbound policy needed at the perimeter, strong penetration; operations and auditing are more complex |

The vast majority of companies choose Model 1: place a gateway server in the DMZ, and have the perimeter firewall open only one whitelist rule, "gateway IP → intranet attendance service IP:port". If security policy is so strict that even the DMZ cannot actively connect to the intranet, use Model 2, where the intranet dials out actively (see 9.7).

### 9.3 Recommended Architecture: the Gateway as a "WeCom Adapter Layer"

Key design principle: **the public gateway is not just an Nginx forwarder — it is a WeCom-facing adapter layer (BFF)**. All communication with the WeCom cloud converges at the gateway, and the intranet system is completely unaware of the WeCom protocol.

```
  WeCom cloud                 WeCom mobile app (public/4G)
 gettoken/getuserinfo/        |
 message send/event callback   | Open H5, call APIs
        |                      |
        v                      v
+-------------------------------------------------------------+
|              DMZ public gateway (only public exposure)        |
|  Nginx (443, HTTPS / ICP-filed domain / static H5 / WAF)      |
|  WeCom Gateway (SpringBoot, WeCom adapter layer)              |
|   - OAuth code -> userid (holds the secret)                   |
|   - jsapi_ticket / signature                                  |
|   - Proxied message send via message/send                     |
|   - Event callback signature verification / AES decryption    |
|   - Centralized access_token cache (Redis or local)           |
|   - No business database, no connection to business PostgreSQL|
+---------------+---------------------------------------------+
                |  Controlled internal channel (mTLS + internal token)
                |  Firewall whitelist: only gateway IP -> intranet 10.10.20.30:8080
                v
+-------------------------------------------------------------+
|            Intranet attendance system (existing, not public)  |
|  SpringBoot: attendance / Activiti / account binding / JWT    |
|  PostgreSQL - Redis - organization chart                      |
|  Only a new set of /internal/** trusted internal endpoints    |
+-------------------------------------------------------------+
```

Responsibility split (very important):

| Capability | Public gateway | Intranet system |
|------|:---:|:---:|
| Holds corpid/secret/EncodingAESKey | Yes | No |
| Calls WeCom cloud (gettoken, getuserinfo, get_jsapi_ticket, message/send) | Yes | No |
| OAuth callback landing, callback message verification/decryption | Yes | No |
| H5 static resource hosting (or CDN/OSS) | Yes | No |
| Account binding mapping (wecom_user_id <-> internal account) | No | Yes |
| Issue/validate business JWT, attendance, Activiti, org chart | No | Yes |
| PostgreSQL/Redis business data | No | Yes |
| Ordinary business APIs (/api/...) passthrough | reverse proxy only | handles them |

This way, even if the gateway is compromised, the attacker cannot obtain business database data, and the gateway holds no long-lived intranet credentials (internal tokens are short-lived and revocable).

### 9.4 Silent Login Flow Under Network Isolation (Differences from Chapter 4)

Chapter 4 assumes same-origin frontend/backend and that the backend can call WeCom directly. With the gateway added, "code for userid" happens at the gateway, while "userid for internal account, sign JWT" happens on the intranet — adding one extra hop of **internal trusted invocation** in between:

```
Mobile H5       DMZ gateway                 Intranet system       WeCom cloud
 |                |                          |                |
 | no token, redirect to OAuth               |                |
 |<---------------|                          |                |
 | silent auth redirect back ?code           |                |
 |--------------->| gettoken/getuserinfo ------------------->|
 |                |<------------------- userid ---------------|
 |                | POST /internal/wecom/assert {userid}      |
 |                |  (mTLS + X-Internal-Token gateway token)  |
 |                |------------------------->| look up bound account
 |                |                          | issue internal JWT
 |                |<------------------- JWT ------------------|
 |<---------------| internal JWT written to frontend          |
 | subsequent /api/** carry JWT               |               |
 |--------------->| Nginx reverse proxy (pass JWT) -->| attendance/approval
```

Key points:

- **The secret lives only on the gateway**; the intranet system does not need and should not configure WeCom credentials
- The intranet adds only one internal trusted endpoint `/internal/wecom/assert`: input is a userid, output is the system's own JWT. It is **not exposed to the internet** and accepts only calls from the gateway carrying an internal token / mTLS
- For business APIs `/api/**`, the gateway only reverse-proxies and passes through the JWT; authentication still happens in the intranet's Spring Security (see 4.7), and the gateway does not parse business payloads

**Gateway side: exchange code for userid, then for internal JWT**

```java
/**
 * DMZ gateway: WeCom OAuth adapter
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/wecom")
@Slf4j
public class GatewayOAuthController {

    @Resource
    private WecomTokenManager tokenManager;      // gettoken + Redis cache, see 8.1
    @Resource
    private InternalAttendanceClient internalClient;  // calls intranet internal trusted endpoints

    /** OAuth callback: code -> WeCom userid -> intranet JWT */
    @GetMapping("/oauth/callback")
    public void callback(@RequestParam("code") String code,
                         @RequestParam("state") String state,
                         HttpServletResponse resp) throws IOException {
        String userid = exchangeUserid(code);                // gateway calls WeCom cloud
        String jwt = internalClient.assertWecomUser(userid); // gateway calls intranet for JWT

        String redirect = stateService.consumeTarget(state); // restore original target from state, validate CSRF
        // Hand the JWT to the frontend via a one-time relay page (write localStorage, then jump to target)
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
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE, "Not in the app's authorization scope");
        }
        return json.getString("userid");
    }
}
```

> Do not keep the internal JWT in the URL long-term (it would enter gateway/Nginx logs and browser history). The one-time `/oauth-bridge.html` above works like this: the page script reads the token from the hash (the hash is never sent to the server and leaves no server logs), writes it to localStorage, immediately clears it with `history.replaceState`, and then jumps to the target page. `state` still performs CSRF validation and original-path restoration as in 4.3.

**Intranet side: an internal trusted endpoint callable only by the gateway**

```java
/**
 * Intranet: WeCom identity assertion endpoint (callable only by the gateway, not public)
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

        // 1. Verify the internal token from the gateway (or verify the client certificate at the mTLS layer; pick one or use both)
        if (!internalTokenVerifier.verify(internalToken)) {
            log.warn("Illegal call to internal assertion endpoint, userid={}", dto.getUserid());
            throw new BusinessException(ErrorCode.FORBIDDEN, "Internal endpoint access denied");
        }

        // 2. Reuse the account binding logic from section 4.6 (never create duplicate accounts)
        SysUser user = userService.getOrBindByWecomUserId(dto.getUserid());

        // 3. Issue the system's existing JWT (identical to username/password login)
        String jwt = jwtTokenProvider.generateToken(user.getId(), user.getUsername());
        return Result.success(new AssertVO(jwt, UserInfoVO.of(user)));
    }
}
```

Configure `/internal/**` separately in Spring Security: allow only requests from the gateway IP (or carrying an mTLS client certificate), and **never include it in the public Nginx reverse-proxy locations**, ensuring at both the network and application layers that it cannot be called directly from outside.

### 9.5 Internal Trust Between Gateway and Intranet (the Security Core)

The DMZ-to-intranet hop is the highest-security part of the whole solution; it must provide "encrypted channel + authentication + least privilege":

- **Network-layer whitelist**: the perimeter firewall opens only `gateway IP:random source port → intranet attendance IP:8080/tcp`; all other intranet ports and hosts are unreachable. Gateway access to the database (5432) and Redis (6379) is **never opened**
- **Transport encryption mTLS**: HTTPS mutual certificate authentication between gateway and intranet; the intranet trusts only the gateway's client certificate. Even sniffing on the same network segment cannot forge or replay traffic
- **Application-layer internal token**: in addition to mTLS, add a short-lived `X-Internal-Token` (injected by the gateway, verified by the intranet) as a double safeguard; keep the token in environment variables and rotate it regularly
- **Minimal endpoints**: the intranet exposes only a very small number of endpoints such as `/internal/wecom/assert` (exchange JWT), `/internal/message/send` (proxy-send to-dos), and `/internal/callback/event` (deliver callback events), with strict whitelist validation of inputs
- **Anti-replay**: internal requests carry a timestamp + nonce; the intranet validates the time window (e.g. ±5 minutes) and nonce uniqueness
- **The gateway stores no business data**: it does not connect to the business PostgreSQL; access_token and such use the gateway's own Redis or local cache; logs are masked and never record JWT plaintext

Internal token verification example:

```java
@Component
public class InternalTokenVerifier {

    @Value("${internal.gateway.token}")
    private String expectedToken;

    public boolean verify(String token) {
        // Constant-time comparison to prevent timing side channels
        return StrUtil.isNotBlank(token)
                && MessageDigest.isEqual(
                        token.getBytes(StandardCharsets.UTF_8),
                        expectedToken.getBytes(StandardCharsets.UTF_8));
    }
}
```

### 9.6 Cross-Zone Handling of Event Callbacks and Message Push

Under network isolation, WeCom event callbacks (card buttons, contact-book changes) can only hit the public gateway first, and the gateway then delivers them to the intranet; approval to-do notifications generated on the intranet go in reverse, proxied through the gateway.

**Inbound: WeCom event callback → gateway verifies and decrypts → deliver to intranet**

```java
/**
 * Gateway side: receive WeCom callbacks, verify signature + AES-decrypt, then forward to the intranet
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/wecom/callback")
@Slf4j
public class GatewayCallbackController {

    @Resource
    private WXBizMsgCrypt crypt;                 // official crypto (secret stays on the gateway)
    @Resource
    private InternalAttendanceClient internalClient;

    @PostMapping(value = "/message", produces = "application/xml")
    public String receive(@RequestParam("msg_signature") String sig,
                          @RequestParam String timestamp,
                          @RequestParam String nonce,
                          @RequestBody String encryptedBody) {
        try {
            // 1. Gateway completes signature verification + AES decryption (intranet does not need the EncodingAESKey)
            String xml = crypt.DecryptMsg(sig, timestamp, nonce, encryptedBody);
            // 2. Deliver the verified plaintext event to the intranet over the internal trusted channel (async, with internal token/mTLS)
            internalClient.forwardEvent(xml);
        } catch (Exception e) {
            log.error("WeCom callback handling failed", e);
        }
        return "success";   // Gateway returns success immediately to avoid WeCom re-push; intranet handling is idempotent
    }
}
```

The intranet receives an already-verified plaintext event and directly reuses the `WecomCallbackService` dispatch logic from chapter 7 (card button → `approvalService.approve()`, contact-book change → incremental sync). Note that intranet handling must be idempotent, because gateway forwarding may retry.

**Outbound: intranet to-do → gateway proxy-sends the WeCom message**

The intranet does not hold the secret and may not directly reach the public internet, so Activiti's to-do push listener (see 6.6) no longer calls WeCom directly; instead it submits "whom to send to, what card" to the gateway, which proxy-sends it:

```java
/**
 * Intranet side: hand to-do notifications to the public gateway for sending (intranet does not hold the WeCom secret)
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class GatewayMessageRelay {

    @Resource
    private InternalGatewayClient gatewayClient;

    public void sendApprovalTodoCard(String wecomUserId, TodoPushDTO todo) {
        // Call the gateway over mTLS/internal token; the gateway then calls message/send
        gatewayClient.enqueueMessage(MessageEnvelope.builder()
                .toUser(wecomUserId)
                .msgType("textcard")
                .title("Pending approval: " + todo.getNodeName())
                .description(todo.getSummary())
                .btnText("Approve now")
                // The card link points to the public H5 domain; tapping it runs silent login and goes straight to the approval
                .url("https://attendance.yourcompany.com/mobile/approval/" + todo.getTaskId())
                .build());
    }
}
```

```java
/**
 * Gateway side: proxy-send service (the only place that calls message/send)
 *
 * @author cuckoom
 */
@Service
public class GatewaySendService {

    @Resource
    private WecomTokenManager tokenManager;

    public void send(MessageEnvelope env) {
        // Verify intranet origin (mTLS/internal token done in an interceptor), then assemble the WeCom payload and send
        // Log invaliduser to aid troubleshooting "someone isn't receiving to-dos"
        ...
    }
}
```

This creates a clean one-way division of responsibility: all WeCom-related secrets and cloud calls converge on the gateway; the intranet only produces and handles business, sending and receiving messages through a narrow interface.

### 9.7 Alternative Model: Intranet-Initiated Reverse Tunnel

If security policy does not allow the DMZ to actively connect to the intranet (any DMZ→intranet inbound is forbidden), you can instead have **the intranet actively establish a long-lived tunnel to the DMZ/public gateway** — the intranet dials out, reusing the already-permitted outbound policy:

- **WireGuard / IPsec tunnel**: establish an encrypted point-to-point network between the gateway and a tunnel machine on the intranet; the intranet actively dials in. To the gateway, the intranet service appears as the tunnel peer address, and application-layer authentication from 9.3 still applies. Mature operations and good performance — preferred
- **Reverse proxies such as frp / rathole**: the intranet client `frpc` actively connects to the public `frps`, mapping intranet `8080` to a local port on the gateway. Fast to set up, but strictly limit exposed ports and protocols and add mTLS/tokens so the tunnel does not become a "public internet straight into the intranet" backdoor
- **Message queue / polling relay**: when security requirements are extremely high, the intranet only actively consumes a queue on the gateway side (e.g. pull pending callbacks, push back proxy-send results) — all traffic is intranet outbound with no reverse inbound. Latency is slightly higher, but the attack surface is minimal

Selection principle: if "DMZ + firewall whitelist" works, don't use a tunnel; when a tunnel is necessary, prefer a network-layer solution like WireGuard plus application-layer authentication; never use bare frp to map intranet management ports directly to the public internet.

### 9.8 Key Points of the Nginx Gateway Reverse-Proxy Configuration

The gateway's Nginx handles TLS termination, H5 static resources, and reverse-proxying `/api/**` to the intranet (via the tunnel peer address or a firewall-reachable address). Note that `/internal/**` must never be exposed here:

```nginx
server {
    listen 443 ssl http2;
    server_name attendance.yourcompany.com;

    ssl_certificate     /etc/nginx/ssl/attendance.crt;
    ssl_certificate_key /etc/nginx/ssl/attendance.key;

    # H5 static resources (Angular build output, history-mode fallback)
    root /data/www/mobile;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Business APIs: reverse-proxy to the intranet attendance system, pass through Authorization (JWT)
    location /api/ {
        proxy_pass https://10.10.20.30:8080;   # or the WireGuard tunnel peer address
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_verify       on;          # mTLS to the intranet as well
        proxy_ssl_trusted_certificate /etc/nginx/mtls/ca.crt;
        proxy_ssl_certificate     /etc/nginx/mtls/gateway.crt;
        proxy_ssl_certificate_key /etc/nginx/mtls/gateway.key;
    }

    # Note: do NOT configure a reverse proxy for /internal/ here; internal endpoints only use the trusted channel of the gateway backend

    # The gateway's own WeCom callback / silent login is handled by the gateway SpringBoot app (e.g. listening on 127.0.0.1:8090)
    location ~ ^/(wecom|oauth-bridge) {
        proxy_pass http://127.0.0.1:8090;
    }
}
```

> When building the frontend, point the API base at the public gateway's same-origin path (e.g. `/api`) and let Nginx forward it to the intranet; both the JS-SDK signature domain and the OAuth callback domain use the gateway's public ICP-filed domain. The intranet system needs no public domain or certificate at all.

### 9.9 Hardening the Public Gateway Itself

A DMZ host is the exposed surface and must be hardened by the least-privilege principle:

- Open only 443 (plus necessary SSH restricted to source IPs + key login), close all other ports; put a cloud WAF / security group in front
- Run the gateway process as non-root with minimal privileges; for container deployments use a read-only root filesystem and drop capabilities
- The gateway persists no business data and connects to no business database; forward logs centrally and do not keep sensitive information on disk long-term
- Secrets, internal tokens, and mTLS private keys all go through environment variables/KMS, never into images or Git (see 8.2)
- Add the gateway's outbound IP to WeCom's "enterprise trusted IP" whitelist (see the rate-limit and whitelist section in 10.4)
- Apply rate limiting, anti-replay, and request-body size limits uniformly at the gateway layer; alert on abnormal calls
- Audit calls to internal endpoints between gateway and intranet (who, when, which internal endpoint, what userid)

## 10. Pitfall Guide

### 10.1 OAuth Silent Login

- **The app home page / callback domain must be under the "trusted domain"**, otherwise the authorization page reports `redirect_uri parameter error`.
- **The authorization link must include `agentid`**, otherwise under some WeCom versions `getuserinfo` cannot obtain the application identity.
- **`appid` is the corpid**, not the agentid — a common beginner mistake is swapping them.
- **Returns openid instead of userid**: the user is outside the app's visible scope. Check whether the app's "visible scope" includes the member's department; do not silently create accounts in code.
- **Opening the link in a PC browser does not trigger silent authorization**: `snsapi_base` is seamless only inside the WeCom client. The frontend must check the UA first; non-WeCom environments go through the system's username/password login.
- **The code can be used only once and expires in 5 minutes**: refreshing the redirect-back page causes a code-reuse error. After successful login, the app should use `router.replace` to clear the code from the URL, preventing refresh replay.

### 10.2 JS-SDK Signatures

- **Sign with the entry-page URL on iOS and the current-page URL on Android** (see 5.3); under SPA this is the number-one cause of `invalid signature`. Record the entry URL before the first route jump.
- **The signed URL must match `location.href` character by character**: protocol, domain, port, and query must all be included; handle the hash consistently per the rules (history mode is recommended to avoid it).
- **If the frontend encodes, the backend encodes; if neither encodes, neither does**; the signature string concatenation order must be `jsapi_ticket&noncestr&timestamp&url`.
- Calling WeCom-proprietary APIs requires `beta: true` in `wx.config`, plus another `wx.agentConfig`.
- Real-device local debugging must use an https domain via intranet penetration; the hosts approach does not work on phones.

### 10.3 Activiti and Account Mapping

- **Unify the assignee identifier to the internal username**; do not write wecom_user_id directly into the BPMN assignee, otherwise switching identity sources later (DingTalk/Feishu in the future) would require changing every process definition.
- **Do not create duplicate accounts by wecom_user_id**: the number-one principle of an existing system is binding/mapping (4.6), otherwise attendance and historical to-dos split into two people.
- **Or-sign candidate tasks must be claimed before handling**; completing without claiming reports that the task does not belong to the current user.
- **A countersign rejection must end remaining instances early**: use a completionCondition containing a REJECT check + delete remaining tasks in a listener, otherwise others still receive to-dos after a rejection.
- **Put attendance linkage in a process-completion listener**, not in a specific approval-button API, so it takes effect from any entry point (PC, H5, card callback), and attendance is not mistakenly modified unless approval genuinely passes.

### 10.4 WeCom API Rate Limits and Others

| API | Limit (for reference; official docs prevail) |
|-----|------|
| gettoken | Calls per corp within 5 minutes are limited; must be cached |
| Send messages | Per-app per-minute cap; batch and dedupe touser where possible |
| Contact-book reads | Daily total call cap; rely mainly on incremental callbacks |
| Message card updates | Subject to API rate limits; avoid cyclic updates |

Other common issues:

- **The server's outbound IP must be added to the "enterprise trusted IP" whitelist**, otherwise error `60020` is returned.
- **HTTPS + ICP filing are mandatory** (mainland China servers); an expired certificate makes the entire app fail to open with no obvious prompt — include it in monitoring.
- **Callbacks must return `success` within seconds**, with business handling asynchronous; otherwise WeCom re-pushes and causes duplicate approvals (covered by idempotency as a safety net).
- **The textcard URL should land directly on the detail page**, combined with silent login + state redirect-back, to achieve "tap notification straight to approval".
- **If the secret leaks**, reset it in the admin console immediately and restart services; in code review, list "secret appearing in frontend/logs" as a red line.

### 10.5 Network Isolation and Relay Gateway

- **Never expose the intranet system directly to the internet**: place only the gateway in the DMZ; the perimeter firewall opens only the single whitelist "gateway IP → intranet attendance service IP:port"; gateway access to database/Redis ports is never opened.
- **Place the secret and the business database on separate sides**: the WeCom secret and EncodingAESKey live only on the gateway; account binding, JWT, and business data live only on the intranet. Neither side should both hold the keys and connect to the business database.
- **Internal endpoints `/internal/**` must be doubly protected**: mTLS client certificate + internal token (short-lived, rotatable, constant-time comparison), they must not appear in the public Nginx reverse-proxy locations, and timestamp/nonce anti-replay must be added.
- **Do not keep the internal JWT in the URL query long-term**: it enters Nginx/gateway logs and browser history. Use a one-time relay page that reads the hash (the `#` part never lands in server logs), writes localStorage, and clears it immediately.
- **The callback gateway returns success first; the intranet processes asynchronously and idempotently**: after verifying and decrypting, the gateway forwards to the intranet and returns in seconds itself; the intranet is idempotent by event id and tolerates gateway retries.
- **Do not expose management ports bare through reverse tunnels**: only intranet-initiated WireGuard/mTLS tunnels carrying narrow interfaces are allowed; bare frp mapping intranet 8080/admin console directly to the internet is forbidden.
- **Verify certificates and reachability separately**: the WeCom trusted domain/HTTPS certificate is configured on the gateway's public domain; the intranet can use self-signed or internal-CA certificates for mTLS — no public certificate needed. Be sure to regression-test silent login and callbacks on real off-site networks (4G/5G).

## 11. Go-Live Checklist

**WeCom admin console**

- [ ] The self-built app's visible scope covers all user departments
- [ ] The app home page is configured as the H5 mobile address (https)
- [ ] The trusted domain is configured and the ownership-verification file is accessible
- [ ] The enterprise trusted IP (server outbound IP) is whitelisted
- [ ] The receive-message URL/Token/EncodingAESKey is configured and the GET verification passes

**Accounts and identity**

- [ ] `sys_user.wecom_user_id` is initialized via contact-book sync, with correct employee-number mapping
- [ ] Unmatched accounts get clear "contact admin / self-service binding" guidance; no silent account creation
- [ ] `snsapi_base` silent login verified on real devices (iOS + Android)
- [ ] Re-login after token expiry is seamless and redirects back correctly (including approval-detail deep links)

**Functionality**

- [ ] JS-SDK `wx.config` passes on both iOS and Android (focus on verifying the signature URL)
- [ ] Location/photo/QR scanning work on real devices; backend secondary distance validation is effective
- [ ] Countersign: each person gets an independent to-do; any rejection terminates and notifies the initiator
- [ ] Or-sign: all candidates receive it; after one person claims and handles it, others' to-dos disappear
- [ ] Organization-chart approval: routes correctly to the head/managing director based on the applicant's department
- [ ] After approval, attendance linkage (make-up correction / leave deduction) is persisted correctly
- [ ] To-do card push is delivered, taps go straight through and are already logged in; card button callbacks are idempotent

**Security and operations**

- [ ] secret/Token/AESKey come from environment variables, never in Git or logs
- [ ] access_token/jsapi_ticket caching + distributed lock verified (multi-instance)
- [ ] HTTPS certificate-expiry monitoring, API rate limiting, and key-operation audit logs
- [ ] Incremental contact-book callbacks + daily full-sync safety-net job enabled

**Network isolation / public relay gateway (chapter 9, mandatory for isolated networks)**

- [ ] The DMZ gateway is the only public exposure; the intranet attendance system has no public inbound rules
- [ ] The perimeter firewall opens only "gateway IP → intranet attendance IP:8080"; PG/Redis ports are not opened
- [ ] The WeCom secret / EncodingAESKey exist only on the gateway, not on the intranet; the gateway connects to no business database
- [ ] `/internal/**` uses mTLS + internal token + timestamp/nonce anti-replay and is not reverse-proxied by public Nginx
- [ ] Cross-zone silent login verified on real devices: gateway exchanges userid → intranet assert exchanges JWT → business APIs pass through authentication
- [ ] Callbacks: gateway verifies/decrypts and returns success in seconds, intranet is async and idempotent; to-dos are delivered via gateway proxy-send
- [ ] Off-site 4G/5G real-device regression: H5 loading, silent login, location check-in, approval to-dos and card callbacks
- [ ] If using a reverse tunnel: intranet-initiated, WireGuard/mTLS, only narrow interfaces exposed, no bare frp management ports

## Summary

Given "an existing attendance system + complex Activiti approvals", the correct approach to WeCom integration is not to rewrite a new system, but to treat WeCom as an **entry point, identity provider, and message channel**:

- **Technology choice**: when you already have a web system, complex approval forms, and require fast iteration and review-free releases, H5 fits better than a Mini Program; OAuth2 `snsapi_base` silent authorization is enough for automatic login when the app is opened, and the JS-SDK covers location, photos, and QR scanning.
- **Automatic login flow**: the frontend route guard finds no token → 302 to WeCom authorization (with state) → silent redirect back with code → backend gettoken + `auth/getuserinfo` to obtain userid → **map to an existing system account by employee number (not create a new one)** → issue the system's existing JWT; thereafter all attendance and approval APIs are reused with zero changes.
- **Account decoupling**: Activiti assignees/candidates continue to use internal usernames; the WeCom userid is only an external-identity field on `sys_user`, converted when identifying a person at login or addressing pushes, preserving the ability to coexist with multiple login methods.
- **Approval reuse**: countersign (multi-instance + completion condition), or-sign (candidateUsers + claim), and organization-chart approval (UEL expression dynamically resolving the leader) all reuse the existing BPMN; H5 only adds to-do list/detail/handling entry points, all going through the same `taskService.complete()` underneath.
- **Linkage and reach**: attendance linkage lives in a process-completion listener to guarantee consistency across entry points; new to-dos are pushed via textcard with a link straight to the approval detail, reusing silent login; one-tap in-card approval goes through callbacks and must be idempotent.
- **Key pitfalls**: trusted domain and enterprise trusted IP, iOS/Android signature-URL differences, one-time code and state CSRF protection, never creating duplicate accounts, or-sign claiming, callbacks returning success in seconds, and centralized ticket caching.
- **Network isolation implementation**: when the intranet attendance system cannot be reached by WeCom, deploy a public relay gateway in the DMZ as the only exposed surface — WeCom credentials and cloud calls (gettoken/getuserinfo/signatures/proxy message send/callback verification) converge on the gateway, while account binding, JWT, Activiti, and business data all stay on the intranet; the two sides communicate in a controlled manner over narrow mTLS + internal-token interfaces (`/internal/**`); when even DMZ→intranet inbound is forbidden, fall back to an intranet-initiated WireGuard/mTLS reverse tunnel. This opens the WeCom entry point without exposing the intranet system directly to the internet.

Official docs: [WeCom Developer Center](https://developer.work.weixin.qq.com/document/)

> The essence of this solution is "integration" rather than "rebuilding": with minimal new code (one OAuth login endpoint, one account-mapping layer, one JS-SDK signature service, a set of to-do push listeners), years of accumulated attendance and Activiti approval capabilities appear smoothly in employees' WeCom, with seamless automatic login. If check-in experience needs further improvement later, a Mini Program check-in entry can be layered on, sharing the same backend accounts and workflows with H5 approval for smooth evolution.
