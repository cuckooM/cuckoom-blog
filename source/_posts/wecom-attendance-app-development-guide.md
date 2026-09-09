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

这种前提下，H5 应用模式往往是比小程序更合适的选择：现有系统如果本身就是 Web 架构（Vue/Angular + SpringBoot），H5 可以直接复用前端页面与后端接口，配合企业微信 OAuth2 网页授权（`snsapi_base`）实现完全静默的自动登录（免登），部署即生效、无需审核发版，审批表单频繁调整时迭代成本最低。

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
- **前端**：已有 Web 端，Vue 或 Angular 单页应用

要解决的核心问题只有两个：

1. **身份问题**：企业微信里进来的人是谁？如何与系统账号对应，实现自动登录？
2. **入口与触达问题**：如何从企微工作台进入应用？审批待办如何主动推送到员工企微？

业务逻辑（打卡规则、审批流转）**一行都不需要搬进企业微信**，企微只承担「入口 + 身份提供方（IdP）+ 消息通道」三个角色。

### 1.2 为什么这种场景首选 H5

| 对比维度 | H5 应用（本文方案） | 企业微信小程序 |
|----------|--------------------|----------------|
| 复用现有 Web 前端 | 直接复用现有 Vue/Angular 页面 | 需用 WXML/WXSS 重写全部页面 |
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
│  Vue/Angular SPA + wx JS-SDK  │
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

关键设计原则：**企业微信 userid 只是系统用户表上的一个外部身份字段**，考勤、Activiti 的候选人/办理人仍然使用系统内部 userId（或与 userid 统一，见 4.5 节讨论），这样企业微信只是新增的一种登录方式，不会侵入已有的权限和工作流模型。

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

# 前端 dev server 允许宿主域名访问（Vite 示例）
# vite.config.ts
server: { host: '0.0.0.0', port: 5173, https: false }
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

### 3.1 目录结构（复用现有 Vue 工程，新增移动端模块）

不需要新建工程。在现有 Vue3 + TypeScript 工程中新增移动端路由与企微适配层即可：

```
attendance-web/
├── src/
│   ├── main.ts
│   ├── router/
│   │   ├── index.ts                 # 路由总入口（PC/移动分流）
│   │   └── mobile.routes.ts         # 移动端路由
│   ├── views/
│   │   └── mobile/                  # 企微内 H5 页面
│   │       ├── CheckinView.vue      # 打卡首页（定位/拍照/扫码入口）
│   │       ├── RecordsView.vue      # 打卡记录
│   │       ├── todo/
│   │       │   ├── TodoList.vue     # 审批待办列表（Activiti tasks）
│   │       │   └── ApprovalDetail.vue # 审批详情（会签/或签进度）
│   │       └── apply/
│   │           └── MakeUpApply.vue  # 补卡申请（触发 Activiti 流程）
│   ├── api/                         # 复用现有 API 封装
│   │   ├── request.ts               # axios（自动注入 JWT、401 重登）
│   │   ├── checkin.ts
│   │   └── approval.ts
│   └── wecom/                       # 企微适配层（本次新增的核心）
│       ├── env.ts                   # 是否企微环境、UA 判断
│       ├── oauth.ts                 # OAuth2 免登跳转逻辑
│       ├── jssdk.ts                 # wx.config / agentConfig / 签名
│       └── device.ts                # 定位、拍照、扫码封装
├── public/
│   └── WW_verify_xxxx.txt           # 域名归属校验文件
└── vite.config.ts
```

### 3.2 引入企业微信 JS-SDK

企业微信 H5 使用 `jweixin` 模块（与微信公众号 JSSDK 同源，企业微信在其上扩展了 `wx.agentConfig` 和企业专有接口）：

```bash
npm install weixin-js-sdk --save
# 或直接 index.html 引入
# <script src="https://res.wx.qq.com/open/js/jweixin-1.2.0.js"></script>
```

```typescript
// src/wecom/env.ts

/** 判断当前是否运行在企业微信客户端内 */
export function isInWecom(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  // 企业微信 UA 同时包含 wxwork 与 micromessenger
  return /wxwork/.test(ua) && /micromessenger/.test(ua);
}

/** 判断 iOS（JS-SDK 签名 URL 处理有差异，见第五章） */
export function isIOS(): boolean {
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
}
```

