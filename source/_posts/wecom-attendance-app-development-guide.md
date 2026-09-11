---
title: "企业微信应用开发完全指南：已有考勤与 Activiti 审批系统的 H5 集成实战"
date: 2026-07-09 21:00:00
tags:
  - 企业微信
  - H5开发
  - 考勤系统
  - Activiti
  - 工作流
  - 单点登录
  - API对接
categories:
  - 技术实践
---

很多团队的企业微信开发并不是从零做一个新系统，而是面对这样一个更常见、也更现实的场景：**业务系统已经存在并且运行多年**——考勤模块早已上线，审批流基于 Activiti 实现了会签、或签、按组织架构逐级审批等复杂流程，审批过程还会回查和联动考勤数据。现在的诉求是：把这套系统搬到企业微信里，让员工在企微工作台点开就能用，**不用再输用户名密码，进来就是自己的考勤和待办**。

这种前提下，H5 应用模式往往是比小程序更合适的选择：现有系统本身就是 Angular + SpringBoot 的 Web 架构，H5 可以直接复用前端页面与后端接口，配合企业微信 OAuth2 网页授权（`snsapi_base`）实现完全静默的自动登录（免登），部署即生效、无需审核发版，审批表单频繁调整时迭代成本最低。

本文以「**已有考勤管理系统 + Activiti 复杂审批流**」为背景，**以 H5 模式为主线**，系统讲解：如何在不重写业务系统的前提下完成企业微信端集成，重点剖析 OAuth2 静默自动登录的完整链路、企业微信账号与系统账号的绑定映射、JS-SDK 设备能力调用，以及 Activiti 会签/或签/组织架构审批与考勤联动在企微端的落地（待办推送、卡片一键审批、组织架构同步）。

<!-- more -->

## 一、场景分析与模式选型

### 1.1 已有系统的前提假设

本文假设业务系统现状如下（这也是大多数中大型企业内部系统的典型形态）：

- **考勤管理**：已有完整的打卡、打卡记录、补卡申请、考勤统计功能，后端提供 REST API
- **审批流引擎**：基于 Activiti（6.x/7.x）实现，流程定义中包含：
  - **会签**：一个节点需要多人全部审批通过（如补卡需直属领导 + HR 都同意）
  - **或签**：一个节点多人中任意一人审批即可（如部门值班审批组）
  - **按组织架构审批**：审批人根据申请人所在部门动态确定（部门负责人 → 分管领导 → HRBP）
  - **考勤数据联动**：审批流程中会读取/回写考勤数据（如补卡审批通过后自动修正打卡记录，年假审批通过后扣减假期余额）
- **账号体系**：系统有自己的用户表、角色权限体系（如 Spring Security + JWT/Session）
- **前端**：已有 Web 端，Angular 单页应用（TypeScript）

要解决的核心问题只有两个：

1. **身份问题**：企业微信里进来的人是谁？如何与系统账号对应，实现自动登录？
2. **入口与触达问题**：如何从企微工作台进入应用？审批待办如何主动推送到员工企微？

业务逻辑（打卡规则、审批流转）**一行都不需要搬进企业微信**，企微只承担「入口 + 身份提供方（IdP）+ 消息通道」三个角色。

### 1.2 为什么这种场景首选 H5

| 对比维度 | H5 应用（本文方案） | 企业微信小程序 |
|----------|--------------------|----------------|
| 复用现有 Web 前端 | 直接复用现有 Angular 页面 | 需用 WXML/WXSS 重写全部页面 |
| 复用现有后端接口 | 直接复用，仅加一个 OAuth 登录端点 | 同样复用，但前端全部重做 |
| 自动登录 | OAuth2 `snsapi_base` 静默授权，全程无感 | `wx.qyLogin` 静默，也无感 |
| 发布迭代 | 部署即生效，审批表单随时改 | 需提审、发版，紧急修复慢 |
| 复杂表单/流程页 | Web 技术灵活，适合审批这类重表单页面 | 表单引擎类页面开发成本高 |
| 设备能力 | JS-SDK：定位/拍照/扫码（需签名） | 原生 API 直调，体验略好 |
| 审批流这种「低频、重表单、高频迭代」的业务 | 非常契合 | 偏重 |

**结论**：考勤打卡本身频率高、重设备能力，小程序体验确实更好；但在「**已有系统集成、审批流程复杂且经常调整、首要目标是低成本上线和自动登录**」的前提下，H5 的综合收益远大于体验上的微小差距。且 H5 同样可以通过 JS-SDK 调起定位、拍照、扫码，完全覆盖考勤场景。本文后续会给出 JS-SDK 的完整签名方案与 iOS/Android 踩坑处理。

> 若后期打卡体验要求进一步提升，也可以采用混合模式：同一个自建应用同时配置 H5 主页（审批、记录、统计）与小程序（打卡），消息卡片按业务类型分别跳转，后端账号体系完全共用。

### 1.3 整体架构

```
┌───────────────────────────────┐
│          企业微信客户端         │
│  工作台 / 消息卡片 / 扫一扫     │
└───────────────┬───────────────┘
                │ 打开 H5（内置 WebView）
                ▼
┌───────────────────────────────┐
│   H5 前端（复用现有 Web 工程）  │
│  Angular SPA + wx JS-SDK     │
│  路由守卫：无 token → 跳 OAuth  │
└───────────────┬───────────────┘
                │ HTTPS（JWT）
                ▼
┌───────────────────────────────────────────────────────┐
│                    现有业务后端（SpringBoot）            │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ WecomOAuth   │  │ 考勤模块      │  │ Activiti 审批  │ │
│  │ 免登/账号绑定 │  │ (已有，复用)  │  │ (已有，复用)   │ │
│  └──────┬───────┘  └──────────────┘  └───────┬───────┘ │
│         │              账号映射表 user_id ↔ wecom_userid │
└─────────┼────────────────────────────────────┼─────────┘
          ▼                                    ▼
┌───────────────────┐              ┌──────────────────────┐
│ 企业微信服务端 API  │              │ PostgreSQL / Redis   │
│ gettoken           │              │ 业务表 + act_* 工作流表│
│ auth/getuserinfo   │              └──────────────────────┘
│ jsapi_ticket       │
│ message/send 推送   │◀──── 审批待办产生时，后端主动推送卡片
└───────────────────┘
```

关键设计原则：**企业微信 userid 只是系统用户表上的一个外部身份字段**，考勤、Activiti 的候选人/办理人仍然使用系统内部 userId（或与 userid 统一，见 4.6 节讨论），这样企业微信只是新增的一种登录方式，不会侵入已有的权限和工作流模型。

> 上图把 H5 前端、企微适配逻辑与业务后端画在同一侧，是为了说明调用关系。如果你的考勤系统部署在内网隔离区、企业微信和外网手机无法直接访问，则需要在 DMZ 单独部署一个公网中转网关（企微适配逻辑放网关，业务仍留内网，两侧用 mTLS + 内部令牌受控互通），详见**第九章「网络隔离下的公网中转网关」**。

## 二、开发环境搭建

### 2.1 创建自建应用并获取三要素

