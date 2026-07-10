---
title: "企业微信应用开发完全指南：以考勤系统为例"
date: 2026-07-09 21:00:00
tags:
  - 企业微信
  - 考勤系统
  - API对接
  - 移动端开发
categories:
  - 技术实践
---

企业微信（WeCom）作为企业级通讯与协作平台，提供了丰富的开放 API，支持企业自建应用、第三方应用和代开发应用。本文以考勤系统移动端应用为案例，讲解企业微信应用开发的技术要点，涵盖 API 对接、OAuth 认证、JS-SDK 集成、消息推送、安全设计等关键环节，帮助研发人员快速上手。

<!-- more -->

## 一、企业微信应用开发概述

### 1.1 平台定位

企业微信开放平台为开发者提供了一套完整的 API 体系，覆盖通讯录管理、消息推送、OAuth 认证、JS-SDK、效率工具（打卡、审批、汇报）等能力。开发者可以基于这些 API 构建企业内部应用，也可以开发面向多企业的第三方应用。

### 1.2 应用类型

| 类型 | 适用场景 | 特点 |
|------|----------|------|
| 自建应用 | 企业内部使用 | 仅本企业可见，配置灵活，API 权限由管理员分配 |
| 第三方应用 | 面向多企业提供服务 | 需通过企业微信审核，支持多企业授权安装 |
| 代开发应用 | 服务商代企业开发 | 企业授权给服务商，服务商代为开发和运维 |

本文以**自建应用**为主，这是最常见的开发场景。

### 1.3 开发模式

企业微信应用开发主要有两种模式：

**H5 应用模式**：在企业微信中打开网页应用，通过 OAuth 获取用户身份，通过 JS-SDK 调用原生能力（定位、拍照、扫码等）。适合快速开发、频繁更新的场景。

**小程序模式**：在企业微信中运行小程序，体验更接近原生，支持离线能力。适合对性能要求较高的场景。

考勤系统两种模式均可，本文以 H5 应用模式为主线讲解，同时说明小程序模式的关键差异。

## 二、开发环境搭建

### 2.1 注册与创建应用

