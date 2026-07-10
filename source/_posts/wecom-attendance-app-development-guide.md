---
title: "企业微信应用开发完全指南：以考勤系统为例"
date: 2026-07-09 21:00:00
tags:
  - 企业微信
  - 考勤系统
  - SpringBoot
  - 移动端开发
categories:
  - 技术实践
---

企业微信（WeCom）作为企业级通讯与协作平台，提供了丰富的开放 API，支持企业自建应用、第三方应用和代开发应用。本文以考勤系统移动端应用为案例，全面讲解企业微信应用开发的技术要点，涵盖 API 对接、OAuth 认证、JS-SDK 集成、系统架构设计、核心功能实现、容器化部署等全流程，帮助研发人员快速上手。

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

### 2.4 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | Vue 3 + TypeScript + Vant | 移动端 UI 组件库 |
| 后端 | Java 17 + Spring Boot 3.x | RESTful API |
| 数据库 | PostgreSQL 16 | 主数据库 |
| 缓存 | Redis 7 | access_token 缓存、考勤规则缓存 |
| 部署 | Docker + Kubernetes | 容器化部署 |
| CI/CD | GitHub Actions / Jenkins | 自动构建部署 |

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

**Spring Boot 实现**：

```java
@Service
public class WeComTokenService {

    @Value("${wecom.corpid}")
    private String corpId;

    @Value("${wecom.secret}")
    private String secret;

    private final StringRedisTemplate redisTemplate;
    private final RestTemplate restTemplate;

    private static final String TOKEN_KEY="wecom:...oken";
    private static final String TOKEN_URL="https:...t=%s";

    /**
     * 获取 access_token，优先从 Redis 读取，过期则刷新
     */
    public String getAccessToken() {
        String token = redisTemplate.opsForValue().get(TOKEN_KEY);
        if (StringUtils.hasText(token)) {
            return token;
        }
        return refreshToken();
    }

    /**
     * 强制刷新 access_token
     */
    public synchronized String refreshToken() {
        // 双重检查，避免并发重复刷新
        String token = redisTemplate.opsForValue().get(TOKEN_KEY);
        if (StringUtils.hasText(token)) {
            return token;
        }

        String url = String.format(TOKEN_URL, corpId, secret);
        JSONObject response = restTemplate.getForObject(url, JSONObject.class);

        if (response.getInteger("errcode") == 0) {
            token = response.getString("access_token");
            int expiresIn = response.getInteger("expires_in");
            // 缓存时间比实际过期时间少 100 秒，避免边界问题
            redisTemplate.opsForValue().set(
                TOKEN_KEY, token, expiresIn - 100, TimeUnit.SECONDS);
            return token;
        }

        throw new RuntimeException("获取 access_token 失败: " + response);
    }
}
```

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

**后端处理回调**：

```java
@RestController
@RequestMapping("/auth")
public class AuthController {

    private final WeComTokenService tokenService;
    private final UserService userService;
    private final JwtUtil jwtUtil;

    /**
     * OAuth2 回调，用 code 换取用户身份
     */
    @GetMapping("/callback")
    public void callback(
            @RequestParam String code,
            @RequestParam(required = false) String state,
            HttpServletResponse response) throws IOException {

        // 1. 用 code 获取 userid
        String accessToken = tokenService.getAccessToken();
        String userInfoUrl = String.format(
            "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=%s&code=%s",
            accessToken, code);

        JSONObject userInfo = restTemplate.getForObject(userInfoUrl, JSONObject.class);

        if (userInfo.getInteger("errcode") != 0) {
            throw new RuntimeException("获取用户身份失败: " + userInfo);
        }

        String userId = userInfo.getString("userid");

        // 2. 查询或创建本地用户
        User user = userService.findByWeComUserId(userId);
        if (user == null) {
            // 首次登录，同步用户信息
            user = userService.syncFromWeCom(userId, accessToken);
        }

        // 3. 生成 JWT token
        String jwtToken = jwtUtil.generateToken(user.getId(), user.getName());

        // 4. 重定向到前端，携带 token
        response.sendRedirect(String.format(
            "/#/authsuccess?token=%s", URLEncoder.encode(jwtToken, "UTF-8")));
    }
}
```

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

**定时同步策略**：

```java
@Service
public class ContactSyncService {

    /**
     * 全量同步通讯录，建议每天凌晨执行一次
     */
    @Scheduled(cron = "0 0 2 * * ?")
    public void fullSync() {
        String token = tokenService.getAccessToken();
        
        // 1. 同步部门
        List<Department> departments = weComClient.getDepartments(token, 0);
        departmentService.batchUpsert(departments);

        // 2. 同步每个部门的成员
        for (Department dept : departments) {
            List<WeComUser> users = weComClient.getUsersByDept(
                token, dept.getId(), true);
            userService.batchUpsert(users);
        }

        log.info("通讯录同步完成: {} 个部门, {} 个员工",
            departments.size(), /* ... */);
    }

    /**
     * 增量同步，通过回调事件触发（见 3.6 节）
     */
    public void incrementalSync(ChangeEvent event) {
        switch (event.getChangeType()) {
            case "create_user" -> userService.create(event.getUser());
            case "update_user" -> userService.update(event.getUser());
            case "delete_user" -> userService.delete(event.getUserId());
        }
    }
}
```

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

**Spring Boot 封装**：