1. 访问 [企业微信管理后台](https://work.weixin.qq.com/)，用管理员账号登录
2. 「应用管理」→「自建」→「创建应用」，填写应用名称（如「移动考勤审批」）、logo、可见范围
3. 创建后记录三个关键参数：

| 参数 | 说明 | 获取位置 |
|------|------|----------|
| `corpid` | 企业唯一标识 | 我的企业 → 企业信息 → 企业 ID |
| `agentid` | 应用唯一标识 | 应用管理 → 自建应用 → AgentId |
| `secret` | 应用密钥 | 应用管理 → 自建应用 → Secret |

> ⚠️ `secret` 是最高敏感凭证，**只保存在服务端**，绝不能出现在 H5 前端代码、Git 仓库或浏览器请求中。

### 2.2 配置应用主页（H5 入口）

在应用详情页「应用主页」处配置 H5 首页地址：

```
应用管理 → 自建应用 → 应用主页 → 配置网页
  主页 URL：https://attendance.yourcompany.com/mobile/
```

员工在企微工作台点击应用图标，就是在企微内置浏览器中打开这个 URL。建议 H5 移动端使用独立路径（如 `/mobile/`），与 PC 管理端区分，便于做路由分流和独立布局。

### 2.3 配置可信域名（H5 最关键的后台配置）

H5 模式下，OAuth 网页授权回调域名和 JS-SDK 都依赖「可信域名」：

```
应用管理 → 自建应用 → 开发者接口 → 网页授权及JS-SDK
  → 设置可信域名：attendance.yourcompany.com
  → 下载域名归属校验文件（WW_verify_xxxx.txt）
  → 将文件放置在域名根目录，确保可访问：
    https://attendance.yourcompany.com/WW_verify_xxxx.txt
```

域名要求：

- 必须 **HTTPS**（OAuth 授权与 JS-SDK 强制要求）
- 已完成 ICP 备案（中国大陆服务器）
- 域名归属校验文件由前端静态资源服务或 Nginx 直接托管
- 一个应用可配多个可信域名（域名主体需一致），回调地址必须落在这些域名下

另外配置「企业可信 IP」：调用服务端 API 的服务器出口 IP 需要加入白名单，否则 `gettoken` 等接口会报 `60020 not allow to access from your ip`。

### 2.4 配置消息接收（回调，用于卡片按钮审批）

如果要实现「消息卡片上直接点同意/拒绝」（无需打开页面），需配置回调：

```
应用管理 → 自建应用 → 接收消息 → 设置 API 接收
  URL:             https://attendance.yourcompany.com/api/wecom/callback/message
  Token:           自定义（用于签名校验）
  EncodingAESKey:  随机生成（用于消息体 AES 加解密）
```

仅做待办跳转、不做卡片内交互的话可以暂不配置，但建议一开始就配好（第七章会用到）。

### 2.5 本地开发环境

H5 本地开发的核心难点是：OAuth 回调和 JS-SDK 要求可信域名 + HTTPS，而本地是 `http://localhost`。常用方案有两种。

**方案一：内网穿透（推荐，最接近真实环境）**

```bash
# 使用 frp 或 ngrok，把本地 8080/前端端口映射到备案域名的子路径
# 例如映射出 https://dev-attendance.yourcompany.com
frpc -c frpc.ini

# Angular dev server 允许宿主域名访问（angular.json）
# serve 选项：host 设为 0.0.0.0，默认端口 4200
# angular.json -> projects/<name>.architect.serve.options
{ "host": "0.0.0.0", "port": 4200 }
# 或命令行：ng serve --host 0.0.0.0 --port 4200
```

将穿透域名加入管理后台可信域名（开发阶段），把校验文件放到本地静态目录即可通过校验。

**方案二：hosts + mkcert（无需公网，适合纯页面联调）**

```bash
mkcert -install
mkcert attendance.yourcompany.com        # 生成本地受信证书
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

> 注意：hosts 方案只能骗过浏览器的证书校验，企业微信客户端的 OAuth 授权仍会走到真实的企业微信服务器再回跳，手机真机调试时手机无法使用你电脑的 hosts。所以**真机调试必须用内网穿透域名**。

**后端本地启动**：

```bash
cd ~/work/code/attendance-backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

## 三、H5 前端工程接入

### 3.1 目录结构（复用现有 Angular 工程，新增移动端模块）

不需要新建工程。在现有 Angular + TypeScript 工程中新增一个移动端懒加载模块（feature module / routes）与企微适配层即可：

```
attendance-web/
├── src/
│   ├── main.ts
│   ├── index.html                   # 也可在此 <script> 引入 jweixin
│   ├── app/
│   │   ├── app.routes.ts            # 路由总入口（PC/移动分流）
│   │   ├── mobile/                  # 企微内 H5 移动端（懒加载模块）
│   │   │   ├── mobile.routes.ts     # 移动端子路由
│   │   │   ├── guards/
│   │   │   │   └── wecom-auth.guard.ts   # 免登路由守卫（CanActivate）
│   │   │   └── pages/
│   │   │       ├── checkin/checkin.component.ts      # 打卡首页
│   │   │       ├── records/records.component.ts      # 打卡记录
│   │   │       ├── todo/todo-list.component.ts       # 审批待办（Activiti tasks）
│   │   │       ├── todo/approval-detail.component.ts # 审批详情（会签/或签进度）
│   │   │       ├── apply/makeup-apply.component.ts   # 补卡申请（触发流程）
│   │   │       └── oauth/oauth-callback.component.ts # OAuth 回调落地页
│   │   ├── core/
│   │   │   ├── interceptors/
│   │   │   │   └── auth.interceptor.ts   # HttpClient 拦截器（注入 JWT、401 重登）
│   │   │   └── services/            # 复用现有业务 Service
│   │   │       ├── checkin.service.ts
│   │   │       └── approval.service.ts
│   │   └── wecom/                   # 企微适配层（本次新增的核心）
│   │       ├── env.service.ts       # 是否企微环境、UA 判断
│   │       ├── oauth.service.ts     # OAuth2 免登跳转逻辑
│   │       ├── jssdk.service.ts     # wx.config / agentConfig / 签名
│   │       └── device.service.ts    # 定位、拍照、扫码封装
├── public/ （或 src/）
│   └── WW_verify_xxxx.txt           # 域名归属校验文件（放静态资源根）
└── angular.json
```

### 3.2 引入企业微信 JS-SDK

企业微信 H5 使用 `jweixin` 模块（与微信公众号 JSSDK 同源，企业微信在其上扩展了 `wx.agentConfig` 和企业专有接口）：

```bash
npm install weixin-js-sdk --save
# 或直接 index.html 引入
# <script src="https://res.wx.qq.com/open/js/jweixin-1.2.0.js"></script>
```

```typescript
// src/app/wecom/env.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WecomEnvService {
  /** 当前是否运行在企业微信客户端内 */
  isInWecom(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    // 企业微信 UA 同时包含 wxwork 与 micromessenger
    return /wxwork/.test(ua) && /micromessenger/.test(ua);
  }

  /** 是否 iOS（JS-SDK 签名 URL 处理有差异，见第五章） */
  isIOS(): boolean {
    return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  }
}
```

### 3.3 路由与免登守卫

移动端所有业务路由都挂在同一个 `CanActivate` 守卫下：没有系统 token 就发起 OAuth 免登，登录成功后回到原页面。这是实现「点开应用自动登录」的总开关，第四章详细展开。

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
  // OAuth 回调落地页：不挂守卫
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

  // 核心：确保已登录；未登录时 redirectToWecomAuth 内部触发整页跳转到 OAuth
  if (oauth.hasToken()) {
    return true;
  }
  oauth.redirectToWecomAuth(state.url);   // 会离开当前页
  return new Promise<boolean>(() => false); // 阻塞本次导航，等待整页跳转
};
```

在根路由中以 `mobile` 路径懒加载整个移动端模块：

```typescript
// src/app/app.routes.ts
export const APP_ROUTES: Routes = [
  {
    path: 'mobile',
    loadChildren: () => import('./mobile/mobile.routes').then(m => m.MOBILE_ROUTES),
  },
  // ...PC 管理端路由
];
```
## 四、OAuth2 静默自动登录（免登）完整链路

这是整个集成的核心。目标效果：员工在企微里点应用图标（或点审批消息卡片），页面打开过程中**没有任何登录页、没有任何确认按钮**，一两秒后直接落在业务页面，且后端已经知道"他是系统里的哪个人"。

### 4.1 授权模式选型：snsapi_base

企业微信网页授权支持两种 scope：

| scope | 是否弹确认 | 能拿到什么 | 适用 |
|-------|-----------|-----------|------|
| `snsapi_base` | **静默，无任何弹窗** | 仅成员 userid（经后端换取） | 企业内部应用自动登录，**本文采用** |
| `snsapi_privateinfo` | 需用户手动确认 | userid + 敏感信息（手机/邮箱等，需成员授权） | 极少数需要额外采集隐私字段的场景 |

企业内部自建应用、应用可见范围已覆盖使用者时，`snsapi_base` 在企微客户端内是完全静默的——这正是自动登录的基础。我们不需要在这一步拿手机号邮箱（那些通过服务端通讯录 API 用 userid 查即可），所以一律用 `snsapi_base`。

### 4.2 全流程时序

```
企微客户端          H5 前端(WebView)        业务后端              企微服务端
    │                   │                     │                     │
    │ 打开应用主页        │                     │                     │
    │──────────────────▶│                     │                     │
    │                   │ 路由守卫：无 token    │                     │
    │                   │ 302 跳授权链接        │                     │
    │◀──────────────────│                     │                     │
    │ 静默授权(无感知)    │                     │                     │
    │───────────────────────────────────────▶│                     │
    │ 302 回跳 callback?code=xxx&state=yyy    │                     │
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
    │                   │                     │ userid→查/建系统账号 │
    │                   │                     │ 签发 JWT            │
    │                   │◀────────────────────│                     │
    │                   │ 存 token，跳回目标页  │                     │
    │                   │ 后续请求带 JWT       │                     │
```

注意两个关键点：

1. **code 只在后端换**：前端永远不直接调企微 API（会暴露 secret）。前端只负责"引导跳转"和"把回跳 URL 上的 code 交给后端"。
2. **授权链接由前端拼还是后端拼都行**，但 `state` 防 CSRF 和"登录后回跳原页面"的逻辑必须自己管。

### 4.3 第一步：构造授权链接并跳转

授权链接格式：

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

| 参数 | 说明 |
|------|------|
| `appid` | 企业 corpid（注意这里虽然叫 appid，填的是 corpid） |
| `redirect_uri` | 授权后回跳地址，需 URL Encode，必须在可信域名下 |
| `response_type` | 固定 `code` |
| `scope` | `snsapi_base` |
| `agentid` | 自建应用 agentid（**必须带**，否则在某些版本拿不到该应用身份） |
| `state` | 自定义参数，企微原样带回；用于防 CSRF + 携带回跳目标路径 |
| `#wechat_redirect` | 固定后缀，必须以 hash 形式结尾 |

前端封装为可注入的 `WecomOAuthService`（`src/app/wecom/oauth.service.ts`）：

```typescript
import { Injectable, inject } from '@angular/core';
import { WecomEnvService } from './env.service';

@Injectable({ providedIn: 'root' })
export class WecomOAuthService {
  private readonly env = inject(WecomEnvService);

  private readonly CORP_ID = 'ww your_corpid';        // corpid 不属于高敏感信息，可放前端
  private readonly AGENT_ID = '1000002';              // agentid 同样可公开
  private readonly CALLBACK =
    'https://attendance.yourcompany.com/mobile/oauth/callback';

  hasToken(): boolean {
    return !!localStorage.getItem('sys_token');
  }

  /** 生成随机 state，同时把“登录后要去的页面”暂存 sessionStorage */
  private buildState(redirectPath: string): string {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(`wx_state_${nonce}`, redirectPath || '/mobile/checkin');
    sessionStorage.setItem('wx_state_nonce', nonce);   // 回调时校验
    return nonce;
  }

  /** 发起免登：整页跳转到企业微信授权地址 */
  redirectToWecomAuth(redirectPath: string): void {
    if (!this.env.isInWecom()) {
      // 非企微环境（如 PC 浏览器直接打开），走系统账号密码登录页
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

路由守卫只需调用 `hasToken()` 判断、未登录则 `redirectToWecomAuth()`（见 3.3 的 `WecomAuthGuard`）。

> corpid、agentid 是"公开标识"（授权链接本来就要在浏览器里明文出现），放前端无妨；真正的密钥只有 secret，它永远只在服务端。

### 4.4 第二步：回调落地页拿 code 换 token

回跳到 `/mobile/oauth/callback?code=xxx&state=yyy` 后，回调页做三件事：校验 state → 把 code 发给后端 → 拿到 JWT 后跳回原目标页。

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

  protected errMsg = signal('正在登录...');

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code') ?? '';
    const state = this.route.snapshot.queryParamMap.get('state') ?? '';

    if (!code) { this.errMsg.set('授权失败：缺少 code'); return; }

    // 1. 校验 state，防 CSRF：必须是我们跳转前存过的 nonce
    const savedNonce = sessionStorage.getItem('wx_state_nonce');
    if (!state || state !== savedNonce) {
      this.errMsg.set('登录态校验失败，请重新进入应用');
      return;
    }
    const redirectPath = sessionStorage.getItem(`wx_state_${state}`) || '/mobile/checkin';

    try {
      // 2. code 交给后端换取系统 JWT
      const { token } = await firstValueFrom(this.auth.loginByWecomCode(code));
      localStorage.setItem('sys_token', token);
      sessionStorage.removeItem(`wx_state_${state}`);
      sessionStorage.removeItem('wx_state_nonce');
      // 3. 回到原本想去的页面（可能是某条审批待办详情）
      this.router.navigateByUrl(redirectPath, { replaceUrl: true });
    } catch (e: any) {
      this.errMsg.set('自动登录失败：' + (e?.message || '请重试'));
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

  /** code 换 JWT：这是少数几个不需要 token 的接口（拦截器中放行） */
  loginByWecomCode(code: string): Observable<WecomLoginResp> {
    return this.http
      .post<{ code: number; message: string; data: WecomLoginResp }>(
        '/api/auth/wecom/login', { code })
      // 拆开后端统一响应信封 { code, message, data }（错误码处理可放拦截器统一做）
      .pipe(map((resp) => resp.data));
  }
}
```

### 4.5 第三步：后端用 code 换 userid（身份认证核心）

后端收到 code 后，要先拿 access_token，再调两次接口：

- `auth/getuserinfo`：code → userid（企业内部成员）或 openid（非企业成员/外部联系人）
- 拿到 userid 后，如有需要再用 `user/get`（通讯录）补全姓名、部门、手机号

**接口一：获取访问凭证**

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

返回 `access_token`（有效期 7200 秒）。access_token 必须集中管理（Redis 缓存 + 分布式锁，见第八章），前端和其他服务都不自行获取。

**接口二：code 换 userid**

```
GET https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=TOKEN&code=CODE
```

