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

For many teams, WeCom development is not about building a new system from scratch, but about a far more common and realistic scenario: **the business system already exists and has been running for years** — the attendance module has long been live, and the approval workflow is built on Activiti with complex flows such as countersign (all must approve), or-sign (any one approves), and organization-chart-based multi-level approval, with the approval process also querying and interacting with attendance data. The current requirement is: bring this system into WeCom so that employees can open it from the WeCom Workbench and use it immediately, **without entering a username or password — they land directly on their own attendance data and to-do tasks**.

Under these premises, the H5 application model is often a better fit than a Mini Program: the existing system is already an Angular + SpringBoot web architecture, so H5 can directly reuse the front-end pages and back-end APIs, and together with WeCom OAuth2 web authorization (`snsapi_base`) it achieves completely silent automatic login (SSO). Deployment takes effect immediately with no review or release process, and iteration cost is minimal when approval forms change frequently.

Using "**an existing attendance management system + complex Activiti approval workflows**" as the background and **the H5 model as the main thread**, this article systematically explains how to complete the WeCom-side integration without rewriting the business system. It focuses on the complete OAuth2 silent login chain, the binding/mapping between WeCom accounts and system accounts, invoking device capabilities through the JS-SDK, and the WeCom-side implementation of Activiti countersign/or-sign/organization-chart approval interacting with attendance (to-do push, one-tap approval on cards, organization-chart synchronization).

<!-- more -->

## 1. Scenario Analysis and Model Selection

### 1.1 Assumptions About the Existing System

This article assumes the business system currently looks as follows (this is also the typical shape of internal systems in most mid-sized and large enterprises):

- **Attendance management**: complete check-in, check-in records, make-up check-in applications, and attendance statistics features already exist, with the back end exposing REST APIs
- **Approval workflow engine**: built on Activiti (6.x/7.x), with process definitions including:
  - **Countersign (all must approve)**: a node requires every one of multiple people to approve (e.g., a make-up check-in needs both the direct manager and HR to agree)
  - **Or-sign (any one approves)**: at a node, any one of multiple people can approve (e.g., a department duty-approval group)
  - **Organization-chart-based approval**: approvers are determined dynamically according to the applicant's department (department head → division leader → HRBP)
  - **Attendance data interaction**: the approval process reads/writes attendance data (e.g., once a make-up check-in is approved, the check-in record is automatically corrected; once annual leave is approved, the leave balance is deducted)
- **Account system**: the system has its own user table and role/permission system (e.g., Spring Security + JWT/Session)
- **Front end**: an existing web client, an Angular single-page application (TypeScript)

There are only two core problems to solve:

1. **Identity**: who is the person entering from WeCom? How do they map to a system account for automatic login?
2. **Entry and reach**: how do users enter the application from the WeCom Workbench? How are approval to-do tasks actively pushed to employees' WeCom?

The business logic (check-in rules, approval flow transitions) **does not need to be moved into WeCom at all**. WeCom only plays three roles: "entry point + identity provider (IdP) + message channel".

### 1.2 Why H5 Is the First Choice in This Scenario

| Comparison Dimension | H5 Application (the approach in this article) | WeCom Mini Program |
|----------|--------------------|----------------|
| Reusing the existing web front end | Directly reuses existing Angular pages | All pages must be rewritten in WXML/WXSS |
| Reusing existing back-end APIs | Directly reused; only one OAuth login endpoint is added | Reused as well, but the entire front end is rebuilt |
| Automatic login | OAuth2 `snsapi_base` silent authorization, completely transparent | `wx.qyLogin` silent login, also transparent |
| Release and iteration | Takes effect on deployment; approval forms can be changed anytime | Requires submission for review and version release; emergency fixes are slow |
| Complex forms/process pages | Web technologies are flexible and suit form-heavy pages like approvals | Form-engine-style pages are expensive to develop |
| Device capabilities | JS-SDK: geolocation/camera/scan (requires signature) | Native APIs called directly, slightly better experience |
| Approval-style business: "low frequency, form-heavy, high iteration" | Excellent fit | Overweight |

**Conclusion**: check-in itself is high-frequency and device-capability-heavy, where Mini Programs do offer a better experience; but under the premise of "**integrating an existing system, with complex and frequently changing approval flows, where the primary goals are low-cost launch and automatic login**", H5's overall benefits far outweigh the small gap in experience. H5 can also invoke geolocation, camera, and scanning through the JS-SDK, fully covering attendance scenarios. Later in this article we provide a complete JS-SDK signature scheme and handling of iOS/Android pitfalls.

> If check-in experience requirements increase later, a hybrid model is also possible: configure both an H5 home page (approvals, records, statistics) and a Mini Program (check-in) in the same self-built application; message cards jump to each according to business type, and the back-end account system is fully shared.

### 1.3 Overall Architecture

```
┌───────────────────────────────┐
│          WeCom Client          │
│  Workbench / Message Card / Scan     │
└───────────────┬───────────────┘
                │ Open H5 (built-in WebView)
                ▼
┌───────────────────────────────┐
│   H5 Front End (reusing existing web project)  │
│  Angular SPA + wx JS-SDK     │
│  Router guard: no token → redirect to OAuth  │
└───────────────┬───────────────┘
                │ HTTPS (JWT)
                ▼
┌───────────────────────────────────────────────────────┐
│                    Existing Business Back End (SpringBoot)            │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ WecomOAuth   │  │ Attendance module      │  │ Activiti approval  │ │
│  │ Silent login/account binding │  │ (existing, reused)  │  │ (existing, reused)   │ │
│  └──────┬───────┘  └──────────────┘  └───────┬───────┘ │
│         │              Account mapping table user_id ↔ wecom_userid │
└─────────┼────────────────────────────────────┼─────────┘
          ▼                                    ▼
┌───────────────────┐              ┌──────────────────────┐
│ WeCom server-side API  │              │ PostgreSQL / Redis   │
│ gettoken           │              │ Business tables + act_* workflow tables │
│ auth/getuserinfo   │              └──────────────────────┘
│ jsapi_ticket       │
│ message/send push   │◀──── When an approval to-do is created, the back end actively pushes a card
└───────────────────┘
```

Key design principle: **the WeCom userid is merely an external identity field on the system's user table**. Attendance and Activiti candidates/assignees still use the internal system userId (or are unified with userid; see the discussion in section 4.5), so WeCom is simply a newly added login method and does not intrude on the existing permission and workflow models.

## 2. Setting Up the Development Environment

### 2.1 Create a Self-Built Application and Obtain the Three Key Credentials