```java
@Service
public class WeComMessageService {

    private static final String SEND_URL = 
        "https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=%s";

    /**
     * 发送考勤提醒消息
     */
    public void sendCheckinReminder(String userId, String message, String url) {
        JSONObject body = new JSONObject();
        body.put("touser", userId);
        body.put("msgtype", "textcard");
        body.put("agentid", agentId);

        JSONObject card = new JSONObject();
        card.put("title", "考勤提醒");
        card.put("description", message);
        card.put("url", url);
        card.put("btntxt", "去打卡");
        body.put("textcard", card);

        send(body);
    }

    /**
     * 发送审批通知（带交互按钮）
     */
    public void sendApprovalNotice(String approverId, 
            String title, String desc, String taskId) {
        JSONObject body = new JSONObject();
        body.put("touser", approverId);
        body.put("msgtype", "template_card");
        body.put("agentid", agentId);

        JSONObject card = new JSONObject();
        card.put("card_type", "button_interaction");
        card.put("source", Map.of("desc", "考勤系统"));
        card.put("main_title", Map.of("title", title, "desc", desc));
        card.put("button_list", List.of(
            Map.of("text", "同意", "style", 1, "key", "approve"),
            Map.of("text", "拒绝", "style", 2, "key", "reject")
        ));
        card.put("task_id", taskId);
        body.put("template_card", card);

        send(body);
    }

    private void send(JSONObject body) {
        String url = String.format(SEND_URL, tokenService.getAccessToken());
        JSONObject result = restTemplate.postForObject(url, body, JSONObject.class);

        if (result.getInteger("errcode") != 0) {
            log.error("消息发送失败: {}", result);
            throw new RuntimeException("消息发送失败: " + result.getString("errmsg"));
        }
    }
}
```
## 考勤系统架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    企业微信客户端                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ H5 打卡  │  │ 考勤报表 │  │ 审批申请 │  │ 消息通知│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
└───────┼──────────────┼──────────────┼──────────────┼────┘
        │              │              │              │
        │   企业微信网关  │              │              │
        │  (OAuth2+JS-SDK)             │              │
        └──────────────┼──────────────┼──────────────┘
                       │              │              │
┌──────────────────────┼──────────────┼──────────────┼────┐
│                      ▼              ▼              ▼    │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Nginx 反向代理 (TLS)                 │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         ▼                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │           SpringBoot API 服务 (K8s)              │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │  │
│  │  │认证模块 │ │打卡模块 │ │规则引擎 │ │报表模块│ │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └────────┘ │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐            │  │
│  │  │消息模块 │ │同步模块 │ │定时任务 │            │  │
│  │  └─────────┘ └─────────┘ └─────────┘            │  │
│  └──────┬──────────────┬──────────────┬────────────┘  │
│         ▼              ▼              ▼                │
│  ┌──────────┐  ┌────────────┐  ┌────────────┐        │
│  │PostgreSQL│  │  Redis     │  │ MinIO/OSS  │        │
│  │ (主数据库)│  │ (缓存+锁)  │  │ (打卡照片) │        │
│  └──────────┘  └────────────┘  └────────────┘        │
│         │                                               │
│  ┌──────┴──────────────────────────────────────────┐  │
│  │           企业微信 API (qyapi.weixin.qq.com)     │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 技术选型

| 层级 | 技术 | 选型理由 |
|------|------|----------|
| 前端 | Vue 3 + Vant 4 | 移动端 H5 优先，企业微信内置浏览器兼容性好 |
| 后端 | Java 17 + SpringBoot 3 | 企业级稳定性，丰富生态 |
| 数据库 | PostgreSQL 16 | JSON 字段支持灵活考勤规则，窗口函数适合报表统计 |
| 缓存 | Redis 7 | access_token 缓存、分布式锁（防重复打卡） |
| 对象存储 | MinIO | 打卡照片存储，自建方案，数据不外泄 |
| 容器 | Docker + K8s | 标准化部署，弹性伸缩 |
| CI/CD | GitHub Actions | 自动构建、测试、部署 |

### 数据库设计