企业内部成员返回：

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "userid": "zhangsan",
  "user_ticket": "xxx"
}
```

> 若返回的是 `openid` 而没有 `userid`，说明当前使用者不在该企业应用的可见范围内（可能是外部联系人），应拒绝登录并提示联系管理员开通权限，而不是自动建号。

**登录 Controller**：

```java
/**
 * 企业微信 H5 免登
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
     * H5 OAuth 静默登录：code 换 userid，绑定系统账号后签发 JWT
     */
    @PostMapping("/login")
    public Result<WecomLoginVO> login(@RequestBody @Valid WecomLoginDTO dto) {
        log.info("企业微信 H5 免登，code={}", dto.getCode());
        WecomLoginVO vo = wecomAuthService.loginByCode(dto.getCode());
        return Result.success(vo);
    }
}
```

```java
/**
 * 企业微信免登 Service
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
        // 1. code 换 userid
        String accessToken = tokenManager.getAccessToken();
        String url = String.format(
                "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=%s&code=%s",
                accessToken, code);

        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_AUTH_FAILED,
                    "企业微信身份获取失败：" + (resp == null ? "null" : resp.getString("errmsg")));
        }

        String wecomUserId = resp.getString("userid");
        if (StrUtil.isBlank(wecomUserId)) {
            // 只有 openid：非企业内部成员，不在应用可见范围
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE,
                    "当前账号不在应用授权范围，请联系管理员");
        }

        // 2. userid 映射系统账号（关键，见 4.6）
        SysUser user = userService.getOrBindByWecomUserId(wecomUserId);
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "账号已停用");
        }

        // 3. 签发系统自有 JWT，复用现有认证体系
        String jwt = jwtTokenProvider.generateToken(user.getId(), user.getUsername());
        return WecomLoginVO.builder()
                .token(jwt)
                .userInfo(UserInfoVO.of(user))
                .build();
    }
}
```

### 4.6 第四步：企业微信账号与系统账号绑定（已有系统最关键的设计）

这是"已有业务系统"和"从零做系统"最大的区别：系统里早就有一批账号（可能用工号、邮箱、域账号登录），企微进来的只有一个 userid。**不能简单地"拿 userid 新建一个用户"**，否则同一个人会变成两个账号，考勤记录、Activiti 待办全部对不上。

推荐三种绑定策略，按企业实际选择：

**策略 A：工号/账号一致，自动绑定（最推荐，零运维）**

企业微信通讯录中的"账号"字段通常就是企业统一的工号，且企微 userid 往往也用工号。约定 userid = 系统 username（或工号），登录时直接按账号关联：

```java
/**
 * 按企业微信 userid 绑定系统账号
 * 约定：企微 userid 与系统工号(username)一致
 */
public SysUser getOrBindByWecomUserId(String wecomUserId) {
    // 1. 先按已绑定的 wecom_user_id 查
    SysUser user = userMapper.findByWecomUserId(wecomUserId);
    if (user != null) {
        return user;
    }

    // 2. 未绑定：尝试按工号(username)自动匹配已有账号
    user = userMapper.findByUsername(wecomUserId);
    if (user != null) {
        // 建立绑定关系，下次直接命中
        user.setWecomUserId(wecomUserId);
        userMapper.updateById(user);
        log.info("系统账号 {} 自动绑定企业微信 userid {}", user.getUsername(), wecomUserId);
        return user;
    }

    // 3. 仍匹配不到：不要静默建号。返回需引导绑定的状态，由管理员或自助绑定流程处理
    throw new BusinessException(ErrorCode.WECOM_ACCOUNT_NOT_BOUND,
            "未找到与企业微信账号关联的系统账号，请联系管理员绑定");
}
```

**策略 B：自助绑定（账号体系不统一时）**

第一次登录时若无法自动匹配，让用户输入一次系统账号密码完成绑定，之后该 wecom_user_id 与 user_id 的映射落库，永久免登：

```
首次企微登录 → 后端发现无映射 → 返回 NEED_BIND 状态
  → H5 显示绑定页（输入系统账号/密码，或输工号+短信验证码）
  → 后端校验通过 → 写入 sys_user.wecom_user_id → 签发 JWT
```

绑定关系只建立一次，凭据校验完即弃，不落明文密码。

**策略 C：管理员预绑定 / 通讯录同步**

通过通讯录 API（`user/list`）按部门批量同步，把企微 userid 与系统账号按工号对齐（第八章给出同步方案）。适合上线前一次性初始化。

**用户表改造**（在现有用户表上加字段，不动既有结构）：

```sql
ALTER TABLE sys_user ADD COLUMN wecom_user_id VARCHAR(64);
COMMENT ON COLUMN sys_user.wecom_user_id IS '企业微信 userid（外部身份）';
CREATE UNIQUE INDEX uk_sys_user_wecom ON sys_user (wecom_user_id) WHERE wecom_user_id IS NOT NULL;
```

> 设计要点：**内部 userId 保持不变**。考勤记录外键、Activiti 的 `ACT_RU_TASK.ASSIGNEE_`、候选人组全部继续使用系统内部 userId（username）。企微 userid 只用于"登录时认人"和"推送时寻址"，通过 `sys_user.wecom_user_id` 这一层映射解耦。这样既不污染工作流定义，也保留了 PC 账号密码、其他 SSO 等登录方式并存的能力。

### 4.7 第五步：JWT 与现有认证体系无缝衔接

免登拿到 userid 后，后续请求和 PC 端完全一样，都走系统已有的 JWT/Session 认证。这样考勤、审批接口零改造。

前端用 Angular 的 `HttpInterceptor` 统一注入 token、401 时重新免登：

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
        // token 过期：企微内重新静默免登（无感），外部环境跳登录页
        localStorage.removeItem('sys_token');
        const env = inject(WecomEnvService);
        if (env.isInWecom()) {
          location.reload();   // 路由守卫会自动再次发起 OAuth
        } else {
          location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
        }
      }
      return throwError(() => error);
    }),
  );
};
```

在 `app.config.ts` 中注册（函数式拦截器，Angular 15+）：

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

> 免登接口 `/api/auth/wecom/login` 本身不带 token，拦截器对"本地存储无 token"的情况会原样放行，无需特殊判断；只有 401 时才触发重新免登。

后端沿用现有 Spring Security 配置（SecurityFilterChain Bean 形式），只把企微登录端点和回调端点放行：

```java
/**
 * Spring Security 安全配置
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
                        "/api/auth/wecom/**",      // 企微免登
                        "/api/wecom/callback/**"   // 企微回调
                ).permitAll()
                .anyRequest().authenticated()
            )
            // 前后端分离 + JWT：无状态、关闭 CSRF，JWT 过滤器解析令牌
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter(),
                    UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
    // JwtAuthenticationFilter：解析 Authorization 头并写入 SecurityContext，沿用现有实现
}
```

> 若你的项目仍使用 Spring Security 5.x 的 `WebSecurityConfigurerAdapter`，等价写法是重写 `configure(HttpSecurity)`，对同样两个路径 `permitAll()` 并 `csrf().disable()`；免登签发的 JWT 由现有 JWT 过滤器统一校验，与账号密码登录完全共用。

至此，"点开应用 → 自动登录 → 直接看到自己的考勤和待办"的链路完整打通，且**考勤与 Activiti 的所有既有接口、权限、数据一行未改**。
## 五、JS-SDK：在 H5 中使用定位、拍照、扫码

考勤场景离不开定位、拍照、扫码。H5 不能像小程序那样直接调原生 API，需要通过企业微信 JS-SDK 经签名鉴权后调用。这一章给出可直接落地的签名方案，并重点处理最容易踩坑的 iOS/Android 签名 URL 差异。

### 5.1 wx.config 与 wx.agentConfig

企业微信 JS-SDK 有两层配置，新手最容易混淆：

| 配置 | 用途 | 签名票据 |
|------|------|----------|
| `wx.config` | 注入基础配置，调起通用能力（分享、定位 `getLocation`、扫码 `scanQRCode`、选择图片等大部分接口） | 用 `jsapi_ticket` 签名 |
| `wx.agentConfig` | 注入当前**自建应用**身份，调起企业微信专有接口（如 `selectEnterpriseContact` 选人、部分审批相关接口） | 用 `get_jsapi_ticket`（企业应用票据）签名 |

考勤打卡的定位/拍照/扫码，`wx.config` 通过即可；只有"按组织架构选择审批人/抄送人选人器"这类企业专有能力才需要再 `agentConfig`。

### 5.2 后端：jsapi_ticket 管理与签名

`jsapi_ticket` 用 access_token 换取，有效期 7200 秒，同样需要集中缓存：

```
GET https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=TOKEN
```

企业应用 agentConfig 用的票据接口是 `ticket/get?type=agent_config`。

签名算法（企业微信规定）：

```
string1 = jsapi_ticket={ticket}&noncestr={nonce}&timestamp={timestamp}&url={当前页面URL}
signature = SHA1(string1)
```

```java
/**
 * JS-SDK 签名 Service
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

    /** 获取 jsapi_ticket（缓存，逻辑同 access_token，略去分布式锁，见 8.1） */
    public String getJsapiTicket() {
        String cached = redisTemplate.opsForValue().get(JSAPI_TICKET_KEY);
        if (StrUtil.isNotBlank(cached)) {
            return cached;
        }
        String token = tokenManager.getAccessToken();
        String url = "https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=" + token;
        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR, "获取 jsapi_ticket 失败");
        }
        String ticket = resp.getString("ticket");
        redisTemplate.opsForValue().set(JSAPI_TICKET_KEY, ticket, 7100, TimeUnit.SECONDS);
        return ticket;
    }

    /**
     * 生成 wx.config 所需签名
     * @param pageUrl 前端传来的、用于签名的页面 URL（见 5.3 关于 iOS 的特殊处理）
     */
    public WxConfigSignatureVO buildConfigSignature(String pageUrl) {
        String ticket = getJsapiTicket();
        String nonceStr = IdUtil.fastSimpleUUID();
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);

        // 注意：参与签名的 url 必须与前端 location.href 完全一致（含 hash 处理规则，见下）
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

    /** 前端进入页面后，用当前 URL 换取签名 */
    @GetMapping("/config")
    public Result<WxConfigSignatureVO> config(@RequestParam("url") String url) {
        return Result.success(jsapiService.buildConfigSignature(url));
    }
}
```

### 5.3 前端：签名初始化（重点处理 iOS 入口页问题）

JS-SDK 最经典的坑：**Android 用当前页 URL 签名，iOS（WKWebView）用首次进入应用时的入口页 URL 签名**。在 SPA 里前端路由切换不会真正刷新页面，iOS 下如果用"当前路由的 href"去签名，只要不是落地的第一个页面，`wx.config` 必报 `invalid signature`。

统一解法：**在入口页把第一次的 URL 记下来，之后所有签名都用它（iOS）；Android 始终用当前 URL。**

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

  /** 取参与签名的 URL：去掉 #hash 部分（企业微信签名规则 url 不含 hash） */
  private signableUrl(href: string): string {
    const idx = href.indexOf('#');
    return idx >= 0 ? href.slice(0, idx) : href;
  }

  /** 记录入口页 URL（仅 iOS 需要，需在应用一启动、路由跳转之前调用一次） */
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
    return this.signableUrl(location.href);   // Android 用当前页
  }

  /** 保证 wx.config 完成（全局只需一次，SPA 内可复用） */
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
          beta: true,                 // 必须！企业微信专有接口需 beta:true
          debug: false,
          appId: cfg.corpId,
          agentId: cfg.agentId,
          timeStamp: cfg.timestamp,
          nonceStr: cfg.nonceStr,
          signature: cfg.signature,
          jsApiList: ['getLocation', 'chooseImage', 'scanQRCode'],
        });
        wx.ready(() => resolve());
        wx.error((res: any) => reject(new Error('wx.config 失败: ' + res.errMsg)));
      });
    })();

    return this.configPromise;
  }
}
```

在应用启动时（路由首次跳转之前）尽早记录 iOS 入口 URL，可用 `APP_INITIALIZER`：

```typescript
// src/app/app.config.ts 中注册启动初始化
import { APP_INITIALIZER } from '@angular/core';

function recordWxEntryUrl() {
  const jssdk = inject(WecomJssdkService);
  const env = inject(WecomEnvService);
  return () => {
    // 调一次 ensureWxConfig 的入口记录逻辑（iOS 会在首次跳转前固化落地页 URL）
    if (env.isInWecom()) {
      // 预热 wx.config；不阻塞也可，真正调用定位/扫码时 service 内部仍会兜底
      jssdk.ensureWxConfig().catch(() => void 0);
    }
  };
}

// providers 中加入：
// { provide: APP_INITIALIZER, useFactory: recordWxEntryUrl, multi: true }
```

> 关键点是 iOS 的入口 URL 必须在任何前端路由跳转发生之前读取 `location.href` 固化下来。放在 `APP_INITIALIZER`（Angular 路由启动前执行）最稳妥；若不预热签名，至少也要在该钩子里把入口 URL 写入 sessionStorage。

> 路由模式建议：为减少 hash 与签名的心智负担，H5 移动端可用 **history 模式**；若用 hash 模式，务必按上面 `signableUrl` 在 `#` 处截断，保证前后端参与签名的 URL 完全一致，且都用 `encodeURIComponent` / 都不编码，保持一致。

### 5.4 地理定位打卡

```typescript
// src/app/wecom/device.service.ts
import { Injectable, inject } from '@angular/core';
import wx from 'weixin-js-sdk';
import { WecomJssdkService } from './jssdk.service';

export interface LngLat { longitude: number; latitude: number; accuracy: number; }

@Injectable({ providedIn: 'root' })
export class WecomDeviceService {
  private jssdk = inject(WecomJssdkService);

  /** JS-SDK 定位（gcj02 火星坐标，与国内地图一致） */
  getLocation(): Promise<LngLat> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res: any) => resolve({
          longitude: res.longitude,
          latitude: res.latitude,
          accuracy: res.accuracy,
        }),
        fail: (err: any) => reject(new Error('定位失败，请检查定位权限：' + err.errMsg)),
      });
    }));
  }

  /** 调起相机拍照（仅相机，不可相册，防作弊），返回 localId */
  takePhoto(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera'],
        sizeType: ['compressed'],
        success: (res: any) => resolve(res.localIds[0]),
        fail: (err: any) => reject(new Error('拍照失败：' + err.errMsg)),
      });
    }));
  }

  /** 扫一扫（工位/会议室二维码打卡） */
  scanQRCode(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.scanQRCode({
        needResult: 1,              // 1=由前端拿结果自行处理
        scanType: ['qrCode'],
        success: (res: any) => resolve(res.resultStr),
        fail: (err: any) => reject(new Error('扫码失败：' + err.errMsg)),
      });
    }));
  }
}

/** Haversine 距离（米），纯函数可放公共 utils */
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

打卡组件调用（`checkin.component.ts`），提示用团队既有 UI 库（如 NG-ZORRO 的 `NzMessageService`）：

```typescript
// src/app/mobile/pages/checkin/checkin.component.ts（节选）
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
      this.msg.error(`不在打卡范围，距公司 ${Math.round(dist)} 米`);
      return;
    }
    await firstValueFrom(this.checkinApi.submit({
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      distance: Math.round(dist),
    }));
    this.msg.success('打卡成功');
  }
}
```

后端打卡接口与系统现有实现一致（距离二次校验、防重复打卡、落库、推送），这些逻辑早已存在，H5 只是一个新的调用方。后端**必须重新校验距离**，不能信任前端传入的经纬度（前端坐标可被抓包篡改）。

### 5.5 拍照打卡与扫码打卡

拍照、扫码已在 5.4 的 `WecomDeviceService` 中封装（`takePhoto()` 返回 localId、`scanQRCode()` 返回二维码内容），组件里直接 await 调用即可。`takePhoto` 拿到的 localId 图片需要再上传：

- `wx.uploadImage` 先把图片上传到企业微信得到 `serverId`，后端再调企微媒体接口 `media/get` 拉回内网——适合不想在 H5 里直传文件的场景；
- 或把 localId 绘制到 canvas 转成 Blob，用 Angular 的 `FormData` + `HttpClient` 直接 POST 到现有文件服务，复用系统既有的附件存储。

两种方式后端都沿用既有的照片存储与水印（时间+位置+设备信息）逻辑。扫码打卡后端校验二维码 token 有效性、过期时间，并叠加定位双重校验，同样复用现有接口。
## 六、Activiti 复杂审批流在企微端的落地

考勤相关的审批（补卡、请假、外勤、加班申诉等）流程已经在 Activiti 里定义并跑通，企微端不需要重新实现流程，只需要做三件事：**把待办搬出来、把审批操作接进去、把待办主动推到企微**。这一章结合会签、或签、按组织架构审批三种典型节点说明如何复用。

### 6.1 先统一办理人标识

Activiti 用一个字符串标识任务办理人（`ACT_RU_TASK.ASSIGNEE_`）或候选人/组（`ACT_RU_IDENTITYLINK`）。务必保证：**流程定义里写死的或运行时计算出的办理人标识，与 `sys_user.username`（内部账号，也就是绑定到 wecom_user_id 的那个唯一键）一致**。

推荐统一用工号/用户名（如 `zhangsan`）作为全系统唯一人员标识：

- Activiti assignee / candidateUser = `sys_user.username`
- 企微映射 = `sys_user.wecom_user_id`（很多企业也是工号，二者可能相同，但逻辑上分开）
- 推送企微消息时：`username → 查 sys_user → 拿 wecom_user_id` 作为 `touser`

这样 Activiti 的流程定义、UEL 表达式、候选人查询都不用为企微做任何改动。

### 6.2 三种典型节点在流程定义中的表达

以"补卡申请"流程为例，演示会签、或签、按组织架构审批在 BPMN 中的写法。

**会签（多人全部同意才通过）**——用多实例节点（multiInstanceLoopCharacteristics）+ 完成条件：

```xml
<userTask id="countersignLeaderHr" name="直属领导与HR会签">
  <documentation>所有人都审批，且都同意才通过；任一驳回即结束</documentation>
  <multiInstanceLoopCharacteristics isSequential="false"
                                   activiti:collection="${countersignUsers}"
                                   activiti:elementVariable="approver">
    <completionCondition>${approveResultList.size() == nrOfInstances
        &amp;&amp; !approveResultList.contains('REJECT')}</completionCondition>
  </multiInstanceLoopCharacteristics>
  <userTask><extensionElements/></userTask>
</userTask>
```

- `isSequential="false"`：并行会签，同时给每个人生成一个 task
- `nrOfInstances`：会签总人数；`approveResultList`：流程变量，收集每个人的审批结论
- 完成条件：所有人都处理完，且没有 REJECT 才往下走

**或签（多人中任意一人处理即可）**——同样是多实例，但完成条件改成"处理 1 个就结束"，更常见的做法是用候选人（candidateUsers），一个任务多人可见，谁签收谁办：

```xml
<userTask id="orSignDuty" name="值班组或签" activiti:candidateUsers="${dutyGroupUsers}">
  <documentation>候选组中任一人签收并审批即可</documentation>
</userTask>
```

或用多实例 + `nrOfCompletedInstances >= 1` 实现每人一个待办、一人办理后其余自动取消。

**按组织架构动态审批**——办理人不写死，由流程表达式从组织架构实时计算（申请人 → 直属部门负责人 → 分管领导）：

```xml
<userTask id="deptLeaderApprove" name="部门负责人审批"
          activiti:assignee="${orgService.findLeader(applyUserId)}"/>
<userTask id="directorApprove" name="分管领导审批"
          activiti:assignee="${orgService.findDirector(applyUserId)}"/>