1. 访问 [企业微信管理后台](https://work.weixin.qq.com/)，注册企业微信
2. 进入「应用管理」→「自建」→「创建应用」
3. 填写应用名称、logo、可见范围（哪些部门/员工可用）
4. 创建完成后获取三个关键参数：

| 参数 | 说明 | 获取位置 |
|------|------|----------|
| `corpid` | 企业唯一标识 | 我的企业 → 企业信息 → 企业ID |
| `agentid` | 应用唯一标识 | 应用管理 → 自建应用 → AgentId |
| `secret` | 应用密钥 | 应用管理 → 自建应用 → Secret |

### 2.2 配置可信域名

在企业微信管理后台配置「网页授权及JS-SDK」域名：

```
应用管理 → 自建应用 → 开发者接口 → 网页授权及JS-SDK
  → 设置可信域名：attendance.yourcompany.com
  → 需下载域名归属校验文件，放置在域名根目录
```

域名必须满足：
- 支持 HTTPS（生产环境）
- 已通过 ICP 备案（中国大陆服务器）
- 能访问到校验文件 `WW_verify_xxxx.txt`

### 2.3 本地开发环境

本地开发需要解决 HTTPS 和域名验证问题：

```bash
# 使用 ngrok 或 frp 进行内网穿透
ngrok http 8080

# 或使用 mkcert 生成本地 HTTPS 证书
mkcert -install
mkcert localhost 127.0.0.1

# 配置 hosts 文件（将可信域名指向本地）
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

开发阶段可以在企业微信后台配置可信域名为内网穿透地址，但需要注意 token 安全。


## 三、核心 API 对接

### 3.1 access_token 管理

access_token 是企业微信 API 的全局票据，所有 API 调用都需要携带。

**获取接口**：

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

**响应**：

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "access_token": "***",
  "expires_in": 7200
}
```

**关键策略**：
- 有效期 7200 秒（2 小时），需提前刷新
- 同一应用的有效 access_token 唯一，重复获取会使旧 token 失效
- **必须服务端获取**，不能在前端直接调用（会暴露 secret）
- 建议使用 Redis 缓存，设置过期时间为 7100 秒（留 100 秒余量）


### 3.2 OAuth2 网页授权

用户在企业微信中打开 H5 应用时，需要通过 OAuth2 获取用户身份。

**授权流程**：

```
用户点击应用入口
  → 企业微信构造授权链接，用户同意授权
  → 重定向到回调地址，携带 code
  → 后端用 code 换取 userid
  → 建立会话，返回业务 token
```

**构造授权链接**：

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

| 参数 | 说明 |
|------|------|
| `appid` | 企业的 corpid |
| `redirect_uri` | 回调地址，必须在可信域名下，需 URL 编码 |
| `scope` | `snsapi_base`（静默授权，仅获取 userid）或 `snsapi_privateinfo`（获取详细信息） |
| `agentid` | 应用 agentid |
| `state` | 防 CSRF，原样返回 |


### 3.3 通讯录管理

通过通讯录 API 可以同步企业组织架构和员工信息。

**获取部门列表**：

```
GET https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=TOKEN&id=0
```

**获取部门成员详情**：

```
GET https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token=TOKEN&department_id=1&fetch_child=1
```

**响应示例**：

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

**同步策略**：建议每天凌晨全量同步一次通讯录，同时配置通讯录变更回调（见下方），实现增量实时同步。

### 3.4 消息推送

消息推送是企业微信应用的重要能力，可用于考勤提醒、审批通知等场景。

**发送应用消息**：

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

**文本消息**：

```json
{
  "touser": "zhangsan|lisi",
  "toparty": "2|3",
  "totag": "tag1",
  "msgtype": "text",
  "agentid": 1000002,
  "text": {
    "content": "您今天的上班打卡时间为 09:00，请及时打卡。"
  },
  "duplicate_check_interval": 1800
}
```

**文本卡片消息**（推荐，可跳转到应用页面）：

```json
{
  "touser": "zhangsan",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "考勤提醒",
    "description": "距离上班打卡截止还有 15 分钟，请及时打卡。",
    "url": "https://attendance.yourcompany.com/checkin",
    "btntxt": "去打卡"
  }
}
```

**模板卡片消息**（支持交互按钮）：

```json
{
  "touser": "zhangsan",
  "msgtype": "template_card",
  "agentid": 1000002,
  "template_card": {
    "card_type": "button_interaction",
    "source": {
      "desc": "考勤系统"
    },
    "main_title": {
      "title": "补卡申请审批",
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

## 四、安全要点

**1. access_token 安全管理：**
- access_token 绝不能暴露给前端，必须在服务端获取和管理
- 建议使用缓存（如 Redis）存储，设置 TTL 为 7100 秒（留 100 秒余量）
- 多实例部署时需用分布式锁防止并发刷新导致旧 token 失效

**2. 敏感配置分离：**
- corpid、secret、agentid 等敏感信息不应硬编码或提交到代码仓库
- 通过环境变量或配置中心注入

**3. API 安全：**
- 所有业务接口需认证（如 JWT），OAuth2 回调接口除外
- 防重放：接口签名 + 时间戳校验
- 限流：防止恶意调用

**4. 数据安全：**
- 打卡照片等敏感数据存储在内网，不对外暴露
- 用户手机号等敏感字段加密存储
- 数据库定期备份

## 五、避坑指南

### 1. access_token 并发刷新

**问题**：多实例同时刷新 access_token，导致旧 token 失效，其他实例请求报错。

**方案**：使用分布式锁确保只有一个实例刷新，其他实例等待。双重检查模式：获取锁后再次检查缓存，避免重复刷新。

### 2. OAuth2 code 只能用一次

企业微信 OAuth2 的 code 只能使用一次，且 5 分钟内有效。如果用户刷新页面导致重复使用 code，会报错 40029。

**方案**：前端在回调页拿到 code 后立即调用后端换取 token，然后清除 URL 中的 code 参数。

### 3. JS-SDK 签名 URL 必须精确匹配

iOS 和 Android 对 JS-SDK 签名 URL 的处理不同：
- Android：使用当前页面 URL
- iOS：使用入口页 URL（第一次进入应用的 URL）

**方案**：iOS 下记录入口 URL，后续签名均使用该 URL；Android 使用当前页面 URL。

### 4. 打卡防作弊

- GPS 定位精度约 10-50 米，存在漂移，建议半径设为 100-300 米
- WiFi MAC 地址可被伪造，需结合位置验证
- 照片打卡可加入水印（时间+位置+设备指纹）
- 异常行为检测：频繁补卡、非工作日打卡、异地打卡等

### 5. 企业微信 API 频率限制

| API | 限制 |
|-----|------|
| 获取 access_token | 同一企业每 5 分钟最多 1000 次 |
| 发送消息 | 每应用每分钟最多 200 次 |
| 通讯录读取 | 每天最多 10000 次 |
| 获取打卡数据 | 每天最多 1000 次 |

高频率调用需做缓存和批量处理。

## 总结

企业微信应用开发的核心在于理解以下关键环节：

- **认证体系**：corpid/secret/agentid 三要素 -> access_token 全局票据 -> OAuth2 网页授权获取用户身份
- **API 对接**：通讯录管理同步组织架构，消息推送触达用户，JS-SDK 调用原生能力
- **部署要求**：HTTPS 是硬性要求（企业微信可信域名），服务端集中管理 access_token
- **安全设计**：敏感配置环境变量注入，分布式锁防并发，API 限流防滥用

关键避坑点：access_token 并发刷新、OAuth2 code 一次性使用、JS-SDK 签名 URL iOS/Android 差异、API 频率限制。

官方文档：https://developer.work.weixin.qq.com/document/

> 本文以考勤系统为线索，梳理了企业微信应用开发的 API 对接要点。核心模式（OAuth2 认证 -> API 对接 -> JS-SDK 集成 -> 消息推送）适用于所有类型的企业微信应用开发。