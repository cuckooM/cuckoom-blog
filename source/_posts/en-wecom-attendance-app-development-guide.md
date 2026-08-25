---
title: "Complete Guide to WeCom App Development: Building an Attendance System"
date: 2026-07-09 21:00:00
tags:
  - WeCom
  - Mini Program Development
  - Attendance System
  - API Integration
  - Mobile Development
categories:
  - Technical Practice
lang: en
---

WeCom (Enterprise WeChat), as an enterprise-level communication and collaboration platform, provides rich open APIs supporting enterprise self-built applications, third-party applications, and proxy-developed applications. As the capabilities of WeCom Mini Programs continue to evolve, more and more enterprises choose to develop internal applications in mini program mode to achieve a more native-like experience and stronger device capability access.

This article uses an attendance system as a case study, **with WeCom Mini Program mode as the main thread**, to systematically explain the entire application development process. It covers mini program registration and creation, project structure, identity authentication, geolocation check-in, photo check-in, QR code scan check-in, backend API integration, message push, security design, and other key aspects. It also compares and explains the differences with the H5 application mode to help R&D teams with technology selection and implementation.

<!-- more -->

## I. Overview of WeCom App Development

### 1.1 Platform Positioning

The WeCom Open Platform provides developers with a complete API system covering address book management, message push, OAuth authentication, JS-SDK, mini programs, efficiency tools (check-in, approval, reporting), and other capabilities. Developers can build enterprise internal applications based on these APIs, or develop third-party applications serving multiple enterprises.

### 1.2 Application Types

| Type | Applicable Scenario | Characteristics |
|------|----------|------|
| Self-built App | Internal enterprise use | Visible only to the enterprise, flexible configuration, API permissions assigned by administrators |
| Third-party App | Serving multiple enterprises | Requires WeCom review, supports multi-enterprise authorized installation |
| Proxy-developed App | Developed by service provider on behalf of enterprise | Enterprise authorizes service provider, who develops and maintains on their behalf |

This article focuses on **self-built applications**, which is the most common development scenario.

### 1.3 Development Mode: Mini Program vs H5

WeCom application development has two main modes: **Mini Program mode** and **H5 Application mode**. Each has its pros and cons, and both should be considered comprehensively when selecting.

| Comparison Dimension | WeCom Mini Program | H5 Application |
|----------|--------------|---------|
| Runtime Environment | WeCom Mini Program runtime | WeCom built-in browser WebView |
| Development Framework | WXML/WXSS/JS (similar to WeChat Mini Program) | Any frontend framework (Vue/React, etc.) |
| Performance Experience | Near-native, fast startup, smooth page transitions | Depends on WebView, slower first-screen loading |
| Offline Capability | Supports local cache, usable on weak networks | No offline support, network-dependent |
| Device Capabilities | Native API direct calls (`wx.getLocation`, etc.) | Requires indirect calls via JS-SDK, needs signature verification |
| Identity Authentication | `wx.qyLogin` to get code, silent and seamless | OAuth2 web authorization redirect, user-aware |
| Publishing Process | Requires review submission, strict version management | Takes effect upon deployment, no review needed |
| Update Flexibility | Requires re-publishing a version to update | Hot update anytime, high flexibility |
| Cross-platform Consistency | WeCom guarantees multi-platform consistency | Need to adapt to iOS/Android WebView differences yourself |
| Applicable Scenarios | High-frequency use, high performance requirements, device capability access needed | Rapid development, frequent iteration, content-oriented applications |

**Selection Recommendations:**

- **Attendance system recommends Mini Program mode**: Attendance is a high-frequency operation with requirements for location accuracy, photo speed, and startup speed. Mini program's native API calls are more direct and provide a better experience
- **Approval system can use H5 mode**: Approval workflow forms are complex and change frequently. H5 offers higher flexibility
- **Hybrid mode**: The same self-built application can configure both mini program entry and H5 entry, guiding users by scenario

This article uses **Mini Program mode as the main thread** to explain attendance system development, with comparisons to H5 mode differences at key points.

## II. Development Environment Setup

### 2.1 Registering WeCom and Creating an Application