### 3.3 路由与免登守卫

移动端所有业务路由都经过同一个守卫：没有系统 token 就发起 OAuth 免登，登录成功后回到原页面。这是实现「点开应用自动登录」的总开关，第四章详细展开。

```typescript
// src/router/mobile.routes.ts
import { createRouter, createWebHistory } from 'vue-router';
import { ensureLogin } from '@/wecom/oauth';

const routes = [
  { path: '/mobile', redirect: '/mobile/checkin' },
  { path: '/mobile/checkin', component: () => import('@/views/mobile/CheckinView.vue'), meta: { auth: true } },
  { path: '/mobile/records', component: () => import('@/views/mobile/RecordsView.vue'), meta: { auth: true } },
  { path: '/mobile/todo', component: () => import('@/views/mobile/todo/TodoList.vue'), meta: { auth: true } },
  { path: '/mobile/approval/:taskId', component: () => import('@/views/mobile/todo/ApprovalDetail.vue'), meta: { auth: true } },
  { path: '/mobile/apply/makeup', component: () => import('@/views/mobile/apply/MakeUpApply.vue'), meta: { auth: true } },
  // OAuth 回调落地页（无需 auth）
  { path: '/mobile/oauth/callback', component: () => import('@/views/mobile/OAuthCallback.vue'), meta: { auth: false } },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  if (to.meta.auth === false) return true;
  // 核心：确保已登录，未登录则内部跳转 OAuth（函数内处理重定向）
  const ok = await ensureLogin(to.fullPath);
  return ok;
});

export default router;
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

前端封装（`src/wecom/oauth.ts`）：

```typescript
import { isInWecom } from './env';

const CORP_ID = 'ww your_corpid';            // corpid 不属于高敏感信息，可放前端
const AGENT_ID = '1000002';                   // agentid 同样可公开
const CALLBACK = 'https://attendance.yourcompany.com/mobile/oauth/callback';

/** 生成随机 state，同时把"登录后要去的页面"暂存 sessionStorage */
function buildState(redirectPath: string): string {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const state = nonce;
  sessionStorage.setItem(`wx_state_${state}`, redirectPath || '/mobile/checkin');
  sessionStorage.setItem(`wx_state_nonce`, nonce);   // 回调时校验
  return state;
}

/** 发起免登：整页跳转到企业微信授权地址 */
export function redirectToWecomAuth(redirectPath: string) {
  if (!isInWecom()) {
    // 非企微环境（如 PC 浏览器直接打开），走系统账号密码登录页
    window.location.href = '/login?redirect=' + encodeURIComponent(redirectPath);
    return;
  }
  const state = buildState(redirectPath);
  const url =
    'https://open.weixin.qq.com/connect/oauth2/authorize' +
    `?appid=${encodeURIComponent(CORP_ID)}` +
    `&redirect_uri=${encodeURIComponent(CALLBACK)}` +
    '&response_type=code' +
    '&scope=snsapi_base' +
    `&agentid=${AGENT_ID}` +
    `&state=${encodeURIComponent(state)}` +
    '#wechat_redirect';
  window.location.replace(url);
}

/** 路由守卫调用：确保已登录 */
export async function ensureLogin(targetPath: string): Promise<boolean> {
  const token = localStorage.getItem('sys_token');
  if (token) return true;                 // 已有 token，放行（由请求拦截器处理过期）
  redirectToWecomAuth(targetPath);        // 否则发起免登（会离开当前页）
  return false;
}
```

> corpid、agentid 是"公开标识"（授权链接本来就要在浏览器里明文出现），放前端无妨；真正的密钥只有 secret，它永远只在服务端。

### 4.4 第二步：回调落地页拿 code 换 token

回跳到 `/mobile/oauth/callback?code=xxx&state=yyy` 后，回调页做三件事：校验 state → 把 code 发给后端 → 拿到 JWT 后跳回原目标页。

```vue
<!-- src/views/mobile/OAuthCallback.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loginByWecomCode } from '@/api/auth';