```sql
-- 考勤规则表
CREATE TABLE attendance_rule (
    id              BIGSERIAL PRIMARY KEY,
    rule_name       VARCHAR(100) NOT NULL,
    rule_type       SMALLINT NOT NULL DEFAULT 1,
    -- 1=固定班制 2=排班制 3=自由工时

    -- 上班时间
    work_start_time TIME NOT NULL DEFAULT '09:00:00',
    work_end_time   TIME NOT NULL DEFAULT '18:00:00',

    -- 弹性时段（分钟）
    flex_minutes    INT NOT NULL DEFAULT 0,

    -- 允许迟到/早退分钟数
    late_allowance  INT NOT NULL DEFAULT 0,
    early_allowance INT NOT NULL DEFAULT 0,

    -- 打卡范围
    need_clock_in   BOOLEAN NOT NULL DEFAULT TRUE,
    need_clock_out  BOOLEAN NOT NULL DEFAULT TRUE,

    -- 适用工作日（位掩码：周一=1 ... 周日=64）
    work_days_mask  SMALLINT NOT NULL DEFAULT 31, -- 周一至周五

    -- 打卡位置限制
    location_lat    DECIMAL(10, 7),
    location_lng    DECIMAL(10, 7),
    location_radius INT, -- 允许范围（米）

    -- WiFi 限制（MAC 地址列表）
    wifi_macs       JSONB, -- ["AA:BB:CC:DD:EE:FF", ...]

    -- 是否需要拍照
    need_photo      BOOLEAN NOT NULL DEFAULT FALSE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

-- 考勤规则适用部门
CREATE TABLE attendance_rule_dept (
    rule_id    BIGINT NOT NULL REFERENCES attendance_rule(id),
    dept_id    BIGINT NOT NULL, -- 企业微信部门 ID
    PRIMARY KEY (rule_id, dept_id)
);

-- 打卡记录表
CREATE TABLE attendance_record (
    id              BIGSERIAL PRIMARY KEY,

    -- 用户信息（冗余存储，避免频繁查企业微信 API）
    user_id         VARCHAR(64) NOT NULL, -- 企业微信 UserID
    user_name       VARCHAR(64) NOT NULL,
    dept_id         BIGINT,
    dept_name       VARCHAR(128),

    -- 打卡信息
    clock_type      SMALLINT NOT NULL, -- 1=上班 2=下班 3=外出 4=外勤
    clock_time      TIMESTAMPTZ NOT NULL,
    clock_date      DATE NOT NULL, -- 打卡日期（用于按天查询）

    -- 位置信息
    latitude        DECIMAL(10, 7),
    longitude       DECIMAL(10, 7),
    location_desc   VARCHAR(256), -- 逆地理编码地址
    wifi_mac        VARCHAR(32),
    wifi_name       VARCHAR(128),

    -- 照片
    photo_url       VARCHAR(512),

    -- 设备信息
    device_info     JSONB, -- {"model": "iPhone 15", "os": "iOS 17"}

    -- 异常标记
    is_late         BOOLEAN NOT NULL DEFAULT FALSE,
    is_early_leave  BOOLEAN NOT NULL DEFAULT FALSE,
    late_minutes    INT NOT NULL DEFAULT 0,
    early_minutes   INT NOT NULL DEFAULT 0,
    is_abnormal     BOOLEAN NOT NULL DEFAULT FALSE,
    abnormal_reason VARCHAR(256),

    -- 来源
    source          SMALLINT NOT NULL DEFAULT 1,
    -- 1=手动打卡 2=自动打卡 3=补卡审批 4=管理员补录

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 关键索引
CREATE INDEX idx_record_user_date ON attendance_record(user_id, clock_date);
CREATE INDEX idx_record_dept_date ON attendance_record(dept_id, clock_date);
CREATE INDEX idx_record_date_type ON attendance_record(clock_date, clock_type);
CREATE INDEX idx_record_abnormal ON attendance_record(clock_date, is_abnormal) WHERE is_abnormal = TRUE;

-- 考勤日汇总表（定时任务生成，加速报表查询）
CREATE TABLE attendance_daily_summary (
    id              BIGSERIAL PRIMARY KEY,
    user_id         VARCHAR(64) NOT NULL,
    user_name       VARCHAR(64) NOT NULL,
    dept_id         BIGINT,
    dept_name       VARCHAR(128),
    summary_date    DATE NOT NULL,

    -- 出勤状态
    status          SMALLINT NOT NULL,
    -- 1=正常 2=迟到 3=早退 4=迟到+早退 5=缺卡 6=旷工 7=请假 8=出差 9=休息

    first_clock_in  TIMESTAMPTZ, -- 最早上班打卡
    last_clock_out  TIMESTAMPTZ, -- 最后下班打卡
    work_hours      DECIMAL(4, 2), -- 实际工作时长（小时）

    late_minutes    INT NOT NULL DEFAULT 0,
    early_minutes   INT NOT NULL DEFAULT 0,

    -- 关联信息
    rule_id         BIGINT,
    overtime_hours  DECIMAL(4, 2) NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, summary_date)
);

CREATE INDEX idx_summary_dept_date ON attendance_daily_summary(dept_id, summary_date);
CREATE INDEX idx_summary_date_status ON attendance_daily_summary(summary_date, status);
```

### 前端方案：Vue 3 + Vant 4

项目结构：

```
attendance-h5/
├── src/
│   ├── api/              # 接口封装
│   │   ├── auth.ts       # 认证相关
│   │   ├── attendance.ts # 打卡相关
│   │   └── report.ts     # 报表相关
│   ├── views/
│   │   ├── ClockIn.vue   # 打卡首页
│   │   ├── Report.vue    # 考勤报表
│   │   └── Apply.vue     # 补卡/请假申请
│   ├── composables/
│   │   ├── useWecom.ts   # 企业微信 JS-SDK 封装
│   │   ├── useLocation.ts # 定位 Hook
│   │   └── useAuth.ts    # 认证 Hook
│   ├── router/
│   └── stores/
├── vite.config.ts
└── package.json
```

企业微信 JS-SDK 封装：

```typescript
// src/composables/useWecom.ts
import wx from 'weixin-js-sdk'
import { ref } from 'vue'
import { getJsApiConfig } from '@/api/auth'

export function useWecom() {
  const isReady = ref(false)

  async function init() {
    // 1. 获取 JS-SDK 签名配置
    const url = window.location.href.split('#')[0]
    const config = await getJsApiConfig(url)

    // 2. 配置 JS-SDK
    wx.config({
      corpId: config.corpId,
      timestamp: config.timestamp,
      nonceStr: config.nonceStr,
      signature: config.signature,
      jsApiList: [
        'getLocation',
        'chooseImage',
        'uploadImage',
        'getNetworkType',
        'scanQRCode'
      ]
    })

    // 3. 等待 ready
    return new Promise((resolve, reject) => {
      wx.ready(() => {
        isReady.value = true
        resolve(true)
      })
      wx.error((res: any) => {
        console.error('WeCom JS-SDK error:', res.errMsg)
        reject(res)
      })
    })
  }

  // 获取定位
  function getLocation(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02', // 国测局坐标
        success: (res: any) => {
          resolve({ lat: res.latitude, lng: res.longitude })
        },
        fail: (err: any) => reject(err)
      })
    })
  }

  // 拍照
  function takePhoto(): Promise<string> {
    return new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera'], // 仅拍照
        success: async (res: any) => {
          const localId = res.localIds[0]
          // 上传到企业微信服务器获取 mediaId
          const uploadRes: any = await new Promise((r, j) => {
            wx.uploadImage({
              localId,
              isShowProgressTips: 1,
              success: r,
              fail: j
            })
          })
          resolve(uploadRes.serverId) // mediaId
        },
        fail: (err: any) => reject(err)
      })
    })
  }

  return { isReady, init, getLocation, takePhoto }
}
```
## 核心功能实现

### 1. 用户认证与授权

考勤系统需要识别当前操作用户。整个认证流程如下：

```
用户打开H5 -> 企业微信OAuth2 -> 获取code -> 后端换userid -> 生成JWT -> 前端存储
```

**后端 OAuth2 回调处理（SpringBoot）：**

```java
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final WeComService weComService;
    private final JwtUtil jwtUtil;

    /**
     * OAuth2 回调，用 code 换取用户身份
     */
    @GetMapping("/callback")
    public RedirectView callback(@RequestParam String code,
                                  @RequestParam(required = false) String state) {
        // 1. 用 code 获取访问用户身份
        WeComUserInfo userInfo = weComService.getUserInfoByCode(code);

        // 2. 获取用户详情（姓名、部门等）
        WeComUserDetail detail = weComService.getUserDetail(userInfo.getUserId());

        // 3. 同步用户信息到本地数据库
        User localUser = userService.syncFromWeCom(userInfo.getUserId(), detail);

        // 4. 生成 JWT
        String token = jwtUtil.generate(localUser.getId(), localUser.getUserId());

        // 5. 重定向到前端，token 通过 URL 参数传递
        String redirectUrl = frontendUrl + "/#/auth?token=" + token;
        return new RedirectView(redirectUrl);
    }
}
```

**企业微信服务封装：**

```java
@Service
@RequiredArgsConstructor
public class WeComService {

    private final WeComConfig config;
    private final RestClient restClient;

    /**
     * 获取 access_token（带缓存）
     * access_token 有效期 7200 秒，需提前刷新
     */
    @Cacheable(value = "wecom_token", key = "'access_token'")
    public String getAccessToken() {
        String url = String.format(
            "%s/cgi-bin/gettoken?corpid=%s&corpsecret=%s",
            config.getApiBase(), config.getCorpId(), config.getSecret()
        );

        TokenResponse resp = restClient.get()
            .uri(url)
            .retrieve()
            .body(TokenResponse.class);

        if (resp.getErrcode() != 0) {
            throw new BusinessException("获取 access_token 失败: " + resp.getErrmsg());
        }
        return resp.getAccess_token();
    }

    /**
     * 用 OAuth2 code 获取用户身份
     */
    public WeComUserInfo getUserInfoByCode(String code) {
        String token = getAccessToken();
        String url = String.format(
            "%s/cgi-bin/auth/getuserinfo?access_token=%s&code=%s",
            config.getApiBase(), token, code
        );

        UserInfoResponse resp = restClient.get()
            .uri(url)
            .retrieve()
            .body(UserInfoResponse.class);

        if (resp.getErrcode() != 0) {
            throw new BusinessException("获取用户身份失败: " + resp.getErrmsg());
        }
        return new WeComUserInfo(resp.getUserid(), resp.getUserTicket());
    }

    /**
     * 获取用户详情
     */
    public WeComUserDetail getUserDetail(String userId) {
        String token = getAccessToken();
        String url = String.format(
            "%s/cgi-bin/user/get?access_token=%s&userid=%s",
            config.getApiBase(), token, userId
        );

        UserDetailResponse resp = restClient.get()
            .uri(url)
            .retrieve()
            .body(UserDetailResponse.class);

        return WeComUserDetail.builder()
            .userId(resp.getUserid())
            .name(resp.getName())
            .department(resp.getDepartment())
            .avatar(resp.getAvatar())
            .build();
    }
}
```

### 2. 打卡功能实现

打卡是考勤系统的核心。需要验证位置、WiFi、拍照等多重条件。

**后端打卡接口：**