1. Visit [WeCom Admin Console](https://work.weixin.qq.com/) and register for WeCom (requires administrator operation)
2. Go to "App Management" -> "Self-built" -> "Create App"
3. Fill in the application name, logo, visible scope (which departments/employees can use it)
4. After creation, obtain three key parameters:

| Parameter | Description | Location |
|------|------|----------|
| `corpid` | Enterprise unique identifier | My Enterprise -> Enterprise Info -> Enterprise ID |
| `agentid` | Application unique identifier | App Management -> Self-built App -> AgentId |
| `secret` | Application secret | App Management -> Self-built App -> Secret |

> ⚠️ `secret` is the most sensitive credential. **It must never appear in frontend code** and must be stored on the server side.

### 2.2 Creating a WeCom Mini Program

The creation process for a WeCom Mini Program is similar to a WeChat Mini Program, but it is bound to the WeCom entity:

1. Log in to [WeCom Admin Console](https://work.weixin.qq.com/) -> "App Management" -> Select self-built app
2. On the app detail page, find the "Mini Program" module and click "Bind/Create Mini Program"
3. WeCom supports two ways to associate a mini program:
   - **Associate existing WeChat Mini Program**: Reuse a mini program registered on WeChat Open Platform, requires the same entity
   - **Create directly within WeCom**: WeCom self-built mini program, does not depend on WeChat Open Platform
4. After creation, obtain `wx_app_id` (Mini Program AppID) on the mini program management page

**Development Tools**: Use [WeChat Developer Tools](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) for development and debugging. Select "WeCom Mini Program" mode or associate through the WeCom plugin.

```bash
# Download WeChat Developer Tools (CLI version, for CI)
# Official download page: https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
# CLI path example (macOS):
/Applications/wechatwebdevtools.app/Contents/MacOS/cli \
  --login --project /path/to/miniprogram \
  --preview --qr-output /tmp/preview-qr.png
```

### 2.3 Configuring Trusted Domains and Server Domains

**H5 mode** requires configuring trusted domains (web authorization and JS-SDK):

```
App Management -> Self-built App -> Developer Interface -> Web Authorization & JS-SDK
  -> Set Trusted Domain: attendance.yourcompany.com
  -> Download domain ownership verification file and place it in the domain root directory
```

**Mini Program mode** requires configuring "Server Domains" in the admin console (request, uploadFile, downloadFile, socket):

```
App Management -> Self-built App -> Developer Interface -> Mini Program
  -> Server Domains:
    request valid domain: https://api.attendance.yourcompany.com
    uploadFile valid domain: https://upload.attendance.yourcompany.com
    downloadFile valid domain: https://download.attendance.yourcompany.com
```

Domains must meet:
- Support HTTPS (production environment, mandatory for mini programs)
- ICP filing completed (mainland China servers)
- request domain does not support IP addresses or localhost
- Maximum 50 domain configuration changes per month

### 2.4 Local Development Environment

Mini program development uses WeChat Developer Tools. Local HTTPS domain penetration is not needed, but a backend service is still required:

```bash
# Start backend locally (SpringBoot)
cd ~/work/code/attendance-backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev

# Configure in Mini Program Developer Tools:
# - Development Settings -> Do not verify valid domains (check during development phase)
# - AppID: enter the WeCom Mini Program AppID
# - Debug base library: select the latest stable version
```

H5 mode local development needs to resolve HTTPS and domain verification issues:

```bash
# H5 mode: Use ngrok or frp for internal network penetration
ngrok http 8080

# Or use mkcert to generate local HTTPS certificates
mkcert -install
mkcert localhost 127.0.0.1

# Configure hosts file (point trusted domain to local)
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

During development, you can configure the trusted domain as the internal network penetration address in the WeCom console, but be mindful of token security.

## III. Mini Program Project Structure

The project structure of a WeCom Mini Program is identical to a WeChat Mini Program. Using TypeScript for development provides better type safety and development experience.

### 3.1 Directory Structure

```
miniprogram/
├── app.ts                    # Mini program entry logic
├── app.json                  # Mini program global configuration
├── app.wxss                  # Global styles
├── sitemap.json              # Search configuration
├── project.config.json       # Project configuration (AppID, build settings, etc.)
├── tsconfig.json             # TypeScript configuration
├── typings/                  # Type declarations
│   ├── index.d.ts
│   └── wecom.d.ts            # WeCom API type supplements
├── pages/
│   ├── index/                # Home page (attendance check-in)
│   │   ├── index.ts
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   ├── records/              # Check-in records
│   │   ├── index.ts
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   ├── apply/                # Make-up check-in application
│   │   ├── index.ts
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   └── scan/                 # QR code scan check-in
│       ├── index.ts
│       ├── index.wxml
│       ├── index.wxss
│       └── index.json
├── components/
│   ├── checkin-button/      # Check-in button component
│   └── location-card/       # Location info card
├── services/                 # Business service layer
│   ├── auth.service.ts       # Authentication service
│   ├── checkin.service.ts   # Check-in service
│   └── api.service.ts       # HTTP request wrapper
├── utils/
│   ├── request.ts            # Request utility (with token injection)
│   ├── location.ts           # Location utility
│   └── format.ts             # Formatting utility
└── config/
    ├── env.ts               # Environment configuration
    └── constant.ts           # Constants
```

### 3.2 app.json Global Configuration

```json
{
  "pages": [
    "pages/index/index",
    "pages/records/index",
    "pages/apply/index",
    "pages/scan/index"
  ],
  "window": {
    "navigationBarTitleText": "Attendance System",
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
        "text": "Check-in"
      },
      {
        "pagePath": "pages/records/index",
        "text": "Records"
      }
    ]
  },
  "permission": {
    "scope.userLocation": {
      "desc": "Used for attendance check-in location verification"
    }
  },
  "requiredPrivateInfos": [
    "getLocation"
  ],
  "usingComponents": {}
}
```

> ⚠️ Since 2023, WeCom Mini Programs require declaring `requiredPrivateInfos` in `app.json`, otherwise privacy APIs like `wx.getLocation` cannot be called.

### 3.3 app.ts Entry Logic

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
    // Execute WeCom login on mini program launch
    this.qyLogin();
  },

  /**
   * WeCom login flow
   * 1. Call wx.qyLogin to get code
   * 2. Send code to backend
   * 3. Backend exchanges code for userid and session_key
   * 4. Cache server token for subsequent business requests
   */
  async qyLogin() {
    try {
      const { code } = await wx.qyLogin({
        desc: 'Get WeCom identity',
      });

      if (!code) {
        console.error('qyLogin did not return code');
        return;
      }

      // Send code to backend to exchange for token
      const result = await this.requestLogin(code);

      this.globalData.serverToken = result.token;
      this.globalData.userInfo = result.userInfo;

      console.log('WeCom login successful', result.userInfo.userid);
    } catch (err) {
      console.error('WeCom login failed', err);
      wx.showToast({ title: 'Login failed, please retry', icon: 'error' });
    }
  },

  /**
   * Call backend login API
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
            reject(new Error(res.data.message || 'Login failed'));
          }
        },
        fail: reject,
      });
    });
  },

  /**
   * Get server token (with local cache)
   */
  getServerToken(): string | undefined {
    return this.globalData.serverToken;
  },
});
```

> 💡 **Comparison with H5 mode**: H5 mode requires OAuth2 web authorization redirect to obtain code, involving page redirects and URL parameter handling. Mini program mode obtains code directly via `wx.qyLogin` without page redirection, providing a smoother experience.

### 3.4 TypeScript Configuration

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

### 3.5 WeCom API Type Declarations

The base library types for WeChat Mini Programs do not include WeCom-specific APIs, so supplementary declarations are needed:

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
  // WeCom-specific APIs
  qyLogin(option: WeComQyLoginOption): void;
  selectEnterpriseContact(option: WeComSelectEnterpriseContactOption): void;
  qwChooseEnterpriseContact(option: WeComSelectEnterpriseContactOption): void;

  // Common APIs (WeChat Mini Program base library)
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

## IV. WeCom Mini Program Identity Authentication

### 4.1 Login Flow Overview

The login flow for WeCom Mini Programs is simpler than H5 OAuth, and is completely seamless:

```
Mini Program                Backend Service           WeCom API
  │                          │                        │
  │  1. wx.qyLogin()         │                        │
  │ ─────────────────────────│                        │
  │  get code               │                        │
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
  │                          │  5. Generate JWT/Session│
  │                          │    Cache to Redis       │
  │                          │                        │
  │  6. Return JWT + userInfo │                        │
  │ ◀─────────────────────────                        │
  │                          │                        │
  │  7. Subsequent requests carry JWT │                │
  │ ─────────────────────────▶                        │
```

### 4.2 Mini Program Side: wx.qyLogin