```

`orgService` 是注册进 Activiti 表达式上下文的 Spring Bean，内部按部门树向上查负责人。部门负责人调岗后，新流程实例自动按最新组织架构路由，无需改流程定义。

> 这套 BPMN 在 PC 端已经能跑。企微端只是新增一个"办理入口"，办理动作底层调的还是同一套 `taskService.complete()`，因此会签计数、或签签收、组织路由、网关条件全部由引擎保证一致，不存在"PC 走的流程和手机走的流程不一样"的问题。

### 6.3 企微端待办列表与详情

**待办列表**——直接用 Activiti 的 TaskQuery，按当前登录人的 username 查待办（会签时每个人各自有一条 task；或签候选人任务用 taskCandidateUser 查）：

```java
/**
 * 移动端审批 Service（复用 Activiti TaskService）
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

    /** 当前用户的待办（含直接指派 + 或签候选、未签收） */
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
                .candidate(Objects.isNull(task.getAssignee()))  // 或签未签收
                .build();
    }
}
```

**审批详情**——展示表单、会签进度（谁已同意、谁待处理）、审批意见时间线：

```java
/** 会签进度：从历史任务 + 当前任务汇总每个办理人的状态 */
public List<ApproverProgressVO> countersignProgress(String processInstanceId) {
    List<HistoricTaskInstance> done = historyService.createHistoricTaskInstanceQuery()
            .processInstanceId(processInstanceId)
            .finished()
            .list();
    List<Task> pending = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .list();
    // 合并：done 带审批意见（COMMENT），pending 标为"待审批"
    // 省略拼装，返回 [{user, userName, status: APPROVED/REJECTED/PENDING, comment, time}]
    return mergeProgress(done, pending);
}
```

前端 `ApprovalDetailComponent` 根据 `nodeType` 渲染：会签显示多头像进度条（已办/待办），或签显示"值班组成员均可审批，点击签收办理"。

### 6.4 签收（或签）与审批操作

或签的候选任务必须先签收（claim）成为 assignee 才能办理；会签任务是直接指派，跳过签收。

```java
@Transactional(rollbackFor = Exception.class)
public void approve(String taskId, String username, boolean agree, String comment) {
    Task task = taskService.createTaskQuery().taskId(taskId).active().singleResult();
    if (task == null) {
        throw new BusinessException(ErrorCode.TASK_NOT_FOUND, "待办不存在或已处理");
    }

    // 或签：候选人任务先签收
    if (task.getAssignee() == null) {
        boolean isCandidate = taskService.createTaskQuery()
                .taskId(taskId).taskCandidateUser(username).count() > 0;
        if (!isCandidate) {
            throw new BusinessException(ErrorCode.NO_PERMISSION, "您无权办理此任务");
        }
        taskService.claim(taskId, username);
    } else if (!username.equals(task.getAssignee())) {
        throw new BusinessException(ErrorCode.NO_PERMISSION, "该任务不属于您");
    }

    // 记录审批意见
    Authentication.setAuthenticatedUserId(username);
    taskService.addComment(taskId, task.getProcessInstanceId(),
            (agree ? "同意：" : "驳回：") + comment);

    // 写流程变量：会签完成条件依赖 approveResultList
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

    // 审批后处理：推送下一节点待办、流程结束时联动考勤（见 6.5、6.6）
    afterTaskComplete(task.getProcessInstanceId(), agree);
}
```

驳回策略可按企业规则选择：驳回到发起人（重新提交）、驳回上一节点、或直接结束流程。补卡场景常用"任一驳回即终止 + 通知发起人"，正是会签完成条件里 `!contains('REJECT')` 的语义。

### 6.5 审批与考勤数据联动（沿用既有能力）

流程结束时根据业务类型回写考勤，这部分逻辑系统里已有，企微端审批触发的是同一个 `taskService.complete()`，因此联动天然生效。补卡的典型处理：

```java
public void afterProcessFinished(String processInstanceId) {
    // 流程结束后流程实例变量已迁入历史表，从 HistoricVariableInstance 取业务变量
    Map<String, Object> vars = historyService.createHistoricVariableInstanceQuery()
            .processInstanceId(processInstanceId)
            .list()
            .stream()
            .collect(Collectors.toMap(HistoricVariableInstance::getVariableName,
                    HistoricVariableInstance::getValue, (a, b) -> a));
    String bizType = String.valueOf(vars.get("bizType"));     // MAKEUP / LEAVE / OVERTIME
    Boolean approved = (Boolean) vars.get("approved");

    if (!Boolean.TRUE.equals(approved)) {
        notifyApplicant(processInstanceId, false);   // 驳回通知
        return;
    }

    switch (bizType) {
        case "MAKEUP":
            // 补卡通过：修正/补登对应日期的打卡记录（既有考勤 Service）
            attendanceService.applyMakeupCard(
                (Long) vars.get("recordId"),
                (String) vars.get("makeupTime"),
                String.valueOf(vars.get("reason")));
            break;
        case "LEAVE":
            // 请假通过：写入假期、扣减假期余额
            leaveService.grantLeave(vars);
            break;
        default:
            break;
    }
    notifyApplicant(processInstanceId, true);
}
```

监听 Activiti 流程结束事件来触发比在每个审批接口里手动调用更稳妥（PC、企微、定时任务任何入口完成都会走到）：

```java
import org.activiti.engine.delegate.event.ActivitiEntityEvent;
import org.activiti.engine.delegate.event.ActivitiEvent;
import org.activiti.engine.delegate.event.ActivitiEventListener;
import org.activiti.engine.delegate.event.ActivitiEventType;

/**
 * Activiti 流程结束监听器：审批最终结束后联动考勤
 * 通过 RuntimeService.addEventListener(...) 或 ProcessEngineConfiguration 注册
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
        return false;   // 监听器异常不影响流程本身
    }
}
```

### 6.6 待办主动推送到企业微信

光有 H5 待办列表还不够——员工不会主动进去刷。流程流转产生新待办时，后端应主动把"审批卡片"推送到下一个办理人的企微，点击卡片直接打开 H5 对应审批详情页，且因为第四章的免登，点开就是已登录状态。

任务创建监听里触发推送（Activiti 事件监听）：

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

        // 直接指派（会签每个人一个任务）→ 推给 assignee
        if (StrUtil.isNotBlank(task.getAssignee())) {
            pushToUser(task, task.getAssignee());
        } else {
            // 或签候选任务 → 推给所有候选人/候选组展开后的成员，进入后先到先签
            for (IdentityLink link : taskService.getIdentityLinksForTask(task.getId())) {
                if (StrUtil.isNotBlank(link.getUserId())) {
                    pushToUser(task, link.getUserId());
                } else if (StrUtil.isNotBlank(link.getGroupId())) {
                    // 候选组：按组查出成员 username 后逐个推送（实现略）
                    userMapper.findUsernamesByGroup(link.getGroupId())
                            .forEach(username -> pushToUser(task, username));
                }
            }
        }
    }

    private void pushToUser(TaskEntity task, String username) {
        SysUser u = userMapper.findByUsername(username);
        if (u == null || StrUtil.isBlank(u.getWecomUserId())) {
            log.warn("用户 {} 未绑定企业微信，跳过待办推送", username);
            return;
        }
        wecomMessageService.sendApprovalTodoCard(u.getWecomUserId(), task);
    }

    @Override
    public boolean isFailOnException() {
        return false;   // 推送失败不应回滚 Activiti 的任务创建
    }
}
```

文本卡片消息（点击直接跳 H5 审批页）：

```json
{
  "touser": "wangwu",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "待审批：李四的补卡申请",
    "description": "节点：直属领导审批<br/>补卡日期：2026-09-08 上午<br/>原因：外勤客户现场忘记打卡",
    "url": "https://attendance.yourcompany.com/mobile/approval/123456",
    "btntxt": "立即审批"
  }
}
```

关键点：**卡片 url 直接拼到审批详情页**。员工点开 → 无 token → 第四章 OAuth 静默免登 → 回调后通过 `state` 携带的回跳路径（见 4.3 的 redirectPath）回到这条审批详情。实现这个效果，只需让消息卡片链接带上企微约定的免登参数，或让前端守卫对所有 `/mobile/**` 强制登录即可，无需特殊处理。

**模板卡片按钮回调（进阶：不打开页面直接同意/驳回）**

如果想让审批人在消息通知里直接点"同意/拒绝"，使用 `template_card`（button_interaction）+ 第六章的回调接收，后端收到按钮事件后直接调 `mobileApprovalService.approve()`，再更新卡片状态。这种方式适合审批动作极简（一键同意）的节点；涉及填写意见、查看会签详情的仍建议跳 H5。两种方式底层调用的审批方法完全相同。

### 6.7 组织架构同步：保证动态审批人能推送到人

"按组织架构审批"动态算出的办理人是 username，推送时要能查到其 wecom_user_id。有两种保障方式：

1. **通讯录回调增量同步**（推荐，实时）：订阅 `change_contact` 事件（新增/更新/删除成员、部门变更），实时更新 `sys_user` 的 wecom_user_id、部门归属。
2. **定时全量同步**：每天凌晨调通讯录部门/成员接口全量对齐一次，作为兜底。

```
GET /cgi-bin/department/list?id=0            # 部门树
GET /cgi-bin/user/list?department_id=1&fetch_child=1   # 部门成员详情
```

同步时以工号（username）对齐，把企微 userid 回填到 `sys_user.wecom_user_id`，并同步部门关系，供 `orgService.findLeader()` 组织路由和推送寻址使用。通讯录读取接口有每日调用上限（见 9.4），因此务必"增量回调为主 + 每日一次全量兜底"，不要高频轮询。
## 七、消息推送与事件回调

### 7.1 access_token 与消息发送

应用消息统一由服务端发送，接口：

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

常用消息类型：

- `text`：考勤提醒等纯文本
- `textcard`：标题+描述+按钮，点击跳 H5（审批待办首选）
- `template_card`：带交互按钮，可在通知内直接操作（配合回调）
- `markdown`：审批摘要等富文本（企业微信内支持）

推送服务封装（`duplicate_check_interval` 用于防短时间重复推送）：

```java
@Service
@Slf4j
public class WecomMessageService {

    @Resource private WecomTokenManager tokenManager;
    @Resource private RestTemplate restTemplate;
    @Value("${wecom.agentid}") private Integer agentId;

    /** 发送审批待办卡片，点击跳转 H5 审批详情 */
    public void sendApprovalTodoCard(String wecomUserId, Task task) {
        Map<String, Object> card = new HashMap<>();
        card.put("title", "待审批：" + task.getName());
        card.put("description", "有一条新的审批待办等待您处理");
        card.put("btntxt", "立即审批");
        card.put("url", "https://attendance.yourcompany.com/mobile/approval/" + task.getId());

        Map<String, Object> msg = new HashMap<>();
        msg.put("touser", wecomUserId);
        msg.put("msgtype", "textcard");
        msg.put("agentid", agentId);
        msg.put("textcard", card);
        msg.put("duplicate_check_interval", 1800);

        send(msg);
    }

    public void send(String msg) { /* post message/send，记录 invaliduser/errcode */ }
}
```

> 返回体里的 `invaliduser`/`invalidparty` 要记录：它表示推送目标里有人没绑定或不在可见范围，是排查"为什么某人收不到待办通知"的第一线索。

### 7.2 回调验签与加解密

配置了"接收消息"后，企业微信会向回调 URL 发两类请求：

- **GET**：保存配置时的 URL 有效性验证，需解密 `echostr` 原样返回
- **POST**：正式事件推送（模板卡片按钮、通讯录变更），密文 XML，需验签 + AES 解密

```java
@RestController
@RequestMapping("/api/wecom/callback")
@Slf4j
public class WecomCallbackController {

    @Resource private WecomCallbackService callbackService;

    /** URL 验证 */
    @GetMapping("/message")
    public String verify(@RequestParam("msg_signature") String signature,
                         @RequestParam String timestamp,
                         @RequestParam String nonce,
                         @RequestParam String echostr) {
        try {
            return callbackService.verifyUrl(signature, timestamp, nonce, echostr);
        } catch (Exception e) {
            log.error("企微回调 URL 验证失败", e);
            return "";
        }
    }

    /** 事件接收：务必快速返回 success，耗时处理放异步，避免企微重试 */
    @PostMapping(value = "/message", produces = "application/xml")
    public String receive(@RequestParam("msg_signature") String signature,
                          @RequestParam String timestamp,
                          @RequestParam String nonce,
                          @RequestBody String encryptedBody) {
        try {
            callbackService.handleAsync(signature, timestamp, nonce, encryptedBody);
        } catch (Exception e) {
            log.error("企微回调处理失败", e);
        }
        return "success";   // 无论业务成败先回 success，防止企微按指数退避重试
    }
}
```

加解密不要自己实现，直接使用官方 `aes-256` 示例代码包（企业微信官方提供 Java 版 `WXBizMsgCrypt`），它封装了：SHA1 签名校验、AES-256-CBC 解密、corpId 校验、XML 组装。`Token`、`EncodingAESKey`、`corpid` 三个参数来自后台回调配置。

### 7.3 处理模板卡片按钮与通讯录事件

```java
@Service
@Slf4j
public class WecomCallbackService {

    @Resource private MobileApprovalService approvalService;
    @Resource private ContactSyncService contactSyncService;
    @Resource private WXBizMsgCrypt crypt;   // 官方加解密类