const route = useRoute();
const router = useRouter();
const errMsg = ref('正在登录...');

onMounted(async () => {
  const code = route.query.code as string;
  const state = route.query.state as string;

  if (!code) { errMsg.value = '授权失败：缺少 code'; return; }

  // 1. 校验 state，防 CSRF：必须是我们跳转前存过的 nonce
  const savedNonce = sessionStorage.getItem('wx_state_nonce');
  if (!state || state !== savedNonce) {
    errMsg.value = '登录态校验失败，请重新进入应用';
    return;
  }
  const redirectPath = sessionStorage.getItem(`wx_state_${state}`) || '/mobile/checkin';

  try {
    // 2. code 交给后端换取系统 JWT
    const { token } = await loginByWecomCode(code);
    localStorage.setItem('sys_token', token);
    sessionStorage.removeItem(`wx_state_${state}`);
    sessionStorage.removeItem('wx_state_nonce');
    // 3. 回到原本想去的页面（可能是某条审批待办详情）
    router.replace(redirectPath);
  } catch (e: any) {
    errMsg.value = '自动登录失败：' + (e?.message || '请重试');
  }
});
</script>

<template>
  <div class="oauth-loading">{{ errMsg }}</div>
</template>
```

```typescript
// src/api/auth.ts
import { http } from './request';