`wx.qyLogin` is a WeCom Mini Program-specific API. The returned `code` is used to exchange for user identity on the server side.

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
   * WeCom login
   * The code returned by wx.qyLogin is valid for 5 minutes and can only be used once
   */
  async qyLogin(): Promise<void> {
    const { code } = await this.callQyLogin();
    if (!code) {
      throw new Error('qyLogin did not obtain code');
    }

    const result = await this.exchangeToken(code);
    this.serverToken = result.token;
    this.userInfo = result.userInfo;

    // Cache token locally (no re-login needed within validity period)
    wx.setStorage({
      key: 'server_token',
      data: result.token,
    });
  }

  private callQyLogin(): Promise<{ code: string }> {
    return new Promise((resolve, reject) => {
      wx.qyLogin({
        desc: 'Get WeCom identity',
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
              reject(new Error(res.data?.message || 'Token exchange failed'));
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

### 4.3 Backend: Exchanging code for userid

The backend uses `code` to call the WeCom `jscode2session` API to obtain `userid` and `session_key`.

**API Endpoint**:

```
GET https://qyapi.weixin.qq.com/cgi-bin/service/miniprogram/jscode2session
  ?access_token=ACCESS_TOKEN
  &js_code=CODE
  &grant_type=authorization_code
```

**SpringBoot Implementation**:

```java
/**
 * WeCom Authentication Controller
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
     * Mini program login: exchange code for userid, issue JWT
     *
     * @param request Mini program login request
     * @return JWT token + user info
     */
    @PostMapping("/qy-login")
    public Result<QyLoginVO> qyLogin(@RequestBody @Valid QyLoginDTO request) {
        log.info("WeCom mini program login, code={}", request.getCode());
        try {
            // 1. Exchange code for userid and session_key
            QySessionDTO session = qyAuthService.code2Session(request.getCode());
            log.info("Login successful, userid={}", session.getUserid());

            // 2. Query/create user record
            SysUser user = qyAuthService.getOrCreateUser(session.getUserid());

            // 3. Issue JWT
            String token = jwtTokenProvider.generateToken(user.getId(), user.getWecomUserId());

            // 4. Cache session_key (for decrypting encrypted data later)
            qyAuthService.cacheSessionKey(session.getUserid(), session.getSessionKey());

            // 5. Build response object
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
            log.warn("WeCom login business exception: {}", e.getMessage());
            return Result.fail(e.getCode(), e.getMessage());
        } catch (Exception e) {
            log.error("WeCom login system exception", e);
            return Result.fail(ErrorCode.SYSTEM_ERROR);
        }
    }
}
```

```java
/**
 * WeCom Authentication Service
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
     * Exchange mini program code for session
     *
     * @param code code returned by wx.qyLogin
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
                    "Failed to exchange code for session: " + (response == null ? "null" : response.getString("errmsg")));
        }

        return QySessionDTO.builder()
                .userid(response.getString("userid"))
                .sessionKey(response.getString("session_key"))
                .build();
    }

    /**
     * Query or create system user
     */
    public SysUser getOrCreateUser(String wecomUserId) {
        SysUser user = userMapper.findByWecomUserId(wecomUserId);
        if (user != null) {
            return user;
        }

        // New user: get details via address book API and persist
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
     * Cache session_key (valid for 7 days)
     */
    public void cacheSessionKey(String userid, String sessionKey) {
        String key = SESSION_KEY_CACHE_PREFIX + userid;
        redisTemplate.opsForValue().set(key, sessionKey, 7, TimeUnit.DAYS);
    }

    /**
     * Get cached session_key
     */
    public String getSessionKey(String userid) {
        return redisTemplate.opsForValue().get(SESSION_KEY_CACHE_PREFIX + userid);
    }

    /**
     * Get user details via address book API
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
                    "Failed to get user info: " + (response == null ? "null" : response.getString("errmsg")));
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

### 4.4 JWT Authentication Interceptor

```java
/**
 * JWT Authentication Interceptor
 * Validates the Authorization token in request header
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
        // Allow login and callback endpoints
        String uri = request.getRequestURI();
        if (uri.contains("/api/auth/") || uri.contains("/api/wecom/callback/")) {
            return true;
        }

        String header = request.getHeader(AUTH_HEADER);
        if (header == null || !header.startsWith(TOKEN_PREFIX)) {
            sendError(response, 401, "Missing authentication info");
            return false;
        }

        String token = header.substring(TOKEN_PREFIX.length());
        try {
            Claims claims = jwtTokenProvider.parseToken(token);
            Long userId = claims.get("userId", Long.class);
            String wecomUserId = claims.get("wecomUserId", String.class);

            // Store user info in request for Controller use
            request.setAttribute("currentUserId", userId);
            request.setAttribute("currentWecomUserId", wecomUserId);

            return true;
        } catch (ExpiredJwtException e) {
            sendError(response, 401, "Token expired, please log in again");
            return false;
        } catch (Exception e) {
            log.warn("JWT validation failed", e);
            sendError(response, 401, "Invalid authentication info");
            return false;
        }
    }

    private void sendError(HttpServletResponse response, int code, String msg) {
        response.setStatus(code);
        response.setContentType("application/json;charset=UTF-8");
        try {
            response.getWriter().write(JSONUtil.toJsonStr(Result.fail(code, msg)));
        } catch (IOException e) {
            log.error("Failed to write error response", e);
        }
    }
}
```

> 💡 **Difference from H5 mode**: H5 mode uses OAuth2 web authorization, which requires constructing an authorization link -> user consent -> redirect callback -> backend exchanging for userid. The process involves multiple page redirects. Mini program mode obtains code in one step via `wx.qyLogin`, and the backend directly exchanges for userid without user awareness, providing a better experience.

## V. Attendance Check-in Feature Implementation

### 5.1 Backend API Integration

#### 5.1.1 access_token Management

access_token is the global ticket for WeCom APIs. All server-side API calls require it.

**API Endpoint**:

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

**Response**:

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "access_token": "***",
  "expires_in": 7200
}
```

**Key Strategies**:
- Valid for 7200 seconds (2 hours), needs proactive refresh
- The valid access_token for the same application is unique. Repeated retrieval will invalidate the old token
- **Must be obtained on the server side**, cannot be called directly from the frontend (would expose secret)
- Recommended to use Redis cache with an expiration of 7100 seconds (100-second margin)
- Multi-instance deployment requires distributed locks to prevent concurrent refresh

**SpringBoot Token Manager**:

```java
/**
 * WeCom access_token Manager
 * Uses Redis cache + distributed lock to prevent concurrent refresh
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
     * Get access_token (double-check + distributed lock)
     */
    public String getAccessToken() {
        // 1. Check cache first
        String cached = redisTemplate.opsForValue().get(TOKEN_CACHE_KEY);
        if (StrUtil.isNotBlank(cached)) {
            return cached;
        }

        // 2. Acquire distributed lock
        Boolean locked = redisTemplate.opsForValue()
                .setIfAbsent(TOKEN_LOCK_KEY, "1", 10, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(locked)) {
            // Failed to acquire lock, wait and retry
            return waitForToken();
        }

        try {
            // 3. Double check
            cached = redisTemplate.opsForValue().get(TOKEN_CACHE_KEY);
            if (StrUtil.isNotBlank(cached)) {
                return cached;
            }

            // 4. Call WeCom API to refresh
            return refreshTokenFromWecom();
        } finally {
            // 5. Release lock
            redisTemplate.delete(TOKEN_LOCK_KEY);
        }
    }

    /**
     * Call WeCom API to get new token
     */
    private String refreshTokenFromWecom() {
        String url = String.format(
                "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=%s&corpsecret=%s",
                corpId, secret
        );

        JSONObject response = restTemplate.getForObject(url, JSONObject.class);
        if (response == null || response.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR,
                    "Failed to get access_token: " + (response == null ? "null" : response.getString("errmsg")));
        }

        String accessToken = response.getString("access_token");
        redisTemplate.opsForValue().set(
                TOKEN_CACHE_KEY, accessToken,
                TOKEN_EXPIRE_SECONDS, TimeUnit.SECONDS
        );

        log.info("WeCom access_token refreshed successfully");
        return accessToken;
    }

    /**
     * Wait for other instances to refresh token
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
        throw new BusinessException(ErrorCode.WECOM_API_ERROR, "Timed out getting access_token");
    }
}
```

#### 5.1.2 Address Book Management

Through the address book API, you can synchronize enterprise organizational structure and employee information.

**Get Department List**:

```
GET https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=TOKEN&id=0
```

**Get Department Member Details**:

```
GET https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token=TOKEN&department_id=1&fetch_child=1
```

**Response Example**:

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "userlist": [
    {
      "userid": "zhangsan",
      "name": "Zhang San",
      "department": [1, 2],
      "position": "Product Manager",
      "mobile": "13800138000",
      "email": "zhangsan@company.com",
      "status": 1,
      "avatar": "https://..."
    }
  ]
}
```

**Sync Strategy**: It is recommended to perform a full address book sync daily at midnight, while configuring address book change callbacks (see the callback chapter below) to achieve incremental real-time sync.

#### 5.1.3 Request Utility Wrapper

The mini program side wraps a unified request utility that automatically injects the JWT token:

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

  // Automatically inject JWT token
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
          // Token expired, re-login
          app.qyLogin();
          reject(new Error('Session expired'));
          return;
        }
        if (res.statusCode === 200) {
          const body = res.data as ApiResponse<T>;
          if (body.code === 0) {
            resolve(body.data);
          } else {
            wx.showToast({ title: body.message || 'Request failed', icon: 'error' });
            reject(new Error(body.message));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      },
      fail: (err) => {
        wx.showToast({ title: 'Network error', icon: 'error' });
        reject(err);
      },
    });
  });
}
```

### 5.2 Geolocation Check-in

Geolocation is the core feature of an attendance system. The mini program obtains device location directly via `wx.getLocation` without JS-SDK signature verification (which H5 mode requires).

#### 5.2.1 Mini Program Implementation

```typescript
// utils/location.ts

interface LocationInfo {
  latitude: number;
  longitude: number;
  accuracy: number;  // Location accuracy (meters)
  speed: number;
}

/**
 * Get current location
 * Requires declaring requiredPrivateInfos: ["getLocation"] in app.json
 */
export async function getCurrentLocation(): Promise<LocationInfo> {
  // Check location permission
  const hasPermission = await checkLocationPermission();
  if (!hasPermission) {
    const granted = await requestLocationPermission();
    if (!granted) {
      throw new Error('Please allow location permission to use check-in');
    }
  }

  // High-accuracy positioning mode
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
        console.error('Failed to get location', err);
        reject(new Error('Failed to get location, please check if GPS is enabled'));
      },
    });
  });
}