    /** 解密后按事件类型分发 */
    public void handle(String sig, String ts, String nonce, String body) throws Exception {
        String xml = crypt.DecryptMsg(sig, ts, nonce, body);
        // 用 XStream/Digester 解析 XML，取 Event / ChangeType / TaskId / EventKey / FromUserName
        CallbackEvent event = CallbackEvent.parse(xml);

        switch (event.getEvent()) {
            case "template_card_event":
                // 模板卡片按钮：EventKey 即按钮 key，FromUserName 是点击人 userid
                onCardButton(event);
                break;
            case "change_contact":
                contactSyncService.handleChange(event.getChangeType(), event.getUserId());
                break;
            default:
                log.info("未处理的企微事件: {}", xml);
        }
    }

    private void onCardButton(CallbackEvent e) {
        boolean agree = "approve".equals(e.getEventKey());
        String username = contactSyncService.wecomUserIdToUsername(e.getFromUserName());
        // task_id 在发送卡片时由我们生成并与 Activiti taskId 关联，存 Redis/DB 取回
        String taskId = taskCardMapping.get(e.getTaskId());
        approvalService.approve(taskId, username, agree, agree ? "同意" : "驳回");
        // 可调用 update_template_card 更新原卡片为"已同意/已驳回"，避免重复点击
    }
}
```

事件处理务必**幂等**：企微可能因超时重推同一事件，`approve` 内部对"任务已结束/已办理"做了判断（6.4 会查 active 任务），重复推送不会产生二次审批。耗时操作（如发多条消息、写多张表）放到异步线程或消息队列，保证回调秒级返回 `success`。

## 八、服务端基础设施

### 8.1 access_token / jsapi_ticket 集中管理

两个票据都是 7200 秒有效、同企业同应用唯一（重复获取会使旧的失效），必须服务端集中缓存。多实例部署用分布式锁保证只有一个实例刷新：

```java
@Component
@Slf4j
public class WecomTokenManager {

    private static final String TOKEN_KEY = "wecom:access_token";
    private static final String LOCK_KEY  = "wecom:access_token:lock";
    private static final long EXPIRE_SECONDS = 7100;   // 比 7200 留 100s 余量

    @Value("${wecom.corpid}") private String corpId;
    @Value("${wecom.secret}") private String secret;
    @Resource private StringRedisTemplate redis;
    @Resource private RestTemplate restTemplate;

    public String getAccessToken() {
        String cached = redis.opsForValue().get(TOKEN_KEY);
        if (StrUtil.isNotBlank(cached)) return cached;

        Boolean locked = redis.opsForValue().setIfAbsent(LOCK_KEY, "1", 10, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(locked)) return waitForToken();   // 等别的实例刷新

        try {
            String again = redis.opsForValue().get(TOKEN_KEY);      // 双重检查
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
            throw new BusinessException(ErrorCode.WECOM_API_ERROR, "获取 access_token 失败");
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
        throw new BusinessException(ErrorCode.WECOM_API_ERROR, "获取 access_token 超时");
    }

    public String getCorpId() { return corpId; }
}
```

`jsapi_ticket`、agent_config ticket 用完全相同的模式独立缓存即可（缓存 key 分开）。

### 8.2 敏感配置分离

corpid/agentid 可公开，但 secret、回调 Token、EncodingAESKey 必须通过环境变量或配置中心注入，不进 Git：

```yaml
# application-prod.yml
wecom:
  corpid: ${WECOM_CORPID}
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  oauth:
    redirect: https://attendance.yourcompany.com/mobile/oauth/callback
  jssdk:
    # 参与签名的前端域名，用于后端校验/生成链接
    frontend-base: https://attendance.yourcompany.com
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}
```

### 8.3 接口安全

- OAuth 登录端点、企微回调端点放行；其余全部走现有 JWT 认证
- `state` 一次性随机串 + sessionStorage 校验，防 CSRF
- code 只能用一次、5 分钟有效，后端收到立即换取、绝不缓存
- 打卡坐标后端二次校验距离，不信任前端；照片加水印；扫码叠加定位
- 回调接口验签 + AES 解密 + corpId 校验，拒绝伪造事件
- 关键接口限流（Redis 滑动窗口），防刷

### 8.4 通讯录同步服务

```java
@Service
public class ContactSyncService {

    /** 全量同步（每日凌晨兜底） */
    public void syncAll() {
        String token = tokenManager.getAccessToken();
        // 1. 部门树 department/list
        // 2. 遍历叶子部门 user/list?fetch_child=1 拉成员
        // 3. 以工号对齐 sys_user.username，回填 wecom_user_id、部门、姓名、手机、状态
        // 4. 企微 status=5(离职)/成员删除事件 → 停用系统账号
    }

    /** 增量事件（实时） */
    public void handleChange(String changeType, String wecomUserId) {
        switch (changeType) {
            case "create_user": case "update_user": upsertOne(wecomUserId); break;
            case "delete_user": disableByWecomUserId(wecomUserId); break;
            // 部门变更同步部门表，供 orgService.findLeader 组织路由
            default: break;
        }
    }

    public String wecomUserIdToUsername(String wecomUserId) {
        return userMapper.findUsernameByWecomId(wecomUserId);
    }
}
```

## 九、网络隔离下的公网中转网关

前面的章节默认后端服务可以直接被企业微信云端和用户手机访问。但很多企业的考勤系统部署在**内网隔离区**：没有公网 IP、不允许入站访问，甚至服务器自身也不能直接出公网。企业微信服务器在公网，手机端在企业内网之外（外勤 4G/5G），二者都无法直接访问到这套系统。这时就需要在 DMZ（隔离区）单独部署一个**公网中转网关**：它一面被企业微信和手机访问得到，一面又能通过受控通道访问到内网考勤系统。

### 9.1 网络现状与目标

典型现状：

- 内网考勤系统（SpringBoot + PostgreSQL + Redis + Activiti）只对办公网开放，地址如 `http://10.10.20.30:8080`
- 内网边界防火墙默认拒绝所有公网入站
- 手机连企业微信（尤其外勤）时流量走公网，无法路由到 `10.x` 内网地址
- 企业微信的 OAuth 回调、JS-SDK 可信域名、事件回调都要求一个**公网可达且备案的 HTTPS 域名**

目标：

- 用户手机上的 H5 页面能正常加载、完成免登、调用考勤与审批接口
- 企业微信云端能把 OAuth 授权结果、消息卡片事件回调送达
- 内网系统**不直接暴露公网**，数据库、Activiti、业务逻辑继续安全地留在内网
- 公网侧被攻破时，影响面被限制在网关，无法直接触及业务库和内网横向移动

### 9.2 两种打通模式

| 模式 | 连通方向 | 适用前提 | 特点 |
|------|----------|----------|------|
| 模式一：DMZ 网关 + 防火墙白名单反代 | DMZ 网关 → 内网（边界防火墙放通指定端口） | 防火墙可以配置"DMZ→内网"的受限访问策略 | 最常用、链路短、性能好、审计清晰，**本文主推** |
| 模式二：内网主动拨出反向隧道 | 内网 → DMZ/公网主动建隧道（frp/WireGuard） | 内网完全不允许任何入站，只允许出站 | 无需在边界开入站策略，穿透能力强；运维与审计更复杂 |

绝大多数企业选择模式一：在 DMZ 放一台网关服务器，边界防火墙只放通"网关 IP → 内网考勤服务 IP:端口"这一条白名单规则。若安全策略严格到 DMZ 也不能主动连内网，则用模式二由内网主动拨出（见 9.7）。

### 9.3 推荐架构：网关作为"企业微信适配层"

关键设计原则：**公网网关不只是一个 Nginx 转发器，而是一个面向企业微信的适配层（BFF）**。所有与企业微信云端的通信都收敛到网关，内网系统完全不感知企业微信协议。

```
 企业微信云端                手机企业微信(公网/4G)
 gettoken/getuserinfo/        │
 message send/事件回调          │ 打开H5、调API
        │                      │
        ▼                      ▼
┌─────────────────────────────────────────────┐
│              DMZ 公网网关（唯一公网暴露面）       │
│  Nginx(443, HTTPS/备案域名/静态H5/WAF)         │
│  WeCom Gateway (SpringBoot，企微适配层)         │
│   · OAuth code→userid（持有 secret）           │
│   · jsapi_ticket / 签名                        │
│   · 消息代发 message/send                       │
│   · 事件回调验签/AES解密                        │
│   · access_token 集中缓存(Redis 或 本地)        │
│   · 不存业务库、不连业务 PostgreSQL             │
└───────────────┬─────────────────────────────┘
                │  受控内部通道（mTLS + 内网令牌）
                │  防火墙白名单：仅 网关IP→内网 10.10.20.30:8080
                ▼
┌─────────────────────────────────────────────┐
│            内网考勤系统（原有，不暴露公网）        │
│  SpringBoot：考勤 / Activiti / 账号绑定 / JWT    │
│  PostgreSQL · Redis · 组织架构                  │
│  仅新增一组 /internal/** 内部信任接口            │
└─────────────────────────────────────────────┘
```

职责切分（非常重要）：

| 能力 | 放在公网网关 | 留在内网系统 |
|------|:---:|:---:|
| 持有 corpid/secret/EncodingAESKey | ✅ | ❌ |
| 调企微云端（gettoken、getuserinfo、get_jsapi_ticket、message/send） | ✅ | ❌ |
| OAuth 回调落地、回调消息验签解密 | ✅ | ❌ |
| H5 静态资源托管（也可放 CDN/OSS） | ✅ | ❌ |
| 账号绑定映射（wecom_user_id ↔ 内部账号） | ❌ | ✅ |
| 签发/校验业务 JWT、考勤、Activiti、组织架构 | ❌ | ✅ |
| PostgreSQL/Redis 业务数据 | ❌ | ✅ |
| 普通业务 API（/api/…）透传 | 仅反代 | ✅ 处理 |

这样网关即使被攻破，攻击者也拿不到业务库数据，且网关不含长期有效的内网凭据（内部令牌短时效、可吊销）。

### 9.4 隔离网络下的免登链路（与第四章的差异）

第四章假设前后端同源、后端能直接调企微。加入网关后，"code 换 userid"发生在网关，"userid 换内部账号、签 JWT"发生在内网，中间多一跳**内部信任调用**：

```
手机H5          DMZ网关                    内网考勤系统        企微云端
 │                │                          │                │
 │ 无token,跳OAuth│                          │                │
 │◀───────────────│                          │                │
 │ 静默授权回跳?code                           │                │
 │───────────────▶│ gettoken/getuserinfo ────────────────────▶│
 │                │◀──────────────────── userid ──────────────│
 │                │ POST /internal/wecom/assert {userid}      │
 │                │  (mTLS + X-Internal-Token 网关令牌)        │
 │                │─────────────────────────▶│ 查绑定账号       │
 │                │                          │ 签发内部JWT      │
 │                │◀──────────────────── JWT ─────────────────│
 │◀───────────────│ 内部JWT写入前端                            │
 │ 后续 /api/** 带JWT                          │               │
 │───────────────▶│ Nginx反代(透传JWT)────────▶│ 考勤/审批      │
```

要点：