```java
@RestController
@RequestMapping("/api/attendance")
@RequiredArgsConstructor
public class AttendanceController {

    private final AttendanceService attendanceService;

    /**
     * 提交打卡
     */
    @PostMapping("/clock")
    public Result<ClockResponse> clock(@Valid @RequestBody ClockRequest req) {
        return Result.success(attendanceService.clock(req));
    }
}

@Service
@RequiredArgsConstructor
public class AttendanceService {

    private final AttendanceRuleRepository ruleRepo;
    private final AttendanceRecordRepository recordRepo;
    private final WeComService weComService;
    private final RedisTemplate<String, String> redisTemplate;

    /**
     * 打卡核心逻辑
     */
    @Transactional
    public ClockResponse clock(ClockRequest req) {
        String userId = SecurityUtil.getCurrentUserId();

        // 1. 分布式锁，防止重复打卡
        String lockKey = "clock:lock:" + userId + ":" + LocalDate.now();
        Boolean locked = redisTemplate.opsForValue()
            .setIfAbsent(lockKey, "1", 5, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(locked)) {
            throw new BusinessException("请勿重复点击，正在处理中");
        }

        try {
            // 2. 查找今日适用的考勤规则
            AttendanceRule rule = findTodayRule(userId);
            if (rule == null) {
                throw new BusinessException("今日非工作日，无需打卡");
            }

            // 3. 判断打卡类型（上班/下班）
            LocalTime now = LocalTime.now();
            int clockType = now.isBefore(rule.getWorkStartTime()
                .plusMinutes(rule.getFlexMinutes())) ? 1 : 2;

            // 4. 校验位置
            if (rule.getLocationLat() != null) {
                double distance = GeoUtil.distance(
                    req.getLatitude(), req.getLongitude(),
                    rule.getLocationLat(), rule.getLocationLng()
                );
                if (distance > rule.getLocationRadius()) {
                    throw new BusinessException(
                        String.format("您不在打卡范围内（距离 %.0f 米，超出 %d 米限制）",
                        distance, rule.getLocationRadius())
                    );
                }
            }

            // 5. 校验 WiFi
            if (rule.getWifiMacs() != null && !rule.getWifiMacs().isEmpty()) {
                if (!rule.getWifiMacs().contains(req.getWifiMac())) {
                    throw new BusinessException("当前 WiFi 不在允许范围内");
                }
            }

            // 6. 处理照片
            String photoUrl = null;
            if (rule.isNeedPhoto() && req.getMediaId() != null) {
                photoUrl = weComService.downloadAndSaveMedia(req.getMediaId());
            }

            // 7. 计算迟到/早退
            boolean isLate = false, isEarlyLeave = false;
            int lateMinutes = 0, earlyMinutes = 0;

            if (clockType == 1) {
                LocalTime deadline = rule.getWorkStartTime()
                    .plusMinutes(rule.getFlexMinutes() + rule.getLateAllowance());
                if (now.isAfter(deadline)) {
                    isLate = true;
                    lateMinutes = (int) Duration.between(deadline, now).toMinutes();
                }
            } else {
                if (now.isBefore(rule.getWorkEndTime())) {
                    isEarlyLeave = true;
                    earlyMinutes = (int) Duration.between(now, rule.getWorkEndTime()).toMinutes();
                }
            }

            // 8. 保存打卡记录
            AttendanceRecord record = AttendanceRecord.builder()
                .userId(userId)
                .userName(SecurityUtil.getCurrentUserName())
                .clockType(clockType)
                .clockTime(LocalDateTime.now())
                .clockDate(LocalDate.now())
                .latitude(req.getLatitude())
                .longitude(req.getLongitude())
                .wifiMac(req.getWifiMac())
                .wifiName(req.getWifiName())
                .photoUrl(photoUrl)
                .isLate(isLate)
                .isEarlyLeave(isEarlyLeave)
                .lateMinutes(lateMinutes)
                .earlyMinutes(earlyMinutes)
                .source(1)
                .build();

            recordRepo.save(record);

            return ClockResponse.builder()
                .clockType(clockType)
                .clockTime(record.getClockTime())
                .isLate(isLate)
                .lateMinutes(lateMinutes)
                .isEarlyLeave(isEarlyLeave)
                .earlyMinutes(earlyMinutes)
                .message(getClockMessage(clockType, isLate, isEarlyLeave))
                .build();
        } finally {
            redisTemplate.delete(lockKey);
        }
    }

    private String getClockMessage(int type, boolean late, boolean early) {
        if (type == 1) {
            return late ? "上班打卡成功（迟到）" : "上班打卡成功";
        }
        return early ? "下班打卡成功（早退）" : "下班打卡成功，辛苦了";
    }
}
```

**前端打卡页面（Vue 3）：**

```vue
<!-- src/views/ClockIn.vue -->
<template>
  <div class="clock-page">
    <div class="time-display">{{ currentTime }}</div>
    <div class="date-display">{{ currentDate }} {{ weekDay }}</div>

    <div class="status-card" :class="statusClass">
      <van-icon :name="statusIcon" size="48" />
      <span class="status-text">{{ statusText }}</span>
    </div>

    <van-button
      type="primary"
      size="large"
      round
      :loading="loading"
      :disabled="!canClock"
      @click="handleClock"
    >
      {{ clockButtonText }}
    </van-button>

    <div v-if="lastRecord" class="last-record">
      <van-cell title="上次打卡" :value="formatTime(lastRecord.clockTime)" />
      <van-cell title="打卡状态" :value="lastRecord.isLate ? '迟到' : '正常'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { showToast } from 'vant'
import { useWecom } from '@/composables/useWecom'
import { clock } from '@/api/attendance'

const { isReady, init, getLocation, takePhoto } = useWecom()
const loading = ref(false)
const currentTime = ref('')
const lastRecord = ref<any>(null)
let timer: ReturnType<typeof setInterval>

const canClock = computed(() => isReady.value && !loading.value)
const clockButtonText = computed(() => loading.value ? '打卡中...' : '打卡')

onMounted(async () => {
  await init()
  startTimer()
  await loadTodayStatus()
})

onUnmounted(() => clearInterval(timer))

async function handleClock() {
  loading.value = true
  try {
    // 1. 获取定位
    const { lat, lng } = await getLocation()

    // 2. 获取 WiFi 信息（通过 JS-SDK getNetworkType 间接判断）
    // 注意：企业微信 JS-SDK 不直接暴露 WiFi MAC
    // 实际方案：前端采集 WiFi BSSID 需要原生 App 配合
    // H5 方案中可降级为仅位置校验，或通过后端验证 IP 段

    // 3. 拍照（如果规则要求）
    let mediaId: string | undefined
    // mediaId = await takePhoto()

    // 4. 提交打卡
    const res = await clock({
      latitude: lat,
      longitude: lng,
      wifiMac: undefined,
      wifiName: undefined,
      mediaId
    })

    lastRecord.value = res
    showToast({ type: 'success', message: res.message })
  } catch (err: any) {
    showToast({ type: 'fail', message: err.message || '打卡失败' })
  } finally {
    loading.value = false
  }
}

function startTimer() {
  const update = () => {
    const now = new Date()
    currentTime.value = now.toLocaleTimeString('zh-CN', { hour12: false })
  }
  update()
  timer = setInterval(update, 1000)
}
</script>
```
### 3. 考勤规则引擎

规则引擎负责判断每天是否需要打卡、何时打卡、迟到/早退如何计算。