1. Go to the [WeCom Admin Console](https://work.weixin.qq.com/) and log in with an administrator account
2. "App Management" → "Self-built" → "Create App"; fill in the app name (e.g., "Mobile Attendance & Approval"), logo, and visible scope
3. After creation, record three key parameters:

| Parameter | Description | Where to Obtain |
|------|------|----------|
| `corpid` | Unique corporation identifier | My Company → Company Info → Corp ID |
| `agentid` | Unique application identifier | App Management → Self-built App → AgentId |
| `secret` | Application secret | App Management → Self-built App → Secret |

> ⚠️ The `secret` is the most sensitive credential. **Keep it only on the server side**; it must never appear in H5 front-end code, Git repositories, or browser requests.

### 2.2 Configure the App Home Page (H5 Entry)

Configure the H5 home page URL at "App Home Page" on the app details page:

```
App Management → Self-built App → App Home Page → Configure Web Page
  Home page URL: https://attendance.yourcompany.com/mobile/
```

When an employee taps the app icon in the WeCom Workbench, this URL is opened inside WeCom's built-in browser. We recommend using a dedicated path for the mobile H5 (such as `/mobile/`), separated from the PC admin side, to facilitate router-based traffic splitting and independent layouts.

### 2.3 Configure the Trusted Domain (the Most Critical Backend Configuration for H5)

In H5 mode, both the OAuth web authorization callback domain and the JS-SDK depend on the "trusted domain":

```
App Management → Self-built App → Developer Interfaces → Web Authorization & JS-SDK
  → Set trusted domain: attendance.yourcompany.com
  → Download the domain ownership verification file (WW_verify_xxxx.txt)
  → Place the file in the domain root directory and ensure it is accessible at:
    https://attendance.yourcompany.com/WW_verify_xxxx.txt
```

Domain requirements:

- Must be **HTTPS** (mandatory for OAuth authorization and the JS-SDK)
- ICP filing completed (for servers in mainland China)
- The domain ownership verification file is served directly by the front-end static resource service or Nginx
- One app can have multiple trusted domains (the domain registrant must be consistent), and the callback address must fall under these domains

Also configure the "Enterprise Trusted IP": the egress IP of the server calling server-side APIs must be whitelisted, otherwise endpoints such as `gettoken` return `60020 not allow to access from your ip`.

### 2.4 Configure Message Receiving (Callback, for Card Button Approval)

To implement "tap Approve/Reject directly on the message card" (without opening a page), you need to configure a callback:

```
App Management → Self-built App → Receive Messages → Set API Receiving
  URL:             https://attendance.yourcompany.com/api/wecom/callback/message
  Token:           Custom (used for signature verification)
  EncodingAESKey:  Randomly generated (used for AES encryption/decryption of message bodies)
```

If you only need to-do redirection and no in-card interaction, you can skip this for now, but we recommend configuring it from the start (it is used in Chapter 7).

### 2.5 Local Development Environment

The core difficulty of local H5 development is: OAuth callbacks and the JS-SDK require a trusted domain + HTTPS, while locally you only have `http://localhost`. There are two common approaches.

**Option 1: Intranet penetration (recommended; closest to the real environment)**

```bash
# Use frp or ngrok to map local port 8080/the front-end port to a sub-path of the filed domain
# For example, expose https://dev-attendance.yourcompany.com
frpc -c frpc.ini

# Allow host-domain access to the Angular dev server (angular.json)
# serve options: host set to 0.0.0.0, default port 4200
# angular.json -> projects/<name>.architect.serve.options
{ "host": "0.0.0.0", "port": 4200 }
# Or via command line: ng serve --host 0.0.0.0 --port 4200
```

Add the penetration domain to the admin console's trusted domains (during development) and place the verification file in your local static directory to pass verification.

**Option 2: hosts + mkcert (no public network needed; suitable for pure page joint debugging)**

```bash
mkcert -install
mkcert attendance.yourcompany.com        # Generate a locally trusted certificate
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

> Note: the hosts approach can only fool the browser's certificate verification. The WeCom client's OAuth authorization still goes to the real WeCom servers and then redirects back; during real-device debugging the phone cannot use your computer's hosts. Therefore, **real-device debugging must use an intranet-penetration domain**.

**Starting the back end locally**:

```bash
cd ~/work/code/attendance-backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

## 3. Integrating the H5 Front-End Project

### 3.1 Directory Structure (Reuse the Existing Angular Project; Add a Mobile Module)

There is no need to create a new project. In the existing Angular + TypeScript project, add a lazy-loaded mobile module (feature module / routes) and a WeCom adaptation layer:

```
attendance-web/
├── src/
│   ├── main.ts
│   ├── index.html                   # You can also import jweixin via a <script> tag here
│   ├── app/
│   │   ├── app.routes.ts            # Main router entry (PC/mobile traffic split)
│   │   ├── mobile/                  # H5 mobile side inside WeCom (lazy-loaded module)
│   │   │   ├── mobile.routes.ts     # Mobile child routes
│   │   │   ├── guards/
│   │   │   │   └── wecom-auth.guard.ts   # Silent login route guard (CanActivate)
│   │   │   └── pages/
│   │   │       ├── checkin/checkin.component.ts      # Check-in home page
│   │   │       ├── records/records.component.ts      # Check-in records
│   │   │       ├── todo/todo-list.component.ts       # Approval to-do (Activiti tasks)
│   │   │       ├── todo/approval-detail.component.ts # Approval detail (countersign/or-sign progress)
│   │   │       ├── apply/makeup-apply.component.ts   # Make-up check-in application (triggers process)
│   │   │       └── oauth/oauth-callback.component.ts # OAuth callback landing page
│   │   ├── core/
│   │   │   ├── interceptors/
│   │   │   │   └── auth.interceptor.ts   # HttpClient interceptor (injects JWT, re-login on 401)
│   │   │   └── services/            # Reuse existing business services
│   │   │       ├── checkin.service.ts
│   │   │       └── approval.service.ts
│   │   └── wecom/                   # WeCom adaptation layer (the core addition this time)
│   │       ├── env.service.ts       # Whether inside WeCom, UA detection
│   │       ├── oauth.service.ts     # OAuth2 silent login redirect logic
│   │       ├── jssdk.service.ts     # wx.config / agentConfig / signatures
│   │       └── device.service.ts    # Geolocation, camera, scan wrappers
├── public/ (or src/)
│   └── WW_verify_xxxx.txt           # Domain ownership verification file (place at static resource root)
└── angular.json
```

### 3.2 Importing the WeCom JS-SDK

WeCom H5 uses the `jweixin` module (it shares the same origin as the WeChat Official Account JSSDK; WeCom extends it with `wx.agentConfig` and enterprise-specific APIs):

```bash
npm install weixin-js-sdk --save
# Or import directly in index.html
# <script src="https://res.wx.qq.com/open/js/jweixin-1.2.0.js"></script>
```

```typescript
// src/app/wecom/env.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WecomEnvService {
  /** Whether the app is currently running inside the WeCom client */
  isInWecom(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    // The WeCom UA contains both wxwork and micromessenger
    return /wxwork/.test(ua) && /micromessenger/.test(ua);
  }

  /** Whether it is iOS (JS-SDK signature URL handling differs; see Chapter 5) */
  isIOS(): boolean {
    return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  }
}
```

### 3.3 Routing and the Silent Login Guard

All mobile business routes sit behind a single `CanActivate` guard: if there is no system token, it initiates OAuth silent login, and after successful login returns to the original page. This is the master switch for "tap the app and get logged in automatically"; Chapter 4 covers it in detail.

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

  // Core: ensure logged in; when not logged in, redirectToWecomAuth triggers a full-page redirect to OAuth
  if (oauth.hasToken()) {
    return true;
  }
  oauth.redirectToWecomAuth(state.url);   // Will leave the current page
  return new Promise<boolean>(() => false); // Block this navigation, waiting for the full-page redirect
};
```

Lazy-load the entire mobile module under the `mobile` path in the root routes:

```typescript
// src/app/app.routes.ts
export const APP_ROUTES: Routes = [
  {
    path: 'mobile',
    loadChildren: () => import('./mobile/mobile.routes').then(m => m.MOBILE_ROUTES),
  },
  // ...PC admin-side routes
];
```
## 4. The Complete OAuth2 Silent Automatic Login (SSO) Chain

This is the core of the entire integration. Target experience: an employee taps the app icon in WeCom (or taps an approval message card), and while the page opens **there is no login page and no confirmation button at all**; after a second or two they land directly on the business page, and the back end already knows "which person in the system they are".

### 4.1 Choosing the Authorization Mode: snsapi_base

WeCom web authorization supports two scopes:

| scope | Confirmation popup | What you can get | Applicable |
|-------|-----------|-----------|------|
| `snsapi_base` | **Silent, no popup whatsoever** | Only the member's userid (exchanged via the back end) | Automatic login for in-house enterprise apps, **used in this article** |
| `snsapi_privateinfo` | Requires manual user confirmation | userid + sensitive info (phone/email, etc., requires member authorization) | Rare scenarios requiring additional privacy fields |

For an in-house self-built application whose visible scope already covers the users, `snsapi_base` is completely silent inside the WeCom client — this is exactly the foundation of automatic login. We don't need phone numbers or emails at this step (those can be queried by userid through the server-side contacts API), so we always use `snsapi_base`.

### 4.2 End-to-End Sequence

```
WeCom client       H5 front end (WebView)      Business back end            WeCom server
    │                   │                     │                     │
    │ Open app home page    │                     │                     │
    │──────────────────▶│                     │                     │
    │                   │ Route guard: no token  │                     │
    │                   │ 302 redirect to authorization URL    │                     │
    │◀──────────────────│                     │                     │
    │ Silent authorization (transparent)  │                     │                     │
    │───────────────────────────────────────▶│                     │
    │ 302 redirect back to callback?code=xxx&state=yyy    │                     │
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
    │                   │                     │ userid→look up/create system account │
    │                   │                     │ Issue JWT           │
    │                   │◀────────────────────│                     │
    │                   │ Store token, redirect back to target page │                     │
    │                   │ Subsequent requests carry JWT        │                     │