/**
 * Check location permission
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
 * Request location permission
 */
function requestLocationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.authorize({
      scope: 'scope.userLocation',
      success: () => resolve(true),
      fail: () => {
        // Guide user to settings page
        wx.showModal({
          title: 'Location Permission',
          content: 'Check-in requires location permission, please enable it in settings',
          confirmText: 'Go to Settings',
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
 * Calculate distance between two points (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius (meters)
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}
```

#### 5.2.2 Check-in Page

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

// Company check-in range configuration
const COMPANY_LAT = 30.2741;
const COMPANY_LNG = 120.1551;
const ALLOWED_RADIUS = 200; // Allowed check-in radius (meters)

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
      // 1. Get location
      const location = await getCurrentLocation();

      // 2. Calculate distance
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
        locationText: inRange ? 'Within check-in range' : `${Math.round(distance)}m from company`,
      });

      if (!inRange) {
        wx.showModal({
          title: 'Out of Range',
          content: `You are ${Math.round(distance)}m from the company, exceeding the allowed range of ${ALLOWED_RADIUS}m.`,
          showCancel: false,
        });
        return;
      }

      // 3. Submit check-in
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

      wx.showToast({ title: 'Check-in successful', icon: 'success' });
      console.log('Check-in result', result);
    } catch (err) {
      console.error('Check-in failed', err);
      wx.showToast({
        title: err.message || 'Check-in failed',
        icon: 'error',
      });
    } finally {
      this.setData({ loading: false });
    }
  },
});
```

#### 5.2.3 Backend Check-in API

```java
/**
 * Attendance Check-in Controller
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
     * Submit check-in
     *
     * @param request Check-in request
     * @param userId Current user ID (injected from JWT interceptor)
     */
    @PostMapping("/submit")
    public Result<CheckinVO> submit(
            @RequestBody @Valid CheckinDTO request,
            HttpServletRequest httpRequest
    ) {
        Long userId = (Long) httpRequest.getAttribute("currentUserId");
        String wecomUserId = (String) httpRequest.getAttribute("currentWecomUserId");

        log.info("User {} submitting check-in, location=({},{})",
                wecomUserId, request.getLatitude(), request.getLongitude());

        CheckinVO vo = checkinService.checkin(userId, request);
        return Result.success(vo);
    }

    /**
     * Query today's check-in records
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
 * Attendance Check-in Service
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
     * Check in
     */
    @Transactional(rollbackFor = Exception.class)
    public CheckinVO checkin(Long userId, CheckinDTO dto) {
        // 1. Distance validation
        double distance = calculateDistance(
                dto.getLatitude(), dto.getLongitude(),
                companyLat, companyLng
        );

        if (distance > allowedRadius) {
            throw new BusinessException(ErrorCode.OUT_OF_RANGE,
                    String.format("Out of check-in range, %.0fm from company", distance));
        }

        // 2. Prevent duplicate check-in (same type within 5 minutes)
        String checkinType = determineCheckinType(LocalDateTime.now());
        CheckinRecord existing = checkinMapper.findRecentRecord(
                userId, checkinType, 5
        );
        if (existing != null) {
            throw new BusinessException(ErrorCode.DUPLICATE_CHECKIN,
                    "Already checked in within 5 minutes, please do not duplicate check-in");
        }

        // 3. Save check-in record
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

        // 4. Push check-in success notification
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
            return "CLOCK_IN";  // Clock in
        } else {
            return "CLOCK_OUT"; // Clock out
        }
    }
}
```

> 💡 **Comparison with H5 mode**: H5 mode requires `wx.getLocation` via JS-SDK, which first requires `wx.config` signature verification. The signature URL handling differs between iOS and Android, leading to many pitfalls. Mini program mode calls `wx.getLocation` directly without signatures, with unified APIs, providing significantly better development experience.

### 5.3 Photo Check-in

Photo check-in is used for scenarios requiring on-site photo evidence (e.g., field work check-in, make-up check-in explanation).

#### 5.3.1 Mini Program Implementation

```typescript
// pages/index/index.ts (Photo check-in portion)

import { request } from '../../utils/request';

/**
 * Photo check-in
 * Uses wx.chooseMedia to get photos (recommended, replaces deprecated wx.chooseImage)
 */
async handlePhotoCheckin() {
  if (this.data.loading) return;
  this.setData({ loading: true });

  try {
    // 1. Take photo
    const media = await this.takePhoto();
    if (!media.tempFilePath) {
      throw new Error('Photo capture failed');
    }

    // 2. Get location (photo check-in also requires location validation)
    const location = await getCurrentLocation();
    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      COMPANY_LAT,
      COMPANY_LNG,
    );

    // 3. Upload photo to server
    const uploadResult = await this.uploadPhoto(
      media.tempFilePath,
      location.latitude,
      location.longitude,
    );

    wx.showToast({ title: 'Photo check-in successful', icon: 'success' });
    console.log('Upload result', uploadResult);
  } catch (err) {
    console.error('Photo check-in failed', err);
    wx.showToast({ title: err.message || 'Photo check-in failed', icon: 'error' });
  } finally {
    this.setData({ loading: false });
  }
}

/**
 * Take photo using camera
 */
private takePhoto(): Promise<{ tempFilePath: string }> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],     // Only allow camera, no album selection (anti-cheating)
      camera: 'back',              // Rear camera
      sizeType: ['compressed'],    // Compressed upload
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          resolve({ tempFilePath: res.tempFiles[0].tempFilePath });
        } else {
          reject(new Error('No photo obtained'));
        }
      },
      fail: (err) => {
        reject(new Error('Photo cancelled or failed'));
      },
    });
  });
}

/**
 * Upload photo to server
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
            reject(new Error(body.message || 'Upload failed'));
          }
        } else {
          reject(new Error(`Upload failed HTTP ${res.statusCode}`));
        }
      },
      fail: reject,
    });
  });
}
```

#### 5.3.2 Backend Photo Upload API

```java
/**
 * Photo Check-in Controller
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
     * Photo check-in upload
     *
     * @param file Photo file
     * @param latitude Latitude
     * @param longitude Longitude
     */
    @PostMapping("/photo")
    public Result<CheckinVO> photoCheckin(
            @RequestParam("photo") MultipartFile file,
            @RequestParam("latitude") double latitude,
            @RequestParam("longitude") double longitude,
            HttpServletRequest httpRequest
    ) {
        Long userId = (Long) httpRequest.getAttribute("currentUserId");

        // 1. Validate file
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.PARAM_ERROR, "Photo cannot be empty");
        }
        if (file.getSize() > 5 * 1024 * 1024) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE, "Photo cannot exceed 5MB");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new BusinessException(ErrorCode.FILE_TYPE_ERROR, "Only image formats are supported");
        }

        // 2. Store photo to internal network (not publicly accessible)
        String photoPath = fileStorageService.store(file, "checkin/" + userId);

        // 3. Create check-in record
        CheckinDTO dto = new CheckinDTO();
        dto.setLatitude(latitude);
        dto.setLongitude(longitude);
        dto.setPhotoPath(photoPath);

        CheckinVO vo = checkinService.photoCheckin(userId, dto);
        return Result.success(vo);
    }
}
```

### 5.4 QR Code Scan Check-in

QR code scan check-in is suitable for scenarios like workstation sign-in, meeting room sign-in, where users scan a fixed QR code to complete check-in.

#### 5.4.1 Mini Program Implementation

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
      // 1. Call QR code scan
      const res = await this.scanQRCode();
      const qrContent = res.result;

      if (!qrContent) {
        throw new Error('Scan content is empty');
      }

      // 2. Validate QR code content (must contain specific prefix)
      if (!qrContent.startsWith('wecom-attendance://')) {
        throw new Error('Not an attendance QR code, cannot check in');
      }

      // 3. Extract token
      const qrToken = qrContent.replace('wecom-attendance://', '');

      // 4. Get location simultaneously (anti-cheating: scan + location dual verification)
      const location = await getCurrentLocation();

      // 5. Submit scan check-in
      const result = await request<{ checkinId: string; time: string }>({
        url: '/api/checkin/scan',
        method: 'POST',
        data: {
          qrToken,
          latitude: location.latitude,
          longitude: location.longitude,
        },
      });

      this.setData({ result: 'Check-in successful' });
      wx.showToast({ title: 'Scan check-in successful', icon: 'success' });
      console.log('Scan check-in result', result);
    } catch (err) {
      console.error('Scan check-in failed', err);
      this.setData({ result: err.message || 'Scan check-in failed' });
      wx.showToast({ title: err.message || 'Scan check-in failed', icon: 'error' });
    } finally {
      this.setData({ scanning: false });
    }
  },

  /**
   * Call wx.scanCode to scan QR code
   */
  scanQRCode(): Promise<{ result: string }> {
    return new Promise((resolve, reject) => {
      wx.scanCode({
        onlyFromCamera: true,   // Only allow scanning from camera (anti-screenshot cheating)
        scanType: ['qrCode'],   // Only scan QR codes
        success: resolve,
        fail: () => {
          reject(new Error('Scan cancelled or failed'));
        },
      });
    });
  },
});
```

#### 5.4.2 Backend Scan Check-in API

```java
/**
 * Scan Check-in Controller
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
     * Scan check-in
     *
     * @param request Scan check-in request
     */
    @PostMapping("/scan")
    public Result<CheckinVO> scanCheckin(
            @RequestBody @Valid ScanCheckinDTO request,
            HttpServletRequest httpRequest
    ) {
        Long userId = (Long) httpRequest.getAttribute("currentUserId");

        log.info("User {} scan check-in, qrToken={}", userId, request.getQrToken());

        CheckinVO vo = checkinService.scanCheckin(userId, request);
        return Result.success(vo);
    }
}
```

```java
/**
 * Scan Check-in Service Implementation
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
        // 1. Validate QR code token
        QrToken qrToken = qrTokenMapper.findByToken(dto.getQrToken());
        if (qrToken == null) {
            throw new BusinessException(ErrorCode.INVALID_QR_TOKEN, "Invalid check-in QR code");
        }
        if (qrToken.getExpireTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.EXPIRED_QR_TOKEN, "Check-in QR code has expired");
        }
        if (qrToken.getStatus() == 0) {
            throw new BusinessException(ErrorCode.QR_TOKEN_DISABLED, "Check-in QR code has been disabled");
        }

        // 2. Location validation
        double distance = calculateDistance(
                dto.getLatitude(), dto.getLongitude(),
                COMPANY_LAT, COMPANY_LNG
        );
        if (distance > ALLOWED_RADIUS) {
            throw new BusinessException(ErrorCode.OUT_OF_RANGE,
                    String.format("Out of check-in range, %.0fm from company", distance));
        }

        // 3. Prevent duplicate check-in
        CheckinRecord existing = checkinMapper.findRecentRecord(userId, "SCAN", 5);
        if (existing != null) {
            throw new BusinessException(ErrorCode.DUPLICATE_CHECKIN, "Already scanned check-in within 5 minutes");
        }

        // 4. Save check-in record
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

        // 5. Push notification
        messageService.sendCheckinNotification(record);

        return CheckinVO.builder()
                .checkinId(record.getId().toString())
                .time(record.getCheckinTime().toString())
                .type("SCAN")
                .distance(Math.round(distance))
                .build();
    }

    // ... other methods omitted
}
```

## VI. Message Push and Callbacks

### 6.1 Application Message Push

Message push is an important capability of WeCom applications, used for attendance reminders, approval notifications, and other scenarios.

**Send Application Message**:

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

**Text Message**:

```json
{
  "touser": "zhangsan|lisi",
  "toparty": "2|3",
  "totag": "tag1",
  "msgtype": "text",
  "agentid": 1000002,
  "text": {
    "content": "Your clock-in time today is 09:00, please check in on time."
  },
  "duplicate_check_interval": 1800
}
```

**Text Card Message** (recommended, can jump to application page):

```json
{
  "touser": "zhangsan",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "Attendance Reminder",
    "description": "15 minutes until clock-in deadline, please check in on time.",
    "url": "https://attendance.yourcompany.com/checkin",
    "btntxt": "Go Check-in"
  }
}
```

**Template Card Message** (supports interactive buttons, suitable for approval notifications):

```json
{
  "touser": "zhangsan",
  "msgtype": "template_card",
  "agentid": 1000002,
  "template_card": {
    "card_type": "button_interaction",
    "source": {
      "desc": "Attendance System"
    },
    "main_title": {
      "title": "Make-up Check-in Approval",
      "desc": "Li Si requests make-up check-in for 2026-07-08 morning"
    },
    "sub_title_text": "Reason: Forgot to check in, workstation surveillance footage as evidence",
    "button_list": [
      {
        "text": "Approve",
        "style": 1,
        "key": "approve"
      },
      {
        "text": "Reject",
        "style": 2,
        "key": "reject"
      }
    ],
    "task_id": "task_20260708_001"
  }
}
```

> 💡 **Mini Program Jump**: The `url` field of text cards and template cards supports mini program jump paths (e.g., `#wecom-miniprogram://pages/index/index`). Users can click the message to directly open the corresponding mini program page instead of an H5 link.

**SpringBoot Message Push Implementation**:

```java
/**
 * WeCom Message Push Service
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
     * Send check-in success notification
     */
    public void sendCheckinNotification(CheckinRecord record) {
        String userid = getUserId(record.getUserId());
        if (StrUtil.isBlank(userid)) {
            log.warn("Unable to get WeCom userid, skipping push: userId={}", record.getUserId());
            return;
        }

        String typeText = "CLOCK_IN".equals(record.getCheckinType()) ? "Clock-in" : "Clock-out";
        if ("SCAN".equals(record.getCheckinType())) {
            typeText = "Scan";
        }

        Map<String, Object> message = new HashMap<>();
        message.put("touser", userid);
        message.put("msgtype", "textcard");
        message.put("agentid", agentId);

        Map<String, Object> textCard = new HashMap<>();
        textCard.put("title", "Check-in Successful");
        textCard.put("description", String.format(
                "%s check-in successful\nTime: %s\nDistance from company: %dm",
                typeText,
                record.getCheckinTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                record.getDistance()
        ));
        // Mini program jump link
        textCard.put("url", "#wecom-miniprogram://pages/records/index");
        textCard.put("btntxt", "View Records");
        message.put("textcard", textCard);

        sendMessage(message);
    }

    /**
     * Send attendance reminder
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
                log.info("Message push successful: {}", response.getString("msgid"));
            } else {
                log.error("Message push failed: {}", response);
            }
        } catch (Exception e) {
            log.error("Message push exception", e);
        }
    }

    private String getUserId(Long userId) {
        // Query system user table to get WeCom userid
        return userMapper.findWecomUserIdById(userId);
    }
}
```

### 6.2 Data Callbacks

WeCom supports various event callbacks, including address book changes, contact application status changes, template card button callbacks, etc. Callbacks are sent as HTTP POST to the developer-configured URL.

#### 6.2.1 Configuring Callback URL

Configure in the WeCom Admin Console:

```
App Management -> Self-built App -> Receive Messages -> Set API Reception
  -> URL: https://api.attendance.yourcompany.com/api/wecom/callback/message
  -> Token: Custom Token (for signature verification)
  -> EncodingAESKey: Randomly generated (for message encryption/decryption)
```

#### 6.2.2 Callback Signature Verification and Decryption

WeCom callback messages are encrypted with AES, requiring signature verification and decryption:

```java
/**
 * WeCom Callback Controller
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
     * URL verification (GET request)
     * WeCom verifies URL validity when configuring callback URL
     */
    @GetMapping("/message")
    public String verifyUrl(
            @RequestParam("msg_signature") String msgSignature,
            @RequestParam("timestamp") String timestamp,
            @RequestParam("nonce") String nonce,
            @RequestParam("echostr") String echoStr
    ) {
        log.info("WeCom callback URL verification");
        try {
            return callbackService.verifyUrl(msgSignature, timestamp, nonce, echoStr);
        } catch (Exception e) {
            log.error("URL verification failed", e);
            return "";
        }
    }

    /**
     * Receive event callback (POST request)
     */
    @PostMapping(value = "/message", produces = "application/xml")
    public String receiveCallback(
            @RequestParam("msg_signature") String msgSignature,
            @RequestParam("timestamp") String timestamp,
            @RequestParam("nonce") String nonce,
            @RequestBody String encryptedMsg
    ) {
        log.info("Received WeCom callback");
        try {
            callbackService.handleCallback(msgSignature, timestamp, nonce, encryptedMsg);
            return "success";
        } catch (Exception e) {
            log.error("Callback processing failed", e);
            return "success"; // Return success to prevent WeCom retries
        }
    }
}
```

#### 6.2.3 Template Card Button Callback

When users click buttons in template card messages, WeCom pushes button events to the callback URL:

```java
/**
 * WeCom Callback Service
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
     * Handle callback event
     */
    public void handleCallback(String msgSignature, String timestamp,
                               String nonce, String encryptedMsg) {
        // 1. Decrypt message
        WecomCallbackMessage message = decryptMessage(msgSignature, timestamp, nonce, encryptedMsg);

        // 2. Process by event type
        String eventType = message.getEventType();
        switch (eventType) {
            case "template_card_event":
                handleTemplateCardEvent(message);
                break;
            case "change_contact":
                handleContactChange(message);
                break;
            default:
                log.info("Unhandled event type: {}", eventType);
        }
    }

    /**
     * Handle template card button click event
     */
    private void handleTemplateCardEvent(WecomCallbackMessage message) {
        String taskId = message.getTaskId();
        String buttonKey = message.getButtonKey();
        String userId = message.getUserId();

        log.info("Template card button click: taskId={}, buttonKey={}, userId={}",
                taskId, buttonKey, userId);

        if ("approve".equals(buttonKey)) {
            approvalService.approve(taskId, userId);
        } else if ("reject".equals(buttonKey)) {
            approvalService.reject(taskId, userId);
        }
    }

    /**
     * Handle address book changes
     */
    private void handleContactChange(WecomCallbackMessage message) {
        String changeType = message.getChangeType();
        String userId = message.getUserId();

        log.info("Address book change: type={}, userId={}", changeType, userId);

        switch (changeType) {
            case "create_user":
                // New employee: create system user
                break;
            case "update_user":
                // Update employee: sync info
                break;
            case "delete_user":
                // Delete employee: disable account
                break;
            default:
                log.info("Unhandled address book change type: {}", changeType);
        }
    }

    /**
     * Decrypt WeCom callback message
     */
    private WecomCallbackMessage decryptMessage(String msgSignature, String timestamp,
                                                 String nonce, String encryptedMsg) {
        // Verify signature
        String calculatedSignature = Sha1Util.sha1(
                callbackToken, timestamp, nonce, encryptedMsg
        );
        if (!calculatedSignature.equals(msgSignature)) {
            throw new BusinessException(ErrorCode.SIGN_VERIFY_FAILED, "Callback signature verification failed");
        }

        // AES decrypt
        String decryptedXml = AesUtil.decrypt(encodingAesKey, encryptedMsg, corpId);
        return XmlUtil.parseXml(decryptedXml, WecomCallbackMessage.class);
    }
}
```

### 6.3 OAuth Differences: Mini Program vs H5

| Comparison Item | WeCom Mini Program | H5 Application |
|--------|--------------|---------|
| Auth Entry | `wx.qyLogin()` API call | OAuth2 authorization link page redirect |
| Code Source | `code` returned by `wx.qyLogin` | `code` from OAuth2 redirect parameter |
| Code Exchange API | `jscode2session` | `getuserinfo` |
| User Awareness | Completely silent, no awareness | May require user consent (snsapi_base silent, snsapi_privateinfo requires confirmation) |
| Information Obtained | userid + session_key | userid (snsapi_base) or detailed info (snsapi_privateinfo) |
| Security Mechanism | session_key for decrypting encrypted data | No additional encryption layer |
| Domain Requirements | Server domains (request domain) | Trusted domains (web authorization domain) |
| Callback Handling | No redirect callback needed | Requires redirect_uri callback page to handle code |
| Multi-platform Consistency | WeCom guarantees consistency | iOS/Android WebView differences need handling |

**H5 OAuth2 Authorization Flow (for comparison)**:

```
User clicks application entry
  -> WeCom constructs authorization link, user consents
  -> Redirects to callback URL with code
  -> Backend exchanges code for userid
  -> Establishes session, returns business token