- **secret 只在网关**，内网系统不需要、也不应该配置企微密钥
- 内网只新增一个内部信任接口 `/internal/wecom/assert`：入参是 userid，出参是系统自己的 JWT。它**不暴露公网**，只接受来自网关、且带内部令牌/mTLS 的调用
- 业务接口 `/api/**` 网关只做反向代理并透传 JWT，鉴权仍在内网的 Spring Security 完成（见 4.7），网关不解析业务

**网关侧：code 换 userid 后换内部 JWT**

```java
/**
 * DMZ 网关：企微 OAuth 适配
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/wecom")
@Slf4j
public class GatewayOAuthController {

    @Resource
    private WecomTokenManager tokenManager;      // gettoken + Redis 缓存，见 8.1
    @Resource
    private InternalAttendanceClient internalClient;  // 调内网的内部信任接口

    /** OAuth 回调：code -> 企微 userid -> 内网 JWT */
    @GetMapping("/oauth/callback")
    public void callback(@RequestParam("code") String code,
                         @RequestParam("state") String state,
                         HttpServletResponse resp) throws IOException {
        String userid = exchangeUserid(code);               // 网关调企微云端
        String jwt = internalClient.assertWecomUser(userid); // 网关调内网换JWT

        String redirect = stateService.consumeTarget(state); // state 还原原目标页并校验CSRF
        // 通过一次性中转页把 JWT 交给前端（写 localStorage 后跳目标页）
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
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE, "不在应用授权范围");
        }
        return json.getString("userid");
    }
}
```

> 不要把内部 JWT 长期拼在 URL 里（会进网关/Nginx 日志和浏览器历史）。上面用一次性 `/oauth-bridge.html`：页面脚本读取 hash 中的 token（hash 不会发到服务器、不留服务器日志），写入 localStorage 后立即 `history.replaceState` 清掉，再跳到目标页。state 仍按 4.3 做 CSRF 校验和原路径还原。

**内网侧：只接受网关调用的内部信任接口**

```java
/**
 * 内网：企业微信身份断言接口（仅网关可调用，不暴露公网）
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

        // 1. 校验来自网关的内部令牌（或在 mTLS 层校验客户端证书，二选一或叠加）
        if (!internalTokenVerifier.verify(internalToken)) {
            log.warn("内部断言接口非法调用，userid={}", dto.getUserid());
            throw new BusinessException(ErrorCode.FORBIDDEN, "内部接口拒绝访问");
        }

        // 2. 复用第 4.6 节的账号绑定逻辑（绝不重复建号）
        SysUser user = userService.getOrBindByWecomUserId(dto.getUserid());

        // 3. 签发系统原有 JWT（与账号密码登录完全一致）
        String jwt = jwtTokenProvider.generateToken(user.getId(), user.getUsername());
        return Result.success(new AssertVO(jwt, UserInfoVO.of(user)));
    }
}
```

`/internal/**` 在 Spring Security 中单独配置：只允许来自网关 IP（或带 mTLS 客户端证书），并且**不允许出现在公网 Nginx 的反代 location 中**，从网络和应用两层保证它不会被外部直接调用。

### 9.5 网关与内网之间的内部信任（安全核心）

DMZ 到内网这一跳是整个方案安全级别最高的地方，必须做到"通道加密 + 身份认证 + 最小授权"：

- **网络层白名单**：边界防火墙只放通 `网关IP:随机源端口 → 内网考勤IP:8080/tcp`，内网其它端口、其它主机一律不可达。网关到数据库（5432）、Redis（6379）**绝不开通**
- **传输加密 mTLS**：网关与内网之间走 HTTPS 双向证书认证，内网只信任网关的客户端证书。即使同网段被嗅探也无法伪造或重放
- **应用层内部令牌**：在 mTLS 之外再加一个短时效的 `X-Internal-Token`（网关注入、内网校验），双保险；令牌放环境变量，定期轮换
- **接口最小化**：内网只暴露 `/internal/wecom/assert`（换 JWT）、`/internal/message/send`（代发待办）、`/internal/callback/event`（投递回调事件）等极少数接口，且入参严格白名单校验
- **防重放**：内部请求加时间戳 + nonce，内网侧校验时间窗口（如 ±5 分钟）和 nonce 唯一性
- **网关不落业务数据**：网关不连业务 PostgreSQL，access_token 等用网关自己的 Redis 或本地缓存；日志脱敏，不记录 JWT 明文

内部令牌校验示例：

```java
@Component
public class InternalTokenVerifier {

    @Value("${internal.gateway.token}")
    private String expectedToken;

    public boolean verify(String token) {
        // 常量时间比较，防止计时侧信道
        return StrUtil.isNotBlank(token)
                && MessageDigest.isEqual(
                        token.getBytes(StandardCharsets.UTF_8),
                        expectedToken.getBytes(StandardCharsets.UTF_8));
    }
}
```

### 9.6 事件回调与消息推送的跨区处理

隔离网络下，企业微信的事件回调（卡片按钮、通讯录变更）只能先打到公网网关，再由网关投递到内网；内网产生的审批待办通知则反向通过网关代发。

**入站：企微事件回调 → 网关验签解密 → 投递内网**

```java
/**
 * 网关侧：接收企微回调，验签+AES解密后，转发内网处理
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/wecom/callback")
@Slf4j
public class GatewayCallbackController {

    @Resource
    private WXBizMsgCrypt crypt;                 // 官方加解密（secret 留在网关）
    @Resource
    private InternalAttendanceClient internalClient;

    @PostMapping(value = "/message", produces = "application/xml")
    public String receive(@RequestParam("msg_signature") String sig,
                          @RequestParam String timestamp,
                          @RequestParam String nonce,
                          @RequestBody String encryptedBody) {
        try {
            // 1. 网关完成验签 + AES 解密（内网无需知道 EncodingAESKey）
            String xml = crypt.DecryptMsg(sig, timestamp, nonce, encryptedBody);
            // 2. 验签通过的明文事件，经内部信任通道投递内网（异步、带内部令牌/mTLS）
            internalClient.forwardEvent(xml);
        } catch (Exception e) {
            log.error("企微回调处理失败", e);
        }
        return "success";   // 网关立即回 success，避免企微重推；内网处理幂等
    }
}
```

内网收到的已经是验过签的明文事件，直接复用第七章的 `WecomCallbackService` 分发逻辑（卡片按钮 → `approvalService.approve()`，通讯录变更 → 增量同步）。注意内网处理必须幂等，因为网关转发可能重试。

**出站：内网待办 → 网关代发企微消息**

内网不持有 secret、也可能不能直接访问公网，因此 Activiti 的待办推送监听器（见 6.6）不再直接调企微，而是把"要发给谁、什么卡片"提交给网关，由网关代发：

```java
/**
 * 内网侧：把待办通知交给公网网关卡发（内网不持企微 secret）
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class GatewayMessageRelay {

    @Resource
    private InternalGatewayClient gatewayClient;

    public void sendApprovalTodoCard(String wecomUserId, TodoPushDTO todo) {
        // 经 mTLS/内部令牌调用网关；网关再调 message/send
        gatewayClient.enqueueMessage(MessageEnvelope.builder()
                .toUser(wecomUserId)
                .msgType("textcard")
                .title("待审批：" + todo.getNodeName())
                .description(todo.getSummary())
                .btnText("立即审批")
                // 卡片链接指向公网 H5 域名，点击后走免登直达该审批
                .url("https://attendance.yourcompany.com/mobile/approval/" + todo.getTaskId())
                .build());
    }
}
```

```java
/**
 * 网关侧：代发服务（唯一调用 message/send 的地方）
 *
 * @author cuckoom
 */
@Service
public class GatewaySendService {

    @Resource
    private WecomTokenManager tokenManager;

    public void send(MessageEnvelope env) {
        // 校验内网来源（mTLS/内部令牌在拦截器完成），再组装企微报文发送
        // 记录 invaliduser，便于排查"某人收不到待办"
        ...
    }
}
```

这样形成清晰的单向职责：企微相关密钥和云端调用全部收敛在网关；内网只产生和处理业务，通过一个窄接口收发消息。

### 9.7 备选模式：内网主动拨出反向隧道

如果安全策略不允许 DMZ 主动连接内网（任何 DMZ→内网入站都被禁止），可改为**内网主动向 DMZ/公网网关建立长连接隧道**，由内网拨出，复用已放通的出站策略：

- **WireGuard / IPsec 隧道**：在网关与内网一台隧道机之间建立加密点对点网络，内网主动拨号上线；对网关而言内网服务变成隧道对端地址，仍用 9.3 的应用层鉴权。运维成熟、性能好，优先考虑
- **frp / rathil 等反向代理**：内网客户端 `frpc` 主动连到公网 `frps`，把内网 `8080` 映射成网关上的一个本地端口。搭建快，但要严格限制暴露的端口和协议，并叠加 mTLS/令牌，避免隧道变成"公网直通内网"的后门
- **消息队列/轮询中转**：安全要求极高时，内网只主动消费网关侧队列（如拉取待发回调、回推代发结果），全程内网出站，无任何反向入站。时延略高，但攻击面最小

选型原则：能用"DMZ + 防火墙白名单"就不用隧道；必须隧道时优先 WireGuard 这类网络层方案并叠加应用层鉴权；不要用裸 frp 直接把内网管理端口映射到公网。

### 9.8 Nginx 网关反代配置要点

网关的 Nginx 负责 TLS 终结、H5 静态资源、以及把 `/api/**` 反代到内网（经隧道对端地址或防火墙可达地址）。注意 `/internal/**` 绝不能在这里暴露：

```nginx
server {
    listen 443 ssl http2;
    server_name attendance.yourcompany.com;

    ssl_certificate     /etc/nginx/ssl/attendance.crt;
    ssl_certificate_key /etc/nginx/ssl/attendance.key;

    # H5 静态资源（Angular 打包产物，history 模式兜底）
    root /data/www/mobile;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 业务 API：反代到内网考勤系统，透传 Authorization(JWT)
    location /api/ {
        proxy_pass https://10.10.20.30:8080;   # 或 WireGuard 隧道对端地址
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_verify       on;          # 到内网也走 mTLS
        proxy_ssl_trusted_certificate /etc/nginx/mtls/ca.crt;
        proxy_ssl_certificate     /etc/nginx/mtls/gateway.crt;
        proxy_ssl_certificate_key /etc/nginx/mtls/gateway.key;
    }

    # 注意：这里【不要】配置 /internal/ 的反代，内部接口只走网关后端的受信通道

    # 网关自身的企微回调/免登由网关 SpringBoot 应用处理（如监听 127.0.0.1:8090）
    location ~ ^/(wecom|oauth-bridge) {
        proxy_pass http://127.0.0.1:8090;
    }
}
```

> 前端打包时把 API 基址指向公网网关同源路径（如 `/api`），由 Nginx 转发内网；JS-SDK 签名、OAuth 回调域名都用网关的公网备案域名。内网系统无需任何公网域名和证书。

### 9.9 公网网关自身的安全加固

DMZ 主机是暴露面，要按最小化原则加固：