```

Note two key points:

1. **The code is only exchanged on the back end**: the front end never calls WeCom APIs directly (that would expose the secret). The front end is only responsible for "guiding the redirect" and "handing the code on the redirect URL to the back end".
2. **The authorization URL can be assembled on either the front end or the back end**, but the `state`-based CSRF protection and the "redirect back to the original page after login" logic must be managed by yourself.

### 4.3 Step 1: Construct the Authorization URL and Redirect

The authorization URL format:

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
| `appid` | The enterprise corpid (note: although it is called appid here, fill in the corpid) |
| `redirect_uri` | The URL to redirect back to after authorization; must be URL-encoded and must be under a trusted domain |
| `response_type` | Fixed to `code` |
| `scope` | `snsapi_base` |
| `agentid` | The self-built app's agentid (**must be included**, otherwise on some versions the app identity cannot be obtained) |
| `state` | Custom parameter, returned by WeCom as-is; used for CSRF prevention + carrying the post-login redirect target path |
| `#wechat_redirect` | Fixed suffix; must end in this hash form |

The front end wraps this in an injectable `WecomOAuthService` (`src/app/wecom/oauth.service.ts`):

```typescript
import { Injectable, inject } from '@angular/core';
import { WecomEnvService } from './env.service';

@Injectable({ providedIn: 'root' })
export class WecomOAuthService {
  private readonly env = inject(WecomEnvService);

  private readonly CORP_ID = 'ww your_corpid';        // corpid is not highly sensitive and may live on the front end
  private readonly AGENT_ID = '1000002';              // agentid is also public
  private readonly CALLBACK =
    'https://attendance.yourcompany.com/mobile/oauth/callback';

  hasToken(): boolean {
    return !!localStorage.getItem('sys_token');
  }

  /** Generate a random state, and temporarily store "the page to go to after login" in sessionStorage */
  private buildState(redirectPath: string): string {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(`wx_state_${nonce}`, redirectPath || '/mobile/checkin');
    sessionStorage.setItem('wx_state_nonce', nonce);   // Verified at callback
    return nonce;
  }

  /** Initiate silent login: full-page redirect to the WeCom authorization URL */
  redirectToWecomAuth(redirectPath: string): void {
    if (!this.env.isInWecom()) {
      // Non-WeCom environment (e.g. opened directly in a PC browser): use the system username/password login page
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

The route guard only needs to call `hasToken()` to check, and `redirectToWecomAuth()` when not logged in (see `WecomAuthGuard` in 3.3).

> corpid and agentid are "public identifiers" (the authorization URL has to appear in plaintext in the browser anyway), so putting them on the front end is harmless; the only real key is the secret, which always lives only on the server side.

### 4.4 Step 2: The Callback Landing Page Exchanges the code for a Token

After redirecting back to `/mobile/oauth/callback?code=xxx&state=yyy`, the callback page does three things: verify the state → send the code to the back end → after obtaining the JWT, redirect back to the original target page.

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

    // 1. Verify state to prevent CSRF: it must be the nonce we stored before redirecting
    const savedNonce = sessionStorage.getItem('wx_state_nonce');
    if (!state || state !== savedNonce) {
      this.errMsg.set('Login state verification failed, please re-enter the application');
      return;
    }
    const redirectPath = sessionStorage.getItem(`wx_state_${state}`) || '/mobile/checkin';

    try {
      // 2. Hand the code to the back end in exchange for the system JWT
      const { token } = await firstValueFrom(this.auth.loginByWecomCode(code));
      localStorage.setItem('sys_token', token);
      sessionStorage.removeItem(`wx_state_${state}`);
      sessionStorage.removeItem('wx_state_nonce');
      // 3. Return to the page originally intended (might be a specific approval to-do detail)
      this.router.navigateByUrl(redirectPath, { replaceUrl: true });
    } catch (e: any) {
      this.errMsg.set('Automatic login failed: ' + (e?.message || 'please retry'));
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

  /** Exchange code for JWT: one of the few endpoints that does not require a token (allowed through in the interceptor) */
  loginByWecomCode(code: string): Observable<WecomLoginResp> {
    return this.http
      .post<{ code: number; message: string; data: WecomLoginResp }>(
        '/api/auth/wecom/login', { code })
      // Unwrap the back end's unified response envelope { code, message, data } (error-code handling can be done uniformly in an interceptor)
      .pipe(map((resp) => resp.data));
  }
}
```

### 4.5 Step 3: The Back End Exchanges the code for userid (Core of Authentication)

After the back end receives the code, it must first obtain an access_token, then call two APIs:

- `auth/getuserinfo`: code → userid (internal enterprise member) or openid (non-member/external contact)
- After obtaining the userid, if needed use `user/get` (contacts) to fill in name, department, and mobile number

**API 1: Obtain the access credential**

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

Returns an `access_token` (valid for 7200 seconds). The access_token must be centrally managed (Redis cache + distributed lock; see Chapter 8); neither the front end nor other services fetch it themselves.

**API 2: Exchange code for userid**

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

> If it returns an `openid` but no `userid`, the current user is not within the enterprise app's visible scope (possibly an external contact). You should reject the login and prompt them to contact an administrator to grant access, rather than automatically creating an account.

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
 * WeCom silent login Service
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
            // Only openid: not an internal enterprise member, outside the app's visible scope
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE,
                    "The current account is not within the app's authorization scope, please contact an administrator");
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

### 4.6 Step 4: Binding WeCom Accounts to System Accounts (The Most Critical Design for an Existing System)

This is the biggest difference between "an existing business system" and "building a system from scratch": the system already has a batch of accounts (perhaps logging in with employee ID, email, or domain account), and from WeCom only a userid arrives. **You cannot simply "create a new user from the userid"**, otherwise the same person becomes two accounts and attendance records and Activiti to-dos all fail to line up.

Three binding strategies are recommended; choose according to the enterprise's reality:

**Strategy A: Employee ID/account is consistent, bind automatically (most recommended; zero operations overhead)**

The "account" field in the WeCom contacts is usually the enterprise's unified employee ID, and the WeCom userid is often the employee ID as well. Agree that userid = system username (or employee ID), and associate directly by account at login:

```java
/**
 * Bind a system account by WeCom userid
 * Convention: the WeCom userid is identical to the system employee ID (username)
 */
public SysUser getOrBindByWecomUserId(String wecomUserId) {
    // 1. First look up by the already-bound wecom_user_id
    SysUser user = userMapper.findByWecomUserId(wecomUserId);
    if (user != null) {
        return user;
    }

    // 2. Not bound: try to automatically match an existing account by employee ID (username)
    user = userMapper.findByUsername(wecomUserId);
    if (user != null) {
        // Establish the binding relationship; next time it hits directly
        user.setWecomUserId(wecomUserId);
        userMapper.updateById(user);
        log.info("System account {} automatically bound to WeCom userid {}", user.getUsername(), wecomUserId);
        return user;
    }

    // 3. Still no match: do not silently create an account. Return a state requiring guided binding, handled by an administrator or the self-service binding flow
    throw new BusinessException(ErrorCode.WECOM_ACCOUNT_NOT_BOUND,
            "No system account associated with this WeCom account was found, please contact an administrator to bind");
}
```