```java
/**
 * 考勤规则引擎
 * 根据日期、用户、部门匹配适用规则
 */
@Service
@RequiredArgsConstructor
public class AttendanceRuleEngine {

    private final AttendanceRuleRepository ruleRepo;
    private final AttendanceRuleDeptRepository ruleDeptRepo;
    private final WeComService weComService;

    /**
     * 查找用户在某天的适用规则
     */
    public AttendanceRule findRule(String userId, LocalDate date) {
        // 1. 获取用户部门信息
        List<Long> deptIds = weComService.getUserDeptIds(userId);

        // 2. 查找部门关联的规则
        List<Long> ruleIds = ruleDeptRepo.findRuleIdsByDeptIds(deptIds);
        if (ruleIds.isEmpty()) {
            return null; // 无规则 = 不需要打卡
        }

        // 3. 获取规则列表
        List<AttendanceRule> rules = ruleRepo.findAllById(ruleIds);

        // 4. 按优先级匹配
        for (AttendanceRule rule : rules) {
            if (matchesDate(rule, date)) {
                return rule;
            }
        }
        return null;
    }

    /**
     * 判断规则是否在指定日期生效
     */
    private boolean matchesDate(AttendanceRule rule, LocalDate date) {
        // 检查工作日掩码
        // 周一=1(0b0000001) ... 周日=64(0b1000000)
        int dayOfWeek = date.getDayOfWeek().getValue(); // 1=Monday ... 7=Sunday
        int dayBit = 1 << (dayOfWeek - 1);
        if ((rule.getWorkDaysMask() & dayBit) == 0) {
            return false; // 非工作日
        }

        // 检查法定节假日（可接入国务院节假日 API）
        if (HolidayUtil.isHoliday(date)) {
            return false;
        }

        // 检查调休日（法定节假日调休上班）
        if (HolidayUtil.isWorkdayOverride(date)) {
            return true;
        }

        return true;
    }

    /**
     * 计算日考勤汇总
     */
    public AttendanceDailySummary summarize(String userId, LocalDate date) {
        AttendanceRule rule = findRule(userId, date);
        if (rule == null) {
            return buildRestDaySummary(userId, date);
        }

        List<AttendanceRecord> records = recordRepo
            .findByUserIdAndClockDateOrderByClockTime(userId, date);

        if (records.isEmpty()) {
            return buildAbsentSummary(userId, date, rule);
        }

        // 找到最早上班打卡和最后下班打卡
        AttendanceRecord firstIn = records.stream()
            .filter(r -> r.getClockType() == 1)
            .min(Comparator.comparing(AttendanceRecord::getClockTime))
            .orElse(null);

        AttendanceRecord lastOut = records.stream()
            .filter(r -> r.getClockType() == 2)
            .max(Comparator.comparing(AttendanceRecord::getClockTime))
            .orElse(null);

        // 计算状态
        int status = 1; // 正常
        int lateMin = 0, earlyMin = 0;

        if (firstIn != null && firstIn.isLate()) {
            status = 2; // 迟到
            lateMin = firstIn.getLateMinutes();
        }
        if (lastOut != null && lastOut.isEarlyLeave()) {
            status = status == 2 ? 4 : 3; // 迟到+早退 或 早退
            earlyMin = lastOut.getEarlyMinutes();
        }
        if (firstIn == null || lastOut == null) {
            status = 5; // 缺卡
        }

        // 计算工作时长
        BigDecimal workHours = BigDecimal.ZERO;
        if (firstIn != null && lastOut != null) {
            long minutes = Duration.between(
                firstIn.getClockTime(), lastOut.getClockTime()
            ).toMinutes();
            workHours = BigDecimal.valueOf(minutes)
                .divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
        }

        return AttendanceDailySummary.builder()
            .userId(userId)
            .summaryDate(date)
            .status(status)
            .firstClockIn(firstIn != null ? firstIn.getClockTime() : null)
            .lastClockOut(lastOut != null ? lastOut.getClockTime() : null)
            .workHours(workHours)
            .lateMinutes(lateMin)
            .earlyMinutes(earlyMin)
            .ruleId(rule.getId())
            .build();
    }
}
```

### 4. 定时任务

```java
/**
 * 考勤定时任务
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AttendanceScheduler {

    private final AttendanceRuleEngine ruleEngine;
    private final AttendanceDailySummaryRepository summaryRepo;
    private final WeComService weComService;
    private final MessageService messageService;

    /**
     * 每天 23:30 生成日考勤汇总
     */
    @Scheduled(cron = "0 30 23 * * ?")
    public void generateDailySummary() {
        LocalDate today = LocalDate.now();
        List<String> allUserIds = weComService.getAllUserIds();

        int success = 0, fail = 0;
        for (String userId : allUserIds) {
            try {
                AttendanceDailySummary summary = ruleEngine.summarize(userId, today);
                summaryRepo.upsert(summary);
                success++;
            } catch (Exception e) {
                log.error("生成汇总失败: userId={}", userId, e);
                fail++;
            }
        }
        log.info("日考勤汇总完成: 日期={}, 成功={}, 失败={}", today, success, fail);
    }

    /**
     * 工作日早上 8:50 发送上班打卡提醒
     */
    @Scheduled(cron = "0 50 8 * * MON-FRI")
    public void remindClockIn() {
        LocalDate today = LocalDate.now();
        if (HolidayUtil.isHoliday(today)) return;

        List<String> userIds = weComService.getAllUserIds();
        for (String userId : userIds) {
            messageService.sendTextMessage(userId,
                "早上好！请在 9:00 前完成上班打卡。");
        }
        log.info("上班打卡提醒已发送: 用户数={}", userIds.size());
    }

    /**
     * 工作日 18:00 发送下班打卡提醒
     */
    @Scheduled(cron = "0 0 18 * * MON-FRI")
    public void remindClockOut() {
        LocalDate today = LocalDate.now();
        if (HolidayUtil.isHoliday(today)) return;

        List<String> userIds = weComService.getAllUserIds();
        for (String userId : userIds) {
            messageService.sendTextMessage(userId,
                "下班时间到了，别忘了打卡下班哦！");
        }
    }

    /**
     * 每月 1 号 00:30 生成月度统计
     */
    @Scheduled(cron = "0 30 0 1 * ?")
    public void generateMonthlyReport() {
        YearMonth lastMonth = YearMonth.now().minusMonths(1);
        // 统计上月数据，生成月报...
        log.info("月度考勤报表已生成: {}", lastMonth);
    }
}
```