export function loginByWecomCode(code: string) {
  // 这是少数几个不需要 token 的接口
  return http.post('/api/auth/wecom/login', { code }).then((r) => r.data.data);
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

前端 axios 拦截器自动注入 token、401 时重新免登：

```typescript
// src/api/request.ts
import axios from 'axios';
import { isInWecom } from '@/wecom/env';

export const http = axios.create({ baseURL: '/', timeout: 15000 });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('sys_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (resp) => {
    const body = resp.data;
    if (body.code === 0) return resp;
    return Promise.reject(new Error(body.message || '请求失败'));
  },
  (error) => {
    if (error.response?.status === 401) {
      // token 过期：企微内重新静默免登（无感），外部环境跳登录页
      localStorage.removeItem('sys_token');
      if (isInWecom()) {
        location.reload();   // 路由守卫会自动再次发起 OAuth
      } else {
        location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
      }
    }
    return Promise.reject(error);
  },
);
```

后端沿用现有 Spring Security / 拦截器，只把企微登录端点和回调端点放行：

```java
@Override
protected void configure(HttpSecurity http) throws Exception {
    http.authorizeRequests()
        .antMatchers("/api/auth/wecom/**",     // 企微免登
                     "/api/wecom/callback/**"  // 企微回调
        ).permitAll()
        .anyRequest().authenticated()
        .and().csrf().disable();   // 前后端分离 + JWT，关闭 CSRF
}
```

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
// src/wecom/jssdk.ts
import wx from 'weixin-js-sdk';
import { http } from '@/api/request';
import { isIOS } from './env';

/** 取参与签名的 URL：去掉 #hash 部分（企业微信签名规则 url 不含 hash） */
function signableUrl(href: string): string {
  const idx = href.indexOf('#');
  return idx >= 0 ? href.slice(0, idx) : href;
}

/** 记录入口页 URL（仅 iOS 需要，需在应用一启动、路由跳转之前调用一次） */
function entryUrl(): string {
  const key = 'wx_ios_entry_url';
  if (isIOS()) {
    let url = sessionStorage.getItem(key);
    if (!url) {
      url = signableUrl(location.href);
      sessionStorage.setItem(key, url);
    }
    return url;
  }
  return signableUrl(location.href);   // Android 用当前页
}

let configPromise: Promise<void> | null = null;

/** 保证 wx.config 完成（全局只需一次，SPA 内可复用） */
export function ensureWxConfig(): Promise<void> {
  if (configPromise) return configPromise;

  configPromise = (async () => {
    const url = entryUrl();
    const { data } = await http.get('/api/wecom/jssdk/config', { params: { url } });
    const cfg = data.data;

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

  return configPromise;
}
```

在应用入口（路由守卫之前）尽早记录 iOS 入口 URL：

```typescript
// main.ts
import { recordEntryIfNeeded } from '@/wecom/jssdk';
if (isInWecom()) {
  // 触发一次入口 URL 落库（封装在 entryUrl 中，这里直接调 ensureWxConfig 也可）
}
```

> 路由模式建议：为减少 hash 与签名的心智负担，H5 移动端可用 **history 模式**；若用 hash 模式，务必按上面 `signableUrl` 在 `#` 处截断，保证前后端参与签名的 URL 完全一致，且都用 `encodeURIComponent` / 都不编码，保持一致。

### 5.4 地理定位打卡

```typescript
// src/wecom/device.ts
import wx from 'weixin-js-sdk';
import { ensureWxConfig } from './jssdk';

export interface LngLat { longitude: number; latitude: number; accuracy: number; }

/** JS-SDK 定位（gcj02 火星坐标，与国内地图一致） */
export function getLocation(): Promise<LngLat> {
  return ensureWxConfig().then(() => new Promise((resolve, reject) => {
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

/** Haversine 距离（米） */
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

```typescript
// CheckinView.vue 提交打卡
async function onCheckin() {
  const loc = await getLocation();
  const dist = distanceMeters(loc, { lat: COMPANY.lat, lng: COMPANY.lng });
  if (dist > 200) { Toast.fail(`不在打卡范围，距公司 ${Math.round(dist)} 米`); return; }
  await checkinApi.submit({
    latitude: loc.latitude,
    longitude: loc.longitude,
    accuracy: loc.accuracy,
    distance: Math.round(dist),
  });
  Toast.success('打卡成功');
}
```

后端打卡接口与系统现有实现一致（距离二次校验、防重复打卡、落库、推送），这些逻辑早已存在，H5 只是一个新的调用方。后端**必须重新校验距离**，不能信任前端传入的经纬度（前端坐标可被抓包篡改）。

### 5.5 拍照打卡与扫码打卡

```typescript
/** 调起相机拍照（仅相机，不可相册，防作弊） */
export function takePhoto(): Promise<string> {
  return ensureWxConfig().then(() => new Promise((resolve, reject) => {
    wx.chooseImage({
      count: 1,
      sourceType: ['camera'],
      sizeType: ['compressed'],
      success: (res: any) => resolve(res.localIds[0]),
      fail: (err: any) => reject(new Error('拍照失败：' + err.errMsg)),
    });
  }));
}

/** localId 图片需先转 base64 或用 wx.uploadImage 得到 mediaId 再上传业务服务器 */
```

```typescript
/** 扫一扫（工位/会议室二维码打卡） */
export function scanQRCode(): Promise<string> {
  return ensureWxConfig().then(() => new Promise((resolve, reject) => {
    wx.scanQRCode({
      needResult: 1,              // 1=由前端拿结果自行处理
      scanType: ['qrCode'],
      success: (res: any) => resolve(res.resultStr),
      fail: (err: any) => reject(new Error('扫码失败：' + err.errMsg)),
    });
  }));
}
```

照片上传两条路径：

1. `wx.uploadImage` 先把图片上传到企业微信得到 `serverId`，后端再调企微媒体接口 `media/get` 拉回内网——适合不想在 H5 里直传文件的场景。
2. 直接用 FormData 把本地文件 POST 到现有文件服务（H5 可将 localId 绘制到 canvas 转 blob），复用系统已有的附件存储。

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

前端 `ApprovalDetail.vue` 根据 `nodeType` 渲染：会签显示多头像进度条（已办/待办），或签显示"值班组成员均可审批，点击签收办理"。

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

## 九、避坑指南

### 9.1 OAuth 免登类

- **应用主页/回调域名必须在"可信域名"下**，否则授权页报 `redirect_uri 参数错误`。
- **授权链接必须带 `agentid`**，否则部分企业微信版本下 `getuserinfo` 拿不到应用身份。
- **`appid` 填的是 corpid**，不是 agentid，新手常填反。
- **返回 openid 而非 userid**：使用者不在应用可见范围。检查应用"可见范围"是否包含该成员所在部门，不要在代码里静默建号。
- **PC 浏览器打开链接不会静默授权**：`snsapi_base` 仅在企微客户端内无感。前端务必先判 UA，非企微环境走系统账号密码登录。
- **code 只能用一次、5 分钟过期**：回跳页刷新会导致 code 复用报错。登录成功后应用 `router.replace` 清掉 URL 上的 code，避免刷新重放。

### 9.2 JS-SDK 签名类

- **iOS 用入口页 URL、Android 用当前页 URL 签名**（见 5.3），SPA 下这是 `invalid signature` 的头号原因。入口 URL 要在第一次路由跳转前记录。
- **参与签名的 URL 与 `location.href` 必须逐字符一致**：协议、域名、端口、query 都要包含；hash 部分按规则统一处理（建议 history 模式避免）。
- **前端 encode、后端就 encode；都不编码就都不编码**，签名串拼接顺序必须是 `jsapi_ticket&noncestr&timestamp&url`。
- 调企业微信专有接口要 `wx.config` 里设 `beta: true`，并再做一次 `wx.agentConfig`。
- 本地真机调试必须用内网穿透的 https 域名，hosts 方案对手机无效。

### 9.3 Activiti 与账号映射类

- **办理人标识务必统一为内部 username**，不要把 wecom_user_id 直接写进 BPMN assignee，否则换身份源（以后接钉钉/飞书）流程定义全要改。
- **不要按 wecom_user_id 新建重复账号**：已有系统第一原则是绑定映射（4.6），否则考勤和历史待办会分裂成两个人。
- **或签候选任务办理前必须 claim**，未签收直接 complete 会报任务不属于当前用户。
- **会签驳回要提前结束剩余实例**：用 completionCondition 含 REJECT 判断 + 监听里 delete 剩余 task，否则驳回后其他人还会收到待办。
- **联动考勤写在流程结束监听器里**，而不是某个审批按钮接口里，保证 PC、H5、卡片回调任意入口都生效，且审批未真正通过不会误改考勤。

### 9.4 企微 API 频率与其他

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

## 十、上线检查清单

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

## 总结

在"已有考勤系统 + Activiti 复杂审批"的前提下做企业微信集成，正确的思路不是重写一套，而是把企微当作**入口、身份提供方和消息通道**：

- **选型**：已有 Web 系统、审批表单复杂、要求快速迭代和免审上线时，H5 比小程序更合适；OAuth2 `snsapi_base` 静默授权即可实现点开应用自动登录，JS-SDK 足以覆盖定位、拍照、扫码。
- **自动登录链路**：前端路由守卫发现无 token → 302 企微授权（带 state）→ 静默回跳带 code → 后端 gettoken + `auth/getuserinfo` 拿 userid → **按工号映射到既有系统账号（而非新建）** → 签发系统原有 JWT，之后所有考勤、审批接口零改造复用。
- **账号解耦**：Activiti 的 assignee/候选人继续用内部 username，企微 userid 只作为 `sys_user` 上的外部身份字段，登录认人、推送寻址时再转换，保留多种登录方式并存的能力。
- **审批复用**：会签（多实例 + 完成条件）、或签（candidateUsers + claim）、组织架构审批（UEL 表达式动态解析负责人）全部沿用已有 BPMN；H5 只新增待办列表/详情/办理入口，底层都走同一个 `taskService.complete()`。
- **联动与触达**：考勤联动放在流程结束监听器中保证各入口一致；新待办通过 textcard 推送，链接直达审批详情并复用免登；卡片内一键审批走回调，操作必须幂等。
- **重点避坑**：可信域名与企业可信 IP、iOS/Android 签名 URL 差异、code 一次性与 state 防 CSRF、绝不重复建号、或签签收、回调秒回 success、票据集中缓存。

官方文档：[企业微信开发者中心](https://developer.work.weixin.qq.com/document/)

> 这套方案的本质是"集成"而非"重做"：用最小的新增代码（一个 OAuth 登录端点、一层账号映射、一个 JS-SDK 签名服务、一组待办推送监听），让沉淀多年的考勤与 Activiti 审批能力平滑出现在员工的企业微信里，并做到无感知自动登录。后续若打卡体验要求进一步提升，可再叠加小程序打卡入口，与 H5 审批共用同一套后端账号与工作流，平滑演进。