**Strategy B: Self-service binding (when account systems are not unified)**

If automatic matching is impossible at first login, let the user enter the system account password once to complete binding; afterwards the mapping between that wecom_user_id and user_id is persisted, granting permanent silent login:

```
First WeCom login → back end finds no mapping → returns NEED_BIND state
  → H5 shows a binding page (enter system account/password, or employee ID + SMS code)
  → back end verifies successfully → writes sys_user.wecom_user_id → issues JWT
```

The binding relationship is established only once; the credentials are discarded immediately after verification, and no plaintext password is stored.

**Strategy C: Administrator pre-binding / contacts synchronization**

Use the contacts API (`user/list`) to batch-sync by department, aligning WeCom userids with system accounts by employee ID (Chapter 8 provides the sync scheme). Suitable for a one-time initialization before launch.

**User table modification** (add a field to the existing user table without touching the existing structure):

```sql
ALTER TABLE sys_user ADD COLUMN wecom_user_id VARCHAR(64);
COMMENT ON COLUMN sys_user.wecom_user_id IS 'WeCom userid (external identity)';
CREATE UNIQUE INDEX uk_sys_user_wecom ON sys_user (wecom_user_id) WHERE wecom_user_id IS NOT NULL;
```

> Design point: **the internal userId stays unchanged**. Attendance record foreign keys, Activiti's `ACT_RU_TASK.ASSIGNEE_`, and candidate groups all continue to use the internal system userId (username). The WeCom userid is used only for "identifying the person at login" and "addressing at push time", decoupled through the `sys_user.wecom_user_id` mapping layer. This neither pollutes the workflow definitions nor removes the ability to coexist with PC username/password and other SSO login methods.

### 4.7 Step 5: Seamless Integration of JWT with the Existing Authentication System

After silent login obtains the userid, subsequent requests are exactly the same as on the PC side, going through the system's existing JWT/Session authentication. This means zero changes to attendance and approval APIs.

The front end uses Angular's `HttpInterceptor` to uniformly inject the token and re-run silent login on 401:

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
        // Token expired: re-run silent login inside WeCom (transparent); in external environments go to the login page
        localStorage.removeItem('sys_token');
        const env = inject(WecomEnvService);
        if (env.isInWecom()) {
          location.reload();   // The route guard automatically initiates OAuth again
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

> The silent login endpoint `/api/auth/wecom/login` itself carries no token; the interceptor lets the "no token in local storage" case pass through unchanged with no special judgment needed; only on 401 does it trigger silent re-login.

The back end keeps the existing Spring Security configuration (SecurityFilterChain Bean form), only allowing the WeCom login and callback endpoints through:

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
            // Front-end/back-end separation + JWT: stateless, CSRF disabled, JWT filter parses the token
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter(),
                    UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
    // JwtAuthenticationFilter: parses the Authorization header and writes into SecurityContext; reuse the existing implementation
}
```

> If your project still uses Spring Security 5.x's `WebSecurityConfigurerAdapter`, the equivalent is to override `configure(HttpSecurity)`, call `permitAll()` on the same two paths and `csrf().disable()`; the JWT issued by silent login is uniformly verified by the existing JWT filter, fully shared with username/password login.

At this point, the chain "tap the app → automatic login → directly see your own attendance and to-dos" is fully connected, and **not a single line of the existing attendance and Activiti APIs, permissions, or data has changed**.
## 5. JS-SDK: Using Geolocation, Camera, and Scanning in H5

Attendance scenarios cannot do without geolocation, camera, and scanning. Unlike Mini Programs, H5 cannot call native APIs directly; it must go through the WeCom JS-SDK after signature-based authorization. This chapter provides a signature scheme that can be put into practice directly, with a focus on the iOS/Android signature URL difference that is the easiest pitfall.

### 5.1 wx.config and wx.agentConfig

The WeCom JS-SDK has two layers of configuration, which beginners most often confuse:

| Configuration | Purpose | Signature ticket |
|------|------|----------|
| `wx.config` | Injects base configuration; invokes general capabilities (sharing, geolocation `getLocation`, scanning `scanQRCode`, choosing images, and most other APIs) | Signed with `jsapi_ticket` |
| `wx.agentConfig` | Injects the current **self-built application** identity; invokes WeCom-specific APIs (such as `selectEnterpriseContact` contact picker, some approval-related APIs) | Signed with `get_jsapi_ticket` (enterprise app ticket) |

For check-in geolocation/camera/scanning, passing `wx.config` is enough; only enterprise-specific capabilities such as "the organization-chart approver/CC contact picker" require an additional `agentConfig`.

### 5.2 Back End: jsapi_ticket Management and Signing

`jsapi_ticket` is exchanged with an access_token, is valid for 7200 seconds, and likewise needs centralized caching:

```
GET https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=TOKEN
```

The ticket endpoint for enterprise app agentConfig is `ticket/get?type=agent_config`.

The signature algorithm (specified by WeCom):

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

    /** Obtain jsapi_ticket (cached; logic is the same as access_token; the distributed lock is omitted here, see 8.1) */
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
     * Generate the signature required by wx.config
     * @param pageUrl The page URL used for signing, sent from the front end (see 5.3 for the special iOS handling)
     */
    public WxConfigSignatureVO buildConfigSignature(String pageUrl) {
        String ticket = getJsapiTicket();
        String nonceStr = IdUtil.fastSimpleUUID();
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);

        // Note: the url participating in the signature must exactly match the front-end location.href (including hash handling rules; see below)
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

    /** After the front end enters a page, it exchanges the current URL for a signature */
    @GetMapping("/config")
    public Result<WxConfigSignatureVO> config(@RequestParam("url") String url) {
        return Result.success(jsapiService.buildConfigSignature(url));
    }
}
```

### 5.3 Front End: Signature Initialization (with Special Handling of the iOS Entry Page Problem)

The most classic JS-SDK pitfall: **Android signs with the current page URL, while iOS (WKWebView) signs with the URL of the entry page when first entering the app**. In an SPA, front-end route changes do not actually refresh the page; on iOS, if you sign with the "current route's href", then as long as it is not the first landing page, `wx.config` will inevitably report `invalid signature`.

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

  /** Get the URL participating in the signature: strip the #hash part (WeCom signature rules exclude the hash from url) */
  private signableUrl(href: string): string {
    const idx = href.indexOf('#');
    return idx >= 0 ? href.slice(0, idx) : href;
  }

  /** Record the entry page URL (only needed on iOS; must be called once at app startup, before route navigation) */
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

  /** Ensure wx.config completes (only once globally; reusable within the SPA) */
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
          beta: true,                 // Required! WeCom-specific APIs need beta:true
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

Record the iOS entry URL as early as possible at app startup (before the first route navigation); you can use `APP_INITIALIZER`:

```typescript
// Register startup initialization in src/app/app.config.ts
import { APP_INITIALIZER } from '@angular/core';

function recordWxEntryUrl() {
  const jssdk = inject(WecomJssdkService);
  const env = inject(WecomEnvService);
  return () => {
    // Invoke the entry-recording logic of ensureWxConfig once (on iOS this fixes the landing page URL before the first navigation)
    if (env.isInWecom()) {
      // Warm up wx.config; it may also be non-blocking — when geolocation/scanning is actually invoked, the service still falls back internally
      jssdk.ensureWxConfig().catch(() => void 0);
    }
  };
}

// Add to providers:
// { provide: APP_INITIALIZER, useFactory: recordWxEntryUrl, multi: true }
```

> The key point is that on iOS the entry URL must be read from `location.href` and fixed before any front-end route navigation happens. Placing it in `APP_INITIALIZER` (executed before Angular routing starts) is the most reliable; even if you don't warm up the signature, you must at least write the entry URL to sessionStorage in that hook.

> Routing mode recommendation: to reduce the mental burden of hashes and signatures, the mobile H5 can use **history mode**; if you use hash mode, be sure to truncate at `#` per `signableUrl` above, ensuring the URLs participating in signatures on front and back ends are exactly identical, and that both sides use `encodeURIComponent` or neither encodes — stay consistent.

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

  /** JS-SDK geolocation (gcj02 Mars coordinates, consistent with maps in mainland China) */
  getLocation(): Promise<LngLat> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res: any) => resolve({
          longitude: res.longitude,
          latitude: res.latitude,
          accuracy: res.accuracy,
        }),
        fail: (err: any) => reject(new Error('Geolocation failed, please check location permissions: ' + err.errMsg)),
      });
    }));
  }

  /** Invoke the camera to take a photo (camera only, no album, to prevent cheating); returns localId */
  takePhoto(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera'],
        sizeType: ['compressed'],
        success: (res: any) => resolve(res.localIds[0]),
        fail: (err: any) => reject(new Error('Taking photo failed: ' + err.errMsg)),
      });
    }));
  }

  /** Scan QR code (workstation/meeting-room QR check-in) */
  scanQRCode(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.scanQRCode({
        needResult: 1,              // 1 = the front end receives the result and handles it itself
        scanType: ['qrCode'],
        success: (res: any) => resolve(res.resultStr),
        fail: (err: any) => reject(new Error('Scanning failed: ' + err.errMsg)),
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

The check-in component invokes it (`checkin.component.ts`); use the team's existing UI library for prompts (such as NG-ZORRO's `NzMessageService`):

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
      this.msg.error(`Outside check-in range, ${Math.round(dist)} meters from the company`);
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

The back-end check-in API is identical to the system's existing implementation (secondary distance verification, duplicate-check-in prevention, persistence, push); this logic already exists, and H5 is just a new caller. The back end **must re-verify the distance** and cannot trust the latitude/longitude sent from the front end (front-end coordinates can be tampered with via packet capture).

### 5.5 Photo Check-in and QR Check-in

Camera and scanning are already wrapped in the `WecomDeviceService` in 5.4 (`takePhoto()` returns a localId, `scanQRCode()` returns the QR content); the component can simply await them. The localId image obtained from `takePhoto` then needs to be uploaded:

- `wx.uploadImage` first uploads the image to WeCom to obtain a `serverId`, and the back end then calls WeCom's media API `media/get` to pull it into the intranet — suitable for scenarios where you don't want to upload files directly from H5;
- Or draw the localId onto a canvas to convert it to a Blob, and POST it directly to the existing file service with Angular's `FormData` + `HttpClient`, reusing the system's existing attachment storage.

With either approach the back end keeps the existing photo storage and watermark (time + location + device info) logic. For QR check-in, the back end verifies the QR token's validity and expiry and layers on geolocation double verification, likewise reusing existing APIs.
## 6. Implementing Complex Activiti Approval Workflows on the WeCom Side

Attendance-related approvals (make-up check-in, leave, field work, overtime appeals, etc.) are already defined and working in Activiti; the WeCom side does not need to reimplement the workflow. It only needs to do three things: **bring the to-dos out, connect the approval actions in, and actively push to-dos to WeCom**. This chapter uses three typical nodes — countersign, or-sign, and organization-chart-based approval — to explain how to reuse them.

### 6.1 First Unify the Assignee Identifier

Activiti uses a string to identify a task assignee (`ACT_RU_TASK.ASSIGNEE_`) or candidate users/groups (`ACT_RU_IDENTITYLINK`). Make sure: **the assignee identifiers hard-coded in the process definition or computed at runtime are identical to `sys_user.username` (the internal account, i.e. the unique key bound to wecom_user_id)**.

We recommend uniformly using the employee ID/username (such as `zhangsan`) as the system-wide unique person identifier:

- Activiti assignee / candidateUser = `sys_user.username`
- WeCom mapping = `sys_user.wecom_user_id` (at many companies this is also the employee ID; the two may be the same, but they are logically separate)
- When pushing WeCom messages: `username → look up sys_user → get wecom_user_id` as `touser`

This way Activiti's process definitions, UEL expressions, and candidate queries need no changes whatsoever for WeCom.

### 6.2 Expressing the Three Typical Nodes in Process Definitions

Take the "make-up check-in application" process as an example to demonstrate countersign, or-sign, and organization-chart-based approval in BPMN.

**Countersign (passes only when all agree)** — use a multi-instance node (multiInstanceLoopCharacteristics) + completion condition:

```xml
<userTask id="countersignLeaderHr" name="Direct leader and HR countersign">
  <documentation>Everyone approves; it passes only if all agree; any rejection ends it</documentation>
  <multiInstanceLoopCharacteristics isSequential="false"
                                   activiti:collection="${countersignUsers}"
                                   activiti:elementVariable="approver">
    <completionCondition>${approveResultList.size() == nrOfInstances
        &amp;&amp; !approveResultList.contains('REJECT')}</completionCondition>
  </multiInstanceLoopCharacteristics>
  <userTask><extensionElements/></userTask>
</userTask>
```

- `isSequential="false"`: parallel countersign, generating one task for each person simultaneously
- `nrOfInstances`: total countersign headcount; `approveResultList`: a process variable collecting each person's approval conclusion
- Completion condition: proceed only when everyone has handled it and there is no REJECT

**Or-sign (any one of multiple people can handle it)** — also multi-instance, but with the completion condition changed to "end as soon as 1 is handled"; a more common approach is candidate users (candidateUsers), where one task is visible to multiple people and whoever claims it handles it:

```xml
<userTask id="orSignDuty" name="Duty group or-sign" activiti:candidateUsers="${dutyGroupUsers}">
  <documentation>Any member of the candidate group may claim and approve</documentation>
</userTask>
```

Or use multi-instance + `nrOfCompletedInstances >= 1` to give each person a to-do and automatically cancel the rest once one person handles it.

**Dynamic organization-chart-based approval** — the assignee is not hard-coded but computed in real time from the org chart by a process expression (applicant → direct department head → division leader):

```xml
<userTask id="deptLeaderApprove" name="Department head approval"
          activiti:assignee="${orgService.findLeader(applyUserId)}"/>
<userTask id="directorApprove" name="Division leader approval"
          activiti:assignee="${orgService.findDirector(applyUserId)}"/>
```

`orgService` is a Spring Bean registered into Activiti's expression context; internally it walks up the department tree to find leaders. After a department head transfers positions, new process instances are automatically routed according to the latest org chart, with no need to change the process definition.

> This BPMN already runs on the PC side. The WeCom side merely adds a "handling entry"; underneath, the handling action still calls the same `taskService.complete()`, so countersign counting, or-sign claiming, organization routing, and gateway conditions are all guaranteed consistent by the engine — there is no problem of "the process on PC differing from the process on mobile".

### 6.3 WeCom-Side To-Do List and Detail

**To-do list** — directly use Activiti's TaskQuery to query the current logged-in user's to-dos by username (with countersign, each person has their own task; or-sign candidate tasks are queried with taskCandidateUser):

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

    /** Current user's to-dos (including directly assigned + or-sign candidate, unclaimed) */
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
                .candidate(Objects.isNull(task.getAssignee()))  // Or-sign, unclaimed
                .build();
    }
}
```

**Approval detail** — display the form, countersign progress (who has agreed, who is pending), and the approval-comment timeline:

```java
/** Countersign progress: aggregate each assignee's status from historic tasks + current tasks */
public List<ApproverProgressVO> countersignProgress(String processInstanceId) {
    List<HistoricTaskInstance> done = historyService.createHistoricTaskInstanceQuery()
            .processInstanceId(processInstanceId)
            .finished()
            .list();
    List<Task> pending = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .list();
    // Merge: done carries approval comments (COMMENT), pending is marked "pending approval"
    // Assembly omitted; returns [{user, userName, status: APPROVED/REJECTED/PENDING, comment, time}]
    return mergeProgress(done, pending);
}
```

The front-end `ApprovalDetailComponent` renders according to `nodeType`: countersign shows a multi-avatar progress bar (handled/pending), or-sign shows "any duty-group member may approve; tap to claim and handle".

### 6.4 Claiming (Or-Sign) and Approval Actions

An or-sign candidate task must first be claimed to become the assignee before it can be handled; countersign tasks are directly assigned and skip claiming.

```java
@Transactional(rollbackFor = Exception.class)
public void approve(String taskId, String username, boolean agree, String comment) {
    Task task = taskService.createTaskQuery().taskId(taskId).active().singleResult();
    if (task == null) {
        throw new BusinessException(ErrorCode.TASK_NOT_FOUND, "The to-do does not exist or has already been handled");
    }

    // Or-sign: claim the candidate task first
    if (task.getAssignee() == null) {
        boolean isCandidate = taskService.createTaskQuery()
                .taskId(taskId).taskCandidateUser(username).count() > 0;
        if (!isCandidate) {
            throw new BusinessException(ErrorCode.NO_PERMISSION, "You have no permission to handle this task");
        }
        taskService.claim(taskId, username);
    } else if (!username.equals(task.getAssignee())) {
        throw new BusinessException(ErrorCode.NO_PERMISSION, "This task does not belong to you");
    }

    // Record the approval comment
    Authentication.setAuthenticatedUserId(username);
    taskService.addComment(taskId, task.getProcessInstanceId(),
            (agree ? "Approve: " : "Reject: ") + comment);

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

    // Post-approval handling: push the next node's to-do; interact with attendance when the process ends (see 6.5, 6.6)
    afterTaskComplete(task.getProcessInstanceId(), agree);
}
```

Rejection strategies can be chosen according to enterprise rules: reject back to the initiator (resubmit), reject to the previous node, or end the process directly. The make-up check-in scenario commonly uses "any rejection terminates + notifies the initiator", which is exactly the semantics of `!contains('REJECT')` in the countersign completion condition.

### 6.5 Interaction Between Approval and Attendance Data (Reusing Existing Capabilities)

When the process ends, attendance is written back according to business type. This logic already exists in the system, and WeCom-side approval triggers the same `taskService.complete()`, so the interaction naturally takes effect. Typical make-up check-in handling:

```java
public void afterProcessFinished(String processInstanceId) {
    // After the process ends, process-instance variables have moved into history tables; fetch business variables from HistoricVariableInstance
    Map<String, Object> vars = historyService.createHistoricVariableInstanceQuery()
            .processInstanceId(processInstanceId)
            .list()
            .stream()
            .collect(Collectors.toMap(HistoricVariableInstance::getVariableName,
                    HistoricVariableInstance::getValue, (a, b) -> a));
    String bizType = String.valueOf(vars.get("bizType"));     // MAKEUP / LEAVE / OVERTIME
    Boolean approved = (Boolean) vars.get("approved");

    if (!Boolean.TRUE.equals(approved)) {
        notifyApplicant(processInstanceId, false);   // Rejection notification
        return;
    }

    switch (bizType) {
        case "MAKEUP":
            // Make-up check-in approved: correct/supplement the check-in record for the corresponding date (existing attendance Service)
            attendanceService.applyMakeupCard(
                (Long) vars.get("recordId"),
                (String) vars.get("makeupTime"),
                String.valueOf(vars.get("reason")));
            break;
        case "LEAVE":
            // Leave approved: record leave, deduct leave balance
            leaveService.grantLeave(vars);
            break;
        default:
            break;
    }
    notifyApplicant(processInstanceId, true);
}
```

Triggering via an Activiti process-completed event listener is more robust than manually calling it in every approval endpoint (completion from any entry — PC, WeCom, scheduled tasks — will reach it):

```java
import org.activiti.engine.delegate.event.ActivitiEntityEvent;
import org.activiti.engine.delegate.event.ActivitiEvent;
import org.activiti.engine.delegate.event.ActivitiEventListener;
import org.activiti.engine.delegate.event.ActivitiEventType;