### 5. 消息通知

通过企业微信 API 推送考勤通知：

```java
@Service
@RequiredArgsConstructor
public class MessageService {

    private final WeComService weComService;
    private final WeComConfig config;

    /**
     * 发送文本消息
     */
    public void sendTextMessage(String userId, String content) {
        String token = weComService.getAccessToken();
        String url = String.format(
            "%s/cgi-bin/message/send?access_token=%s",
            weComService.getApiBase(), token
        );

        Map<String, Object> body = Map.of(
            "touser", userId,
            "msgtype", "text",
            "agentid", config.getAgentId(),
            "text", Map.of("content", content)
        );

        restClient.post().uri(url).body(body).retrieve().toBodilessEntity();
    }

    /**
     * 发送打卡结果卡片消息（模板卡片）
     */
    public void sendClockResultCard(String userId, ClockResponse result) {
        String token = weComService.getAccessToken();
        String url = String.format(
            "%s/cgi-bin/message/send?access_token=%s",
            weComService.getApiBase(), token
        );

        String statusText = result.isLate() ? "迟到 " + result.getLateMinutes() + "分钟"
            : result.isEarlyLeave() ? "早退 " + result.getEarlyMinutes() + "分钟"
            : "正常";

        Map<String, Object> body = Map.of(
            "touser", userId,
            "msgtype", "template_card",
            "agentid", config.getAgentId(),
            "template_card", Map.of(
                "card_type", "text_notice",
                "main_title", Map.of("title", "打卡结果"),
                "sub_title_text", statusText,
                "card_image", Map.of(
                    "url", config.getLogoUrl(),
                    "aspect_ratio", "2.25:1"
                ),
                "card_action", Map.of(
                    "type", 1,
                    "url", config.getFrontendUrl() + "/#/report"
                )
            )
        );

        restClient.post().uri(url).body(body).retrieve().toBodilessEntity();
    }
}
```
## 部署方案

### Docker 容器化

**Dockerfile（后端）：**

```dockerfile
FROM eclipse-temurin:17-jre-alpine

LABEL maintainer="dev-team@company.com"

RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app

WORKDIR /app

COPY build/libs/attendance-api.jar app.jar

RUN chown -R app:app /app
USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health | grep -q UP || exit 1

ENTRYPOINT ["java", \
  "-XX:+UseG1GC", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
```

**Dockerfile（前端）：**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### K8s 部署

**后端 Deployment：**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: attendance-api
  namespace: attendance
spec:
  replicas: 2
  selector:
    matchLabels:
      app: attendance-api
  template:
    metadata:
      labels:
        app: attendance-api
    spec:
      containers:
        - name: api
          image: registry.company.com/attendance-api:latest
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: prod
            - name: WECOM_CORP_ID
              valueFrom:
                secretKeyRef:
                  name: wecom-secrets
                  key: corp-id
            - name: WECOM_SECRET
              valueFrom:
                secretKeyRef:
                  name: wecom-secrets
                  key: secret
            - name: WECOM_AGENT_ID
              valueFrom:
                secretKeyRef:
                  name: wecom-secrets
                  key: agent-id
            - name: DB_URL
              valueFrom:
                secretKeyRef:
                  name: db-secrets
                  key: url
            - name: REDIS_HOST
              value: "redis-master.redis.svc.cluster.local"
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 60
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: attendance-api
  namespace: attendance
spec:
  selector:
    app: attendance-api
  ports:
    - port: 8080
      targetPort: 8080
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: attendance-api
  namespace: attendance
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: attendance-api
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### Nginx 反向代理配置

```nginx
# /etc/nginx/conf.d/attendance.conf

# 后端 API
upstream attendance_api {
    server attendance-api.attendance.svc.cluster.local:8080;
    keepalive 32;
}

# 前端静态资源
server {
    listen 443 ssl http2;
    server_name attendance.company.com;

    # SSL 证书
    ssl_certificate     /etc/nginx/ssl/attendance.crt;
    ssl_certificate_key /etc/nginx/ssl/attendance.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # 企业微信要求 HTTPS，配置 HSTS
    add_header Strict-Transport-Security "max-age=31536000" always;

    # 前端 H5
    location / {
        root /var/www/attendance-h5;
        try_files $uri $uri/ /index.html;

        # 静态资源缓存
        location ~* \.(js|css|png|jpg|svg|woff2)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 代理
    location /api/ {
        proxy_pass http://attendance_api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 文件上传大小（打卡照片）
        client_max_body_size 10m;

        # 超时设置
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }

    # 健康检查
    location /health {
        proxy_pass http://attendance_api/actuator/health;
        access_log off;
    }
}

# HTTP 强制跳转 HTTPS
server {
    listen 80;
    server_name attendance.company.com;
    return 301 https://$host$request_uri;
}
```

### 企业微信后台配置

在管理后台需要完成以下配置：

1. 应用主页 URL：`https://attendance.company.com`
2. 可信域名：`attendance.company.com`（需上传域名归属校验文件）
3. OAuth2 回调域名：`attendance.company.com`
4. 应用可见范围：选择需要使用考勤的部门
5. 通讯录同步：配置通讯录同步 API，或使用通讯录回调

### CI/CD 流水线