```

**Construct Authorization Link**:

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

| Parameter | Description |
|------|------|
| `appid` | Enterprise corpid |
| `redirect_uri` | Callback URL, must be under trusted domain, needs URL encoding |
| `scope` | `snsapi_base` (silent authorization, only gets userid) or `snsapi_privateinfo` (gets detailed info) |
| `agentid` | Application agentid |
| `state` | Anti-CSRF, returned as-is |

## VII. Security Design

### 7.1 access_token Security Management

- access_token must never be exposed to the frontend; it must be obtained and managed on the server side
- Recommended to use cache (e.g., Redis) with TTL of 7100 seconds (100-second margin)
- Multi-instance deployment requires distributed locks to prevent concurrent refresh invalidating old tokens
- Monitor token refresh frequency regularly; abnormally high refresh frequency may indicate leakage

### 7.2 Sensitive Configuration Separation

Sensitive information such as corpid, secret, and agentid should not be hardcoded or committed to code repositories:

```yaml
# application-prod.yml (production environment)
wecom:
  corpid: ${WECOM_CORPID}        # Environment variable injection
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}
```

```bash
# Environment variable injection (deployment script)
export WECOM_CORPID="your_corpid"
export WECOM_AGENTID="your_agentid"
export WECOM_SECRET="your_secret"
```

### 7.3 Mini Program Security Design

The following security points should be noted in mini program mode:

**1. Server Domain Whitelist**:
- All `wx.request` and `wx.uploadFile` calls must point to configured valid domains
- Developer tools can check "Do not verify valid domains", but **production environment must be configured correctly**
- Domains must be HTTPS; HTTP and IP are not supported

**2. JWT Token Management**:
- Token validity period should not be too long (recommended 2-7 days), refreshed silently via `wx.qyLogin` after expiration
- Token is stored in mini program Storage, automatically cleared when exiting WeCom
- Server should record device info corresponding to tokens, support remote revocation

**3. Code Package Security**:
- Mini program code packages are cached on user devices; never hardcode any sensitive information in code
- Environment variables and API addresses are injected at build time, distinguishing dev/prod environments

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

**4. session_key Protection**:
- `session_key` is only used on the server side and must never be returned to the frontend
- Used for decrypting encrypted data (e.g., phone numbers, location, etc.)
- Cached in Redis with a reasonable TTL

### 7.4 API Security

- All business APIs require authentication (JWT), except OAuth2 callbacks and WeCom callback endpoints
- Anti-replay: API signature + timestamp verification
- Rate limiting: prevent malicious calls using Redis + token bucket or sliding window
- Input validation: use `@Valid` annotation to validate request parameters

```java
/**
 * API Rate Limit Annotation
 *
 * @author cuckoom
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {
    /** Rate limit key prefix */
    String key() default "";
    /** Number of requests allowed within the time window */
    int limit() default 60;
    /** Time window (seconds) */
    int window() default 60;
}

/**
 * Rate limit aspect
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
            throw new BusinessException(ErrorCode.RATE_LIMIT_EXCEEDED, "Too many requests, please try again later");
        }

        return joinPoint.proceed();
    }
}
```

### 7.5 Data Security

- Sensitive data such as check-in photos stored on internal file systems, not publicly accessible
- Sensitive fields like user phone numbers encrypted with AES-256
- Regular database backups
- Location data in check-in records should be masked for display (accurate to ~100m)

## VIII. Pitfall Guide

### 8.1 access_token Concurrent Refresh

**Problem**: Multiple instances refreshing access_token simultaneously causes old tokens to be invalidated, and other instances' requests fail.

**Solution**: Use distributed locks to ensure only one instance refreshes while others wait. Double-check pattern: after acquiring the lock, check cache again to avoid redundant refresh. See the `WecomTokenManager` implementation in Chapter V for details.

### 8.2 Mini Program code Can Only Be Used Once

**Problem**: The `code` returned by `wx.qyLogin` can only be used once and is valid for 5 minutes. Reusing the same code to call `jscode2session` will result in an error.

**Solution**:
- Mini program side calls `wx.qyLogin` on every launch to get a new code
- Backend exchanges code immediately upon receipt, does not cache it
- After successful exchange, issues JWT; subsequent requests use JWT instead of code

### 8.3 Missing requiredPrivateInfos Declaration

**Problem**: Calling `wx.getLocation` fails with `getLocation is not a function` or a prompt to declare it in app.json.

**Solution**: Declare the required privacy APIs in `app.json`:

```json
{
  "requiredPrivateInfos": [
    "getLocation",
    "chooseLocation"
  ]
}
```

Also declare permission purpose description in the `permission` field, otherwise the review may be rejected.

### 8.4 Location Accuracy and Anti-cheating

**Problem**: GPS location accuracy is about 10-50 meters with drift; some users may use virtual location software to cheat.

**Solution**:
- Set allowed radius to 100-300 meters; too strict will cause false positives
- Mini program requests high-accuracy positioning (`isHighAccuracy: true`), and checks the `accuracy` field; if accuracy is worse than 100m, prompt the user to move to an open area
- Backend performs anomaly detection: frequent make-up check-ins, non-workday check-ins, remote location check-ins, etc.
- Photo check-in adds watermark (time + location + device fingerprint)
- Scan check-in combined with location for dual verification
- Detect simulated location: mini program can check via `wx.getLocation`'s `accuracy`; simulated location typically has accuracy of 0 or a fixed value

### 8.5 Mini Program Server Domain Configuration

**Problem**: Development environment backend address is `http://localhost:8080`, mini program requests fail with "not in the following request valid domain list".

**Solution**:
- Development phase: WeChat Developer Tools -> Details -> Local Settings -> Check "Do not verify valid domains, web-view (business domain), TLS version, and HTTPS certificate"
- Trial and production versions: must configure server domains in the admin console; localhost and IP are not supported
- request, uploadFile, downloadFile domains need to be configured separately
- Maximum 50 domain configuration changes per month

### 8.6 wx.chooseImage Deprecated

**Problem**: Using `wx.chooseImage` returns abnormal results on some devices.

**Solution**: Migrate to `wx.chooseMedia`, which supports selecting both images and videos and has a more stable API:

```typescript
// Old API (deprecated)
wx.chooseImage({ ... });

// New API (recommended)
wx.chooseMedia({
  count: 1,
  mediaType: ['image'],
  sourceType: ['camera'],
  ...
});
```

### 8.7 Mini Program Version Publishing and Rollback

**Problem**: Mini programs require review submission before publishing. During review, the online version remains the old version, and if there's an urgent bug, it cannot be rolled back immediately.

**Solution**:
- Mini programs support separate "trial version" and "production version"; development and testing happen in trial version
- Thoroughly test in trial version before publishing production version
- Utilize WeCom's grayscale publishing capability: release to a small range first, then full release
- Backend APIs maintain backward compatibility to prevent old mini program versions from failing
- In emergencies, you can "withdraw published version" in the admin console (limited number of times)

### 8.8 H5 JS-SDK Signature URL iOS/Android Differences

**Problem**: In H5 mode, JS-SDK signature URL is handled differently on iOS and Android:
- Android: uses the current page URL
- iOS: uses the entry page URL (the URL when first entering the application)

**Solution**: On iOS, record the entry URL and use it for all subsequent signatures; on Android, use the current page URL. Mini program mode does not have this issue, which is a major advantage of choosing mini programs.

### 8.9 WeCom API Rate Limits

| API | Limit |
|-----|------|
| Get access_token | Max 1000 times per enterprise per 5 minutes |
| Send message | Max 200 times per application per minute |
| Address book read | Max 10000 times per day |
| Get check-in data | Max 1000 times per day |
| jscode2session | Max 600 times per application per minute |

High-frequency calls require caching and batch processing.

### 8.10 Mini Program Package Size Limit

**Problem**: Mini program main package exceeding 2MB cannot be previewed/uploaded; total package exceeding 20MB cannot be published.

**Solution**:
- Put non-core pages like check-in record lists and make-up check-in applications into subpackages
- Upload image resources to CDN, do not embed them in the code package
- Use `wx.subPackages` configuration for subpackages

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

## IX. Project Setup Supplement

### 9.1 Backend Project Structure

```
attendance-backend/
├── pom.xml
├── src/main/java/com/company/attendance/
│   ├── AttendanceApplication.java
│   ├── config/
│   │   ├── WebMvcConfig.java          # Web configuration (interceptor registration, CORS)
│   │   ├── WecomConfig.java           # WeCom configuration class
│   │   ├── RestTemplateConfig.java     # RestTemplate configuration
│   │   └── RedisConfig.java           # Redis configuration
│   ├── controller/
│   │   ├── QyAuthController.java       # Authentication (mini program login)
│   │   ├── CheckinController.java      # Attendance check-in
│   │   ├── CheckinPhotoController.java # Photo check-in
│   │   ├── ScanCheckinController.java  # Scan check-in
│   │   └── WecomCallbackController.java # WeCom callbacks
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

### 9.2 Core Configuration File

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

# WeCom configuration
wecom:
  corpid: ${WECOM_CORPID}
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}

# Attendance configuration
attendance:
  company:
    latitude: 30.2741
    longitude: 120.1551
  allowed-radius: 200

# JWT configuration
jwt:
  secret: ${JWT_SECRET}
  expiration: 604800  # 7 days (seconds)

mybatis-plus:
  mapper-locations: classpath*:/mapper/**/*.xml
  type-aliases-package: com.company.attendance.entity
  configuration:
    map-underscore-to-camel-case: true
```

### 9.3 Database Table Design

```sql
-- Check-in record table
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

-- QR code token table
CREATE TABLE qr_token (
    id              BIGSERIAL PRIMARY KEY,
    token           VARCHAR(100) NOT NULL UNIQUE,
    location_name   VARCHAR(100),
    status          SMALLINT     NOT NULL DEFAULT 1,
    expire_time     TIMESTAMP    NOT NULL,
    create_time     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User table
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

-- Indexes
CREATE INDEX idx_checkin_user_time ON checkin_record (user_id, checkin_time);
CREATE INDEX idx_checkin_type ON checkin_record (checkin_type);
CREATE INDEX idx_qr_token_token ON qr_token (token);
```

## Conclusion

The core of WeCom application development lies in understanding the following key aspects:

- **Development Mode Selection**: Mini program mode provides a more native experience with more direct API calls, suitable for high-frequency scenarios like attendance; H5 mode offers higher flexibility, suitable for frequently iterated content-oriented applications
- **Authentication System**: corpid/secret/agentid three elements -> access_token global ticket -> mini program `wx.qyLogin` to get code -> backend `jscode2session` to exchange for userid
- **Device Capability Access**: Mini programs call native capabilities directly via `wx.getLocation`, `wx.chooseMedia`, `wx.scanCode` without JS-SDK signatures
- **Backend API Integration**: access_token management (Redis cache + distributed lock), address book sync, message push (text card / template card)
- **Security Design**: Sensitive configuration via environment variables, JWT authentication, session_key protection, API rate limiting, data masking
- **Deployment Requirements**: Mini program server domains require HTTPS mandatorily; backend centrally manages access_token

Key pitfalls: access_token concurrent refresh, mini program code single-use, `requiredPrivateInfos` declaration, server domain configuration, package size limits, API rate limits.

Official documentation: [https://developer.work.weixin.qq.com/document/](https://developer.work.weixin.qq.com/document/)

> This article uses an attendance system as a thread and WeCom Mini Program mode as the main line to outline the complete technical chain of application development. The core pattern (`wx.qyLogin` authentication -> native API calls -> backend API integration -> message push -> callback handling) applies to all types of WeCom mini program application development. H5 mode, as a comparison, still has its irreplaceable advantages in scenarios requiring rapid iteration or primarily content display.