/**
 * Activiti process-completion listener: interacts with attendance after the approval finally ends
 * Registered via RuntimeService.addEventListener(...) or ProcessEngineConfiguration
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
        return false;   // Listener exceptions do not affect the process itself
    }
}
```

### 6.6 Actively Pushing To-Dos to WeCom

An H5 to-do list alone is not enough — employees will not proactively go in and refresh it. When process flow produces a new to-do, the back end should actively push an "approval card" to the next handler's WeCom; tapping the card opens the corresponding H5 approval detail page directly, and thanks to the Chapter 4 silent login, it opens already logged in.

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

        // Directly assigned (countersign: one task per person) → push to the assignee
        if (StrUtil.isNotBlank(task.getAssignee())) {
            pushToUser(task, task.getAssignee());
        } else {
            // Or-sign candidate task → push to all candidate users / members expanded from candidate groups; first to enter claims first
            for (IdentityLink link : taskService.getIdentityLinksForTask(task.getId())) {
                if (StrUtil.isNotBlank(link.getUserId())) {
                    pushToUser(task, link.getUserId());
                } else if (StrUtil.isNotBlank(link.getGroupId())) {
                    // Candidate group: look up member usernames by group and push one by one (implementation omitted)
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
        return false;   // Push failure should not roll back Activiti's task creation
    }
}
```

Text card message (tap to jump directly to the H5 approval page):

```json
{
  "touser": "wangwu",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "Pending approval: Li Si's make-up check-in application",
    "description": "Node: Direct leader approval<br/>Make-up date: 2026-09-08 morning<br/>Reason: Forgot to check in at the customer site during field work",
    "url": "https://attendance.yourcompany.com/mobile/approval/123456",
    "btntxt": "Approve Now"
  }
}
```

Key point: **the card URL points directly to the approval detail page**. The employee taps it → no token → Chapter 4 OAuth silent login → after callback returns to this approval detail via the redirect path carried in `state` (see redirectPath in 4.3). To achieve this, you only need to make the message card link carry WeCom's conventional silent-login parameters, or have the front-end guard enforce login for all `/mobile/**`; no special handling is needed.

**Template card button callbacks (advanced: approve/reject directly without opening a page)**

If you want approvers to tap "Approve/Reject" directly in the message notification, use `template_card` (button_interaction) + the callback receiving from Chapter 6; after the back end receives the button event it directly calls `mobileApprovalService.approve()` and then updates the card state. This approach suits nodes where the approval action is extremely simple (one-tap approve); for cases involving filling in comments or viewing countersign details, jumping to H5 is still recommended. The two approaches call the exact same approval method underneath.

### 6.7 Organization-Chart Synchronization: Ensuring Dynamic Approvers Can Be Reached by Push

The assignee dynamically computed by "organization-chart-based approval" is a username; at push time you must be able to look up their wecom_user_id. There are two ways to guarantee this:

1. **Incremental contacts callback sync** (recommended, real-time): subscribe to `change_contact` events (member created/updated/deleted, department changes) and update `sys_user`'s wecom_user_id and department membership in real time.
2. **Scheduled full sync**: once every night in the early morning, call the contacts department/member APIs for a full alignment as a fallback.

```
GET /cgi-bin/department/list?id=0            # Department tree
GET /cgi-bin/user/list?department_id=1&fetch_child=1   # Department member details
```

During sync, align by employee ID (username), backfill the WeCom userid into `sys_user.wecom_user_id`, and sync department relationships for use by `orgService.findLeader()` organization routing and push addressing. The contacts read APIs have a daily call limit (see 9.4), so be sure to use "incremental callbacks as primary + one daily full sync as fallback" rather than high-frequency polling.
## 7. Message Push and Event Callbacks

### 7.1 access_token and Sending Messages

Application messages are uniformly sent by the server side; the API is:

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

Common message types:

- `text`: plain text such as attendance reminders
- `textcard`: title + description + button, tap to jump to H5 (first choice for approval to-dos)
- `template_card`: with interactive buttons, operable directly within the notification (paired with callbacks)
- `markdown`: rich text such as approval summaries (supported inside WeCom)

Push service wrapper (`duplicate_check_interval` is used to prevent duplicate pushes in a short period):

```java
@Service
@Slf4j
public class WecomMessageService {

    @Resource private WecomTokenManager tokenManager;
    @Resource private RestTemplate restTemplate;
    @Value("${wecom.agentid}") private Integer agentId;

    /** Send an approval to-do card; tapping jumps to the H5 approval detail */
    public void sendApprovalTodoCard(String wecomUserId, Task task) {
        Map<String, Object> card = new HashMap<>();
        card.put("title", "Pending approval: " + task.getName());
        card.put("description", "A new approval to-do is waiting for you to handle");
        card.put("btntxt", "Approve Now");
        card.put("url", "https://attendance.yourcompany.com/mobile/approval/" + task.getId());

        Map<String, Object> msg = new HashMap<>();
        msg.put("touser", wecomUserId);
        msg.put("msgtype", "textcard");
        msg.put("agentid", agentId);
        msg.put("textcard", card);
        msg.put("duplicate_check_interval", 1800);

        send(msg);
    }

    public void send(String msg) { /* post message/send, log invaliduser/errcode */ }
}
```

> The `invaliduser`/`invalidparty` in the response body must be logged: it means someone in the push target is not bound or not within the visible scope, and is the first clue when troubleshooting "why someone isn't receiving to-do notifications".

### 7.2 Callback Signature Verification and Encryption/Decryption

After configuring "Receive Messages", WeCom sends two kinds of requests to the callback URL:

- **GET**: URL validity verification when saving the configuration; you must decrypt `echostr` and return it as-is
- **POST**: formal event pushes (template card buttons, contacts changes), ciphertext XML, requiring signature verification + AES decryption

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

    /** Event receiving: be sure to return success quickly; put time-consuming handling async to avoid WeCom retries */
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
        return "success";   // Return success first regardless of business success/failure, to prevent WeCom retrying with exponential backoff
    }
}
```