- 只开 443（和必要的 SSH 限源 IP + 密钥登录），关闭其余端口；前置云 WAF / 安全组
- 网关进程以非 root、最小权限运行；容器部署时只读根文件系统、drop capabilities
- 网关不持久化业务数据、不连业务库；日志集中转发，磁盘不长期留存敏感信息
- secret、内部令牌、mTLS 私钥全部走环境变量/KMS，不进镜像和 Git（见 8.2）
- 网关到企微的出口 IP 加入企微"企业可信 IP"白名单（见 10.4 频率与白名单一节）
- 限流、防重放、请求体大小限制在网关层统一做；异常调用触发告警
- 网关与内网之间的内部接口做调用审计（谁、什么时间、调了哪个内部接口、userid 是什么）

## 十、避坑指南

### 10.1 OAuth 免登类

- **应用主页/回调域名必须在"可信域名"下**，否则授权页报 `redirect_uri 参数错误`。
- **授权链接必须带 `agentid`**，否则部分企业微信版本下 `getuserinfo` 拿不到应用身份。
- **`appid` 填的是 corpid**，不是 agentid，新手常填反。
- **返回 openid 而非 userid**：使用者不在应用可见范围。检查应用"可见范围"是否包含该成员所在部门，不要在代码里静默建号。
- **PC 浏览器打开链接不会静默授权**：`snsapi_base` 仅在企微客户端内无感。前端务必先判 UA，非企微环境走系统账号密码登录。
- **code 只能用一次、5 分钟过期**：回跳页刷新会导致 code 复用报错。登录成功后应用 `router.replace` 清掉 URL 上的 code，避免刷新重放。

### 10.2 JS-SDK 签名类

- **iOS 用入口页 URL、Android 用当前页 URL 签名**（见 5.3），SPA 下这是 `invalid signature` 的头号原因。入口 URL 要在第一次路由跳转前记录。
- **参与签名的 URL 与 `location.href` 必须逐字符一致**：协议、域名、端口、query 都要包含；hash 部分按规则统一处理（建议 history 模式避免）。
- **前端 encode、后端就 encode；都不编码就都不编码**，签名串拼接顺序必须是 `jsapi_ticket&noncestr&timestamp&url`。
- 调企业微信专有接口要 `wx.config` 里设 `beta: true`，并再做一次 `wx.agentConfig`。
- 本地真机调试必须用内网穿透的 https 域名，hosts 方案对手机无效。

### 10.3 Activiti 与账号映射类

- **办理人标识务必统一为内部 username**，不要把 wecom_user_id 直接写进 BPMN assignee，否则换身份源（以后接钉钉/飞书）流程定义全要改。
- **不要按 wecom_user_id 新建重复账号**：已有系统第一原则是绑定映射（4.6），否则考勤和历史待办会分裂成两个人。
- **或签候选任务办理前必须 claim**，未签收直接 complete 会报任务不属于当前用户。
- **会签驳回要提前结束剩余实例**：用 completionCondition 含 REJECT 判断 + 监听里 delete 剩余 task，否则驳回后其他人还会收到待办。
- **联动考勤写在流程结束监听器里**，而不是某个审批按钮接口里，保证 PC、H5、卡片回调任意入口都生效，且审批未真正通过不会误改考勤。

### 10.4 企微 API 频率与其他

| API | 限制（参考，以官方文档为准） |
|-----|------|
| gettoken | 同企业 5 分钟内调用次数受限，必须缓存 |
| 发消息 | 每应用每分钟有上限，touser 尽量批量、去重 |
| 通讯录读取 | 每日有总次数上限，以增量回调为主 |
| 消息卡片更新 | 受接口频率限制，避免循环更新 |

其他常见问题：

- **服务器出口 IP 要加"企业可信 IP"白名单**，否则报 `60020`。
- **必须 HTTPS + ICP 备案**（大陆服务器），证书过期会导致整个应用打不开且无明显提示，纳入监控。
- **回调必须秒级回 `success`**，业务异步化，否则企微重推造成重复审批（靠幂等兜底）。
- **textcard 的 url 建议直接落到详情页**，配合免登 + state 回跳，实现"点通知直达审批"。
- **secret 泄漏** 立即在后台重置并重启服务；代码评审时把"前端/日志出现 secret"列为红线。

### 10.5 网络隔离与中转网关类

- **内网系统绝不直接暴露公网**：只在 DMZ 放网关，边界防火墙仅放通"网关 IP → 内网考勤服务 IP:端口"一条白名单，网关到数据库/Redis 端口一律不开。
- **secret 与业务库分侧放置**：企微 secret、EncodingAESKey 只放网关；账号绑定、JWT、业务数据只在内网。两侧都不要既持密钥又连业务库。
- **内部接口 `/internal/**` 必须双重保护**：mTLS 客户端证书 + 内部令牌（短时效、可轮换、常量时间比较），且不能出现在公网 Nginx 的反代 location 中，同时加时间戳/nonce 防重放。
- **不要把内部 JWT 长期放在 URL query**：会进 Nginx/网关日志和浏览器历史。用一次性中转页读 hash（`#` 部分不落服务器日志）写 localStorage 后立即清除。
- **回调网关先回 success，内网异步幂等处理**：网关验签解密后转发内网，自身秒回；内网按事件 id 幂等，容忍网关重试。
- **反向隧道不要裸暴露管理端口**：只能用内网主动拨出的 WireGuard/mTLS 隧道承载窄接口；禁止用裸 frp 把内网 8080/管理后台直接映射到公网。
- **证书与可达性分别验证**：企微可信域名/HTTPS 证书配在网关公网域名；内网用自签或内部 CA 证书做 mTLS 即可，无需公网证书。真机外勤网络（4G/5G）下务必回归一遍免登与回调。

## 十一、上线检查清单

**企微后台**

- [ ] 自建应用可见范围覆盖全部使用者部门
- [ ] 应用主页配置为 H5 移动端地址（https）
- [ ] 可信域名已配置、归属校验文件可访问
- [ ] 企业可信 IP 已加白名单（服务出口 IP）
- [ ] 接收消息 URL/Token/EncodingAESKey 已配置且 GET 校验通过

**账号与身份**

- [ ] `sys_user.wecom_user_id` 已通过通讯录同步初始化，工号映射正确
- [ ] 未匹配账号有明确的"联系管理员/自助绑定"引导，不会静默建号
- [ ] `snsapi_base` 静默免登在真机（iOS + Android）验证通过
- [ ] token 过期后重新免登无感，回跳原页面正确（含审批详情深链）

**功能**

- [ ] JS-SDK `wx.config` 在 iOS/Android 双端通过（重点验签名 URL）
- [ ] 定位/拍照/扫码在真机可用，后端距离二次校验生效
- [ ] 会签：每人独立待办、任一驳回即终止且通知发起人
- [ ] 或签：候选人均收到、一人签收办理后其他人待办消失
- [ ] 组织架构审批：按申请人部门正确路由到负责人/分管领导
- [ ] 审批通过后考勤联动（补卡修正/假期扣减）正确落库
- [ ] 待办卡片推送送达，点击直达并已登录；卡片按钮回调幂等

**安全与运维**

- [ ] secret/Token/AESKey 走环境变量，未进 Git、未出现在日志
- [ ] access_token/jsapi_ticket 缓存 + 分布式锁验证（多实例）
- [ ] HTTPS 证书有效期监控、接口限流与关键操作审计日志
- [ ] 通讯录增量回调 + 每日全量兜底任务已启用

**网络隔离 / 公网中转网关（第九章，隔离网络必查）**

- [ ] DMZ 网关是唯一公网暴露面，内网考勤系统无任何公网入站规则
- [ ] 边界防火墙仅放通"网关 IP → 内网考勤 IP:8080"，到 PG/Redis 端口未开通
- [ ] 企微 secret / EncodingAESKey 只在网关，内网不持有；网关不连业务库
- [ ] `/internal/**` 走 mTLS + 内部令牌 + 时间戳/nonce 防重放，且未在公网 Nginx 反代
- [ ] 免登跨区链路真机验证：网关换 userid → 内网 assert 换 JWT → 业务接口透传鉴权
- [ ] 回调：网关验签解密秒回 success，内网异步幂等；待办经网关卡发送达
- [ ] 外勤 4G/5G 真机回归：H5 加载、免登、定位打卡、审批待办与卡片回调
- [ ] 若用反向隧道：内网主动拨出、WireGuard/mTLS、仅暴露窄接口，无裸 frp 管理端口

## 总结

在"已有考勤系统 + Activiti 复杂审批"的前提下做企业微信集成，正确的思路不是重写一套，而是把企微当作**入口、身份提供方和消息通道**：

- **选型**：已有 Web 系统、审批表单复杂、要求快速迭代和免审上线时，H5 比小程序更合适；OAuth2 `snsapi_base` 静默授权即可实现点开应用自动登录，JS-SDK 足以覆盖定位、拍照、扫码。
- **自动登录链路**：前端路由守卫发现无 token → 302 企微授权（带 state）→ 静默回跳带 code → 后端 gettoken + `auth/getuserinfo` 拿 userid → **按工号映射到既有系统账号（而非新建）** → 签发系统原有 JWT，之后所有考勤、审批接口零改造复用。
- **账号解耦**：Activiti 的 assignee/候选人继续用内部 username，企微 userid 只作为 `sys_user` 上的外部身份字段，登录认人、推送寻址时再转换，保留多种登录方式并存的能力。
- **审批复用**：会签（多实例 + 完成条件）、或签（candidateUsers + claim）、组织架构审批（UEL 表达式动态解析负责人）全部沿用已有 BPMN；H5 只新增待办列表/详情/办理入口，底层都走同一个 `taskService.complete()`。
- **联动与触达**：考勤联动放在流程结束监听器中保证各入口一致；新待办通过 textcard 推送，链接直达审批详情并复用免登；卡片内一键审批走回调，操作必须幂等。
- **重点避坑**：可信域名与企业可信 IP、iOS/Android 签名 URL 差异、code 一次性与 state 防 CSRF、绝不重复建号、或签签收、回调秒回 success、票据集中缓存。
- **网络隔离落地**：考勤系统在内网无法被企微访问时，在 DMZ 部署公网中转网关作为唯一暴露面——企微密钥与云端调用（gettoken/getuserinfo/签名/消息代发/回调验签）收敛到网关，账号绑定、JWT、Activiti 与业务数据全部留在内网，两侧用 mTLS + 内部令牌的窄接口（`/internal/**`）受控互通；连 DMZ→内网入站都不允许时，退而用内网主动拨出的 WireGuard/mTLS 反向隧道。这样既打通了企微入口，又不把内网系统直接暴露到公网。

官方文档：[企业微信开发者中心](https://developer.work.weixin.qq.com/document/)

> 这套方案的本质是"集成"而非"重做"：用最小的新增代码（一个 OAuth 登录端点、一层账号映射、一个 JS-SDK 签名服务、一组待办推送监听），让沉淀多年的考勤与 Activiti 审批能力平滑出现在员工的企业微信里，并做到无感知自动登录。后续若打卡体验要求进一步提升，可再叠加小程序打卡入口，与 H5 审批共用同一套后端账号与工作流，平滑演进。