```yaml
# .github/workflows/attendance-deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]
    paths:
      - 'attendance-api/**'
      - 'attendance-h5/**'

jobs:
  build-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Build
        run: ./gradlew bootJar
      - name: Build Docker image
        run: |
          docker build -t registry.company.com/attendance-api:${{ github.sha }} .
          docker push registry.company.com/attendance-api:${{ github.sha }}

  build-h5:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci && npm run build
        working-directory: attendance-h5
      - name: Deploy to server
        run: |
          rsync -avz --delete attendance-h5/dist/ \
            deploy@server:/var/www/attendance-h5/

  deploy:
    needs: [build-api]
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to K8s
        run: |
          kubectl set image deployment/attendance-api \
            api=registry.company.com/attendance-api:${{ github.sha }} \
            -n attendance
          kubectl rollout status deployment/attendance-api -n attendance
```

## 安全与运维

### 安全要点

**1. access_token 安全管理：**
- access_token 绝不能暴露给前端
- 后端集中管理，使用 Redis 缓存（key 设 TTL=7000s）
- 多实例部署时通过 Redis 分布式锁防止并发刷新

**2. 敏感配置分离：**
```yaml
# application-prod.yml（不提交到 Git）
wecom:
  corp-id: ${WECOM_CORP_ID}
  secret: ${WECOM_SECRET}
  agent-id: ${WECOM_AGENT_ID}

spring:
  datasource:
    url: ${DB_URL}
    username: ${DB_USER}
    password: ${DB_PASSWORD}
```

**3. API 安全：**
- 所有接口需 JWT 认证（OAuth2 回调除外）
- 防重放：接口签名 + 时间戳校验
- 限流：基于 Redis 的滑动窗口限流

**4. 数据安全：**
- 打卡照片存储在内网 MinIO，不对外暴露
- 数据库定期备份（pg_dump 每日全量 + WAL 归档）
- 用户手机号等敏感字段加密存储

### 监控告警

```yaml
# Prometheus 监控指标
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus,metrics
  metrics:
    tags:
      application: attendance-api

# 关键监控指标：
# - attendance_clock_total{type="in|out",result="success|fail"}
# - attendance_clock_duration_seconds（打卡接口耗时）
# - wecom_api_calls_total{api="gettoken|getuserinfo|message_send"}
# - wecom_api_errors_total{api,errcode}
```

**告警规则示例：**
- access_token 获取失败 -> 立即告警（影响全局）
- 打卡接口 5xx 错误率 > 1% -> 告警
- 企业微信 API 调用失败率 > 5% -> 告警
- 定时任务执行失败 -> 告警

## 避坑指南

### 1. access_token 并发刷新

**问题**：多实例同时刷新 access_token，导致旧 token 失效，其他实例请求报错。

**方案**：使用 Redis 分布式锁：
```java
public String getAccessToken() {
    String cached = redisTemplate.opsForValue().get("wecom:access_token");
    if (cached != null) return cached;

    // 分布式锁，只允许一个实例刷新
    String lockKey = "wecom:token:lock";
    Boolean locked = redisTemplate.opsForValue()
        .setIfAbsent(lockKey, "1", 10, TimeUnit.SECONDS);

    if (Boolean.TRUE.equals(locked)) {
        try {
            // 双重检查
            cached = redisTemplate.opsForValue().get("wecom:access_token");
            if (cached != null) return cached;

            String newToken = fetchAccessTokenFromWeCom();
            // 提前 200 秒过期，留缓冲时间
            redisTemplate.opsForValue()
                .set("wecom:access_token", newToken, 7000, TimeUnit.SECONDS);
            return newToken;
        } finally {
            redisTemplate.delete(lockKey);
        }
    }

    // 等待其他实例刷新完成
    try { Thread.sleep(500); } catch (InterruptedException ignored) {}
    return redisTemplate.opsForValue().get("wecom:access_token");
}
```

### 2. OAuth2 code 只能用一次

企业微信 OAuth2 的 code 只能使用一次，且 5 分钟内有效。如果用户刷新页面导致重复使用 code，会报错 40029。

**方案**：前端在回调页拿到 code 后立即调用后端换取 token，然后清除 URL 中的 code 参数：
```javascript
// 获取 code 后立即清除 URL 参数
const code = urlParams.get('code')
if (code) {
  await exchangeCodeForToken(code)
  history.replaceState(null, '', window.location.pathname)
}
```

### 3. JS-SDK 签名 URL 必须精确匹配

iOS 和 Android 对 JS-SDK 签名 URL 的处理不同：
- Android：使用当前页面 URL
- iOS：使用入口页 URL（第一次进入应用的 URL）

**方案**：
```javascript
// iOS 下使用入口 URL 进行签名
const signUrl = isIOS() ? window.localStorage.getItem('entryUrl')
                        : window.location.href.split('#')[0]
```

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

企业微信应用开发的核心在于理解 OAuth2 认证流程和 API 对接模式。以考勤系统为例，完整的技术栈包括：

- **前端**：Vue 3 + Vant 4 移动端 H5，通过 JS-SDK 调用企业微信原生能力
- **后端**：SpringBoot 3 REST API，集中管理 access_token 和业务逻辑
- **数据库**：PostgreSQL 存储考勤规则和打卡记录，日汇总表加速报表查询
- **部署**：Docker + K8s 容器化，Nginx 反向代理 + HTTPS
- **安全**：JWT 认证、Redis 分布式锁、敏感配置环境变量注入

关键避坑点：access_token 并发刷新、OAuth2 code 一次性使用、JS-SDK 签名 URL iOS/Android 差异、API 频率限制。

官方文档：https://developer.work.weixin.qq.com/document/

> 本文以考勤系统为例，但企业微信应用开发的核心模式（OAuth2 认证 -> API 对接 -> JS-SDK 集成 -> 消息推送 -> 容器化部署）适用于所有类型的企业微信应用开发。