Do not implement encryption/decryption yourself; directly use the official `aes-256` sample code package (WeCom officially provides the Java version `WXBizMsgCrypt`), which wraps: SHA1 signature verification, AES-256-CBC decryption, corpId verification, and XML assembly. The three parameters `Token`, `EncodingAESKey`, and `corpid` come from the backend callback configuration.

### 7.3 Handling Template Card Buttons and Contacts Events

```java
@Service
@Slf4j
public class WecomCallbackService {

    @Resource private MobileApprovalService approvalService;
    @Resource private ContactSyncService contactSyncService;
    @Resource private WXBizMsgCrypt crypt;   // Official encryption/decryption class

    /** After decryption, dispatch by event type */
    public void handle(String sig, String ts, String nonce, String body) throws Exception {
        String xml = crypt.DecryptMsg(sig, ts, nonce, body);
        // Parse XML with XStream/Digester, extract Event / ChangeType / TaskId / EventKey / FromUserName
        CallbackEvent event = CallbackEvent.parse(xml);

        switch (event.getEvent()) {
            case "template_card_event":
                // Template card button: EventKey is the button key, FromUserName is the clicking user's userid
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
        // task_id was generated by us when sending the card and associated with the Activiti taskId; retrieve it from Redis/DB
        String taskId = taskCardMapping.get(e.getTaskId());
        approvalService.approve(taskId, username, agree, agree ? "Approve" : "Reject");
        // You can call update_template_card to update the original card to "Approved/Rejected" to avoid repeated taps
    }
}
```

Event handling must be **idempotent**: WeCom may re-push the same event on timeout, and `approve` internally checks for "task already ended/already handled" (6.4 queries for active tasks), so duplicate pushes do not produce a second approval. Put time-consuming operations (such as sending multiple messages or writing multiple tables) on an async thread or message queue to ensure the callback returns `success` within seconds.

## 8. Server-Side Infrastructure

### 8.1 Centralized Management of access_token / jsapi_ticket

Both tickets are valid for 7200 seconds and are unique per enterprise per app (re-obtaining invalidates the old one), so they must be centrally cached on the server. With multi-instance deployment, use a distributed lock to ensure only one instance refreshes:

```java
@Component
@Slf4j
public class WecomTokenManager {

    private static final String TOKEN_KEY = "wecom:access_token";
    private static final String LOCK_KEY  = "wecom:access_token:lock";
    private static final long EXPIRE_SECONDS = 7100;   // Leave a 100s margin before 7200

    @Value("${wecom.corpid}") private String corpId;
    @Value("${wecom.secret}") private String secret;
    @Resource private StringRedisTemplate redis;
    @Resource private RestTemplate restTemplate;

    public String getAccessToken() {
        String cached = redis.opsForValue().get(TOKEN_KEY);
        if (StrUtil.isNotBlank(cached)) return cached;

        Boolean locked = redis.opsForValue().setIfAbsent(LOCK_KEY, "1", 10, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(locked)) return waitForToken();   // Wait for another instance to refresh

        try {
            String again = redis.opsForValue().get(TOKEN_KEY);      // Double-check
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

`jsapi_ticket` and the agent_config ticket can be cached independently using exactly the same pattern (with separate cache keys).

### 8.2 Separating Sensitive Configuration

corpid/agentid can be public, but the secret, callback Token, and EncodingAESKey must be injected via environment variables or a configuration center, never entering Git:

```yaml
# application-prod.yml
wecom:
  corpid: ${WECOM_CORPID}
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  oauth:
    redirect: https://attendance.yourcompany.com/mobile/oauth/callback
  jssdk:
    # The front-end domain participating in signatures, used for back-end verification/link generation
    frontend-base: https://attendance.yourcompany.com
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}
```

### 8.3 API Security

- The OAuth login endpoint and WeCom callback endpoint are allowed through; everything else goes through existing JWT authentication
- One-time random `state` string + sessionStorage verification to prevent CSRF
- The code can only be used once and is valid for 5 minutes; the back end exchanges it immediately on receipt and never caches it
- The back end re-verifies the distance for check-in coordinates, not trusting the front end; photos are watermarked; scanning layers on geolocation
- The callback endpoint verifies signatures + AES decryption + corpId verification, rejecting forged events
- Rate-limit key endpoints (Redis sliding window) to prevent abuse

### 8.4 Contacts Synchronization Service

```java
@Service
public class ContactSyncService {

    /** Full sync (nightly fallback) */
    public void syncAll() {
        String token = tokenManager.getAccessToken();
        // 1. Department tree department/list
        // 2. Iterate leaf departments, user/list?fetch_child=1 to pull members
        // 3. Align by employee ID to sys_user.username, backfill wecom_user_id, department, name, mobile, status
        // 4. WeCom status=5 (resigned)/member-deleted event → disable the system account
    }

    /** Incremental events (real-time) */
    public void handleChange(String changeType, String wecomUserId) {
        switch (changeType) {
            case "create_user": case "update_user": upsertOne(wecomUserId); break;
            case "delete_user": disableByWecomUserId(wecomUserId); break;
            // Department changes sync the department table for orgService.findLeader organization routing
            default: break;
        }
    }

    public String wecomUserIdToUsername(String wecomUserId) {
        return userMapper.findUsernameByWecomId(wecomUserId);
    }
}
```

## 9. Pitfall Guide

### 9.1 OAuth Silent Login

- **The app home page/callback domain must be under a "trusted domain"**, otherwise the authorization page reports `redirect_uri parameter error`.
- **The authorization URL must include `agentid`**, otherwise on some WeCom versions `getuserinfo` cannot obtain the app identity.
- **The `appid` is filled with the corpid**, not the agentid; beginners often swap them.
- **Returns openid instead of userid**: the user is outside the app's visible scope. Check whether the app's "visible scope" includes the member's department; do not silently create accounts in code.
- **Opening the link in a PC browser does not silently authorize**: `snsapi_base` is transparent only inside the WeCom client. The front end must check the UA first; non-WeCom environments go through system username/password login.
- **The code can only be used once and expires in 5 minutes**: refreshing the redirect page causes a code-reuse error. After successful login the app should use `router.replace` to clear the code from the URL to avoid refresh replay.

### 9.2 JS-SDK Signing

- **iOS signs with the entry page URL, Android with the current page URL** (see 5.3); under SPA this is the number-one cause of `invalid signature`. The entry URL must be recorded before the first route navigation.
- **The URL participating in the signature must match `location.href` character by character**: protocol, domain, port, and query must all be included; the hash part is handled uniformly per the rules (history mode is recommended to avoid it).
- **If the front end encodes, the back end encodes; if neither encodes, neither does**; the signature string must be concatenated in the order `jsapi_ticket&noncestr&timestamp&url`.
- To call WeCom-specific APIs, set `beta: true` in `wx.config` and perform `wx.agentConfig` once more.
- Local real-device debugging must use an intranet-penetration https domain; the hosts approach does not work on phones.

### 9.3 Activiti and Account Mapping

- **Unify the assignee identifier as the internal username**; do not write wecom_user_id directly into the BPMN assignee, otherwise if the identity source changes (DingTalk/Feishu integration later) all process definitions must be changed.
- **Do not create duplicate accounts by wecom_user_id**: the first principle of an existing system is binding/mapping (4.6), otherwise attendance and historic to-dos split into two people.
- **An or-sign candidate task must be claimed before handling**; completing it directly without claiming reports that the task does not belong to the current user.
- **A countersign rejection must end the remaining instances early**: use a completionCondition containing the REJECT check + delete the remaining tasks in the listener, otherwise others still receive to-dos after rejection.
- **Put attendance interaction in the process-completion listener**, not in some approval-button endpoint, ensuring it takes effect from any entry (PC, H5, card callback) and that attendance is not mistakenly changed before the approval truly passes.

### 9.4 WeCom API Rate Limits and Others

| API | Limit (for reference; official documentation prevails) |
|-----|------|
| gettoken | The number of calls within 5 minutes per enterprise is limited; must be cached |
| Send messages | There is a per-app per-minute cap; make touser batched and de-duplicated where possible |
| Contacts reads | There is a total daily cap; rely primarily on incremental callbacks |
| Message card updates | Subject to API rate limits; avoid loop updates |

Other common issues:

- **The server egress IP must be added to the "Enterprise Trusted IP" whitelist**, otherwise it reports `60020`.
- **HTTPS + ICP filing are mandatory** (mainland China servers); certificate expiry causes the entire app to fail to open with no obvious prompt — include it in monitoring.
- **Callbacks must return `success` within seconds**, with business handled asynchronously, otherwise WeCom re-pushes and causes duplicate approvals (covered by idempotency).
- **The textcard URL should land directly on the detail page**, combined with silent login + state redirect, to achieve "tap notification straight to approval".
- **If the secret leaks**, reset it in the admin console immediately and restart the service; in code review, treat "secret appearing in front-end/logs" as a red line.

## 10. Go-Live Checklist

**WeCom admin console**

- [ ] The self-built app's visible scope covers all user departments
- [ ] The app home page is configured as the H5 mobile address (https)
- [ ] The trusted domain is configured and the ownership verification file is accessible
- [ ] The enterprise trusted IP is whitelisted (server egress IP)
- [ ] Receive-message URL/Token/EncodingAESKey are configured and the GET verification passes

**Accounts and identity**

- [ ] `sys_user.wecom_user_id` is initialized via contacts sync, with correct employee-ID mappings
- [ ] Unmatched accounts have clear "contact administrator/self-service binding" guidance and are never silently created
- [ ] `snsapi_base` silent login is verified on real devices (iOS + Android)
- [ ] Re-login after token expiry is transparent, and redirect back to the original page works (including approval-detail deep links)

**Functionality**

- [ ] JS-SDK `wx.config` passes on both iOS/Android (especially verify the signature URL)
- [ ] Geolocation/camera/scanning work on real devices, and back-end secondary distance verification takes effect
- [ ] Countersign: each person has an independent to-do; any rejection terminates and notifies the initiator
- [ ] Or-sign: all candidates receive it; after one claims and handles it, the others' to-dos disappear
- [ ] Organization-chart approval: correctly routes to the head/division leader by the applicant's department
- [ ] After approval, attendance interaction (make-up correction/leave deduction) is correctly persisted
- [ ] To-do card push is delivered, tap goes directly through and is already logged in; card button callbacks are idempotent

**Security and operations**

- [ ] secret/Token/AESKey come from environment variables, never in Git or logs
- [ ] access_token/jsapi_ticket caching + distributed lock verified (multi-instance)
- [ ] HTTPS certificate validity monitoring, API rate limiting, and audit logs for key operations
- [ ] Incremental contacts callbacks + daily full-sync fallback job enabled

## Conclusion

When doing WeCom integration under the premise of "an existing attendance system + complex Activiti approvals", the correct approach is not to rewrite everything, but to treat WeCom as an **entry point, identity provider, and message channel**:

- **Model selection**: with an existing web system, complex approval forms, and requirements for rapid iteration and review-free launch, H5 is a better fit than a Mini Program; OAuth2 `snsapi_base` silent authorization achieves tap-to-login, and the JS-SDK fully covers geolocation, camera, and scanning.
- **Automatic login chain**: the front-end route guard finds no token → 302 to WeCom authorization (with state) → silent redirect back with code → back-end gettoken + `auth/getuserinfo` obtains userid → **maps to the existing system account by employee ID (rather than creating one)** → issues the system's existing JWT, after which all attendance and approval APIs are reused with zero changes.
- **Account decoupling**: Activiti's assignee/candidates continue to use the internal username; the WeCom userid is only an external identity field on `sys_user`, converted when identifying at login and addressing at push, preserving the coexistence of multiple login methods.
- **Approval reuse**: countersign (multi-instance + completion condition), or-sign (candidateUsers + claim), and organization-chart approval (UEL expressions dynamically resolving leaders) all reuse the existing BPMN; H5 only adds to-do list/detail/handling entries, all going through the same `taskService.complete()` underneath.
- **Interaction and reach**: attendance interaction sits in the process-completion listener to guarantee consistency across entries; new to-dos are pushed via textcard with a link straight to the approval detail, reusing silent login; in-card one-tap approval goes through callbacks and must be idempotent.
- **Key pitfalls**: trusted domain and enterprise trusted IP, iOS/Android signature URL differences, one-time code and state CSRF protection, never creating duplicate accounts, or-sign claiming, callbacks returning success within seconds, and centralized ticket caching.

Official documentation: [WeCom Developer Center](https://developer.work.weixin.qq.com/document/)

> The essence of this solution is "integration" rather than "rebuild": with minimal new code (one OAuth login endpoint, an account-mapping layer, a JS-SDK signature service, and a set of to-do push listeners), the years of accumulated attendance and Activiti approval capabilities appear smoothly in employees' WeCom with transparent automatic login. If check-in experience requirements increase later, a Mini Program check-in entry can be layered on top, sharing the same back-end accounts and workflow with H5 approval for smooth evolution.
