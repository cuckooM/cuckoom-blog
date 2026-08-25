---
title: "企業WeChatアプリ開発完全ガイド：勤怠管理システムを例に"
date: 2026-07-09 21:00:00
tags:
  - 企業WeChat
  - ミニプログラム開発
  - 勤怠管理システム
  - API連携
  - モバイル開発
categories:
  - 技術実践
lang: ja
---

企業WeChat（WeCom）はエンタープライズ向けのコミュニケーションおよびコラボレーションプラットフォームであり、豊富なオープン API を提供し、企業自前アプリ、サードパーティアプリ、代行開発アプリをサポートしています。企業WeChatミニプログラム（WeCom Mini Program）の機能が継続的に改善されるにつれ、多くの企業が内部アプリをミニプログラムモードで開発するようになり、よりネイティブに近い体験とより強力なデバイス機能の呼び出しを獲得しています。

本記事では勤怠管理システムをケーススタディとして、**企業WeChatミニプログラムモードをメインライン**に据え、アプリ開発の全プロセスを体系的に解説します。ミニプログラムの登録・作成、プロジェクト構造、本人認証、位置情報ベースの打刻、写真撮影による打刻、QRコードスキャンによる打刻、バックエンド API 連携、メッセージプッシュ、セキュリティ設計などの重要なセクションを網羅し、同時に H5 アプリモードとの違いも比較説明し、開発チームの技術選定と実装に役立てます。

<!-- more -->

## 一、企業WeChatアプリ開発の概要

### 1.1 プラットフォームの位置づけ

企業WeChatオープンプラットフォームは開発者に完全な API 体系を提供し、アドレス帳管理、メッセージプッシュ、OAuth 認証、JS-SDK、ミニプログラム、効率ツール（打刻、申請、報告）などの機能をカバーしています。開発者はこれらの API に基づいて企業内部アプリを構築することも、複数企業向けのサードパーティアプリを開発することもできます。

### 1.2 アプリケーションの種類

| タイプ | 適用シーン | 特徴 |
|------|----------|------|
| 自前アプリ | 企業内部利用 | 自社のみ閲覧可能、設定が柔軟、API 権限は管理者が割り当て |
| サードパーティアプリ | 複数企業向けサービス提供 | 企業WeChatの審査が必要、複数企業の認可インストールをサポート |
| 代行開発アプリ | サービスプロバイダーが企業の代わりに開発 | 企業がサービスプロバイダーに認可、プロバイダーが開発・運用を代行 |

本記事は主に**自前アプリ**を扱います。これが最も一般的な開発シーンです。

### 1.3 開発モード：ミニプログラム vs H5

企業WeChatアプリ開発には主に **ミニプログラムモード** と **H5 アプリモード** の2種類があります。それぞれ一長一短があり、選定時には総合的に検討する必要があります。

| 比較項目 | 企業WeChatミニプログラム | H5 アプリ |
|----------|--------------|---------|
| 実行環境 | 企業WeChatミニプログラムランタイム | 企業WeChat内蔵ブラウザ WebView |
| 開発フレームワーク | WXML/WXSS/JS（WeChatミニプログラム類似） | 任意のフロントエンドフレームワーク（Vue/React 等） |
| パフォーマンス体験 | ネイティブに近い、起動が速い、ページ切替がスムーズ | WebView に依存、初回ロードが遅い |
| オフライン機能 | ローカルキャッシュをサポート、弱電波環境でも利用可能 | オフライン非対応、ネットワークに依存 |
| デバイス機能 | ネイティブ API を直接呼び出し（`wx.getLocation` 等） | JS-SDK 経由の間接呼び出し、署名検証が必要 |
| 本人認証 | `wx.qyLogin` で code を取得、ユーザーに意識させない | OAuth2 ウェブ認可リダイレクト、ユーザーの認知が必要 |
| 公開フロー | 審査提出が必要、バージョン管理が厳格 | デプロイ即座に有効、審査不要 |
| 更新の柔軟性 | バージョン再公開が必要 | いつでもホットアップデート可能、柔軟性が高い |
| クロスプラットフォーム一致性 | 企業WeChatがマルチプラットフォームでの一致性を保証 | iOS/Android WebView の差異を自前で適合する必要あり |
| 適用シーン | 高頻度利用、パフォーマンス要求が高い、デバイス機能の呼び出しが必要 | 迅速な開発、頻繁なイテレーション、コンテンツ型アプリ |

**選定の推奨**：

- **勤怠管理システムにはミニプログラムモードを推奨**：勤怠は高頻度操作であり、位置情報精度、撮影速度、起動速度が要求されるため、ミニプログラムのネイティブ API 呼び出しの方が直接的で体験が良い
- **申請システムは H5 モードで可能**：申請フローのフォームが複雑で変更が頻繁な場合、H5 の柔軟性がより高い
- **ハイブリッドモード**：同一の自前アプリでミニプログラム入口と H5 入口を同時に設定可能、シーンに応じてユーザーを誘導

本記事は**ミニプログラムモードをメインライン**として勤怠管理システムの開発を解説し、重要なポイントでは H5 モードとの違いを比較説明します。

## 二、開発環境の構築

### 2.1 企業WeChatの登録とアプリケーションの作成

1. [企業WeChat管理コンソール](https://work.weixin.qq.com/) にアクセスし、企業WeChatを登録（管理者の操作が必要）
2. 「アプリ管理」->「自前」->「アプリ作成」に入る
3. アプリ名、ロゴ、閲覧可能範囲（どの部門/従業員が利用可能か）を入力
4. 作成完了後、3つの重要なパラメータを取得：

| パラメータ | 説明 | 取得場所 |
|------|------|----------|
| `corpid` | 企業の一意識別子 | 我社の企業 -> 企業情報 -> 企業ID |
| `agentid` | アプリの一意識別子 | アプリ管理 -> 自前アプリ -> AgentId |
| `secret` | アプリシークレット | アプリ管理 -> 自前アプリ -> Secret |

> ⚠️ `secret` は最高機密の認証情報であり、**フロントエンドコードに絶対に出現してはならません**、サーバー側で保存してください。

### 2.2 企業WeChatミニプログラムの作成

企業WeChatミニプログラムの作成フローは WeChat ミニプログラムと類似していますが、バインドされるのは企業WeChatの主体です：

1. [企業WeChat管理コンソール](https://work.weixin.qq.com/) にログイン ->「アプリ管理」-> 自前アプリを選択
2. アプリ詳細ページで「ミニプログラム」モジュールを見つけ、「バインド/ミニプログラム作成」をクリック
3. 企業WeChatは2つの方法でミニプログラムを関連付けることをサポート：
   - **既存のWeChatミニプログラムを関連付け**：WeChatオープンプラットフォームで登録したミニプログラムを再利用、同一主体である必要あり
   - **企業WeChat内で直接作成**：企業WeChat自前のミニプログラム、WeChatオープンプラットフォームに依存しない
4. 作成後、ミニプログラム管理ページで `wx_app_id`（ミニプログラム AppID）を取得

**開発ツール**：[WeChat開発者ツール](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)を使用して開発とデバッグを行い、「企業WeChatミニプログラム」モードを選択するか、企業WeChatプラグインで関連付けます。

```bash
# WeChat開発者ツールのダウンロード（コマンドライン版、CI用）
# 公式ダウンロードページ：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
# CLI パス例（macOS）：
/Applications/wechatwebdevtools.app/Contents/MacOS/cli \
  --login --project /path/to/miniprogram \
  --preview --qr-output /tmp/preview-qr.png
```

### 2.3 信頼できるドメインとサーバードメインの設定

**H5 モード**では信頼できるドメイン（ウェブ認可および JS-SDK）の設定が必要です：

```
アプリ管理 -> 自前アプリ -> 開発者インターフェース -> ウェブ認可及び JS-SDK
  -> 信頼できるドメインの設定：attendance.yourcompany.com
  -> ドメイン所有権検証ファイルをダウンロードし、ドメインルートディレクトリに配置
```

**ミニプログラムモード**では管理コンソールで「サーバードメイン」（request、uploadFile、downloadFile、socket）の設定が必要です：

```
アプリ管理 -> 自前アプリ -> 開発者インターフェース -> ミニプログラム
  -> サーバードメイン：
    request 合法ドメイン：https://api.attendance.yourcompany.com
    uploadFile 合法ドメイン：https://upload.attendance.yourcompany.com
    downloadFile 合法ドメイン：https://download.attendance.yourcompany.com
```

ドメインは以下の条件を満たす必要があります：
- HTTPS をサポート（本番環境、ミニプログラムは強制要件）
- ICP 備案済み（中国本土サーバーの場合）
- request ドメインは IP アドレス、localhost をサポートしない
- ドメイン設定は毎月最大50回まで変更可能

### 2.4 ローカル開発環境

ミニプログラム開発は WeChat 開発者ツールを使用し、ローカルで HTTPS ドメイン通過は不要ですが、バックエンドサービスは必要です：

```bash
# バックエンドのローカル起動（SpringBoot）
cd ~/work/code/attendance-backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev

# ミニプログラム開発者ツールでの設定：
# - 開発設定 -> 合法ドメインを検証しない（開発段階でチェック）
# - AppID に企業WeChatミニプログラムの AppID を入力
# - デバッグベースライブラリは最新安定版を選択
```

H5 モードのローカル開発では HTTPS とドメイン検証の問題を解決する必要があります：

```bash
# H5 モード：ngrok または frp で内部ネットワーク通過を行う
ngrok http 8080

# または mkcert でローカル HTTPS 証明書を生成
mkcert -install
mkcert localhost 127.0.0.1

# hosts ファイルの設定（信頼できるドメインをローカルに向ける）
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

開発段階では企業WeChat管理コンソールで信頼できるドメインを内部ネットワーク通過アドレスに設定できますが、token のセキュリティに注意してください。

## 三、ミニプログラムのプロジェクト構造

企業WeChatミニプログラムのプロジェクト構造は WeChat ミニプログラムと一致しています。TypeScript で開発することでより良い型安全性と開発体験が得られます。

### 3.1 ディレクトリ構造

```
miniprogram/
├── app.ts                    # ミニプログラムのエントリロジック
├── app.json                  # ミニプログラムのグローバル設定
├── app.wxss                  # グローバルスタイル
├── sitemap.json              # 検索設定
├── project.config.json       # プロジェクト設定（AppID、コンパイル設定等）
├── tsconfig.json             # TypeScript 設定
├── typings/                  # 型宣言
│   ├── index.d.ts
│   └── wecom.d.ts            # 企業WeChat API 型補充
├── pages/
│   ├── index/                # ホームページ（勤怠打刻）
│   │   ├── index.ts
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   ├── records/              # 打刻記録
│   │   ├── index.ts
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   ├── apply/                # 再打刻申請
│   │   ├── index.ts
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   └── index.json
│   └── scan/                 # QRコードスキャン打刻
│       ├── index.ts
│       ├── index.wxml
│       ├── index.wxss
│       └── index.json
├── components/
│   ├── checkin-button/      # 打刻ボタンコンポーネント
│   └── location-card/       # 位置情報カード
├── services/                 # ビジネスサービス層
│   ├── auth.service.ts       # 認証サービス
│   ├── checkin.service.ts   # 打刻サービス
│   └── api.service.ts       # HTTP リクエストカプセル化
├── utils/
│   ├── request.ts            # リクエストユーティリティ（token 注入込み）
│   ├── location.ts           # 位置情報ユーティリティ
│   └── format.ts             # フォーマットユーティリティ
└── config/
    ├── env.ts               # 環境設定
    └── constant.ts           # 定数
```

### 3.2 app.json グローバル設定

```json
{
  "pages": [
    "pages/index/index",
    "pages/records/index",
    "pages/apply/index",
    "pages/scan/index"
  ],
  "window": {
    "navigationBarTitleText": "勤怠管理システム",
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
        "text": "打刻"
      },
      {
        "pagePath": "pages/records/index",
        "text": "記録"
      }
    ]
  },
  "permission": {
    "scope.userLocation": {
      "desc": "勤怠打刻の位置情報検証に使用"
    }
  },
  "requiredPrivateInfos": [
    "getLocation"
  ],
  "usingComponents": {}
}
```

> ⚠️ 企業WeChatミニプログラムは2023年以降、`app.json` での `requiredPrivateInfos` の宣言を必須としています。これを指定しない場合、`wx.getLocation` などのプライバシー API が呼び出せません。

### 3.3 app.ts エントリロジック

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
    // ミニプログラム起動時に企業WeChatログインを実行
    this.qyLogin();
  },

  /**
   * 企業WeChatログインフロー
   * 1. wx.qyLogin を呼び出して code を取得
   * 2. code をバックエンドに送信
   * 3. バックエンドが code を使って userid と session_key を取得
   * 4. server token をキャッシュし、後続のビジネスリクエストに使用
   */
  async qyLogin() {
    try {
      const { code } = await wx.qyLogin({
        desc: '企業WeChatの本人確認情報を取得',
      });

      if (!code) {
        console.error('qyLogin が code を返しませんでした');
        return;
      }

      // code をバックエンドに送信して token と交換
      const result = await this.requestLogin(code);

      this.globalData.serverToken = result.token;
      this.globalData.userInfo = result.userInfo;

      console.log('企業WeChatログイン成功', result.userInfo.userid);
    } catch (err) {
      console.error('企業WeChatログイン失敗', err);
      wx.showToast({ title: 'ログイン失敗、再試行してください', icon: 'error' });
    }
  },

  /**
   * バックエンドログインインターフェースの呼び出し
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
            reject(new Error(res.data.message || 'ログイン失敗'));
          }
        },
        fail: reject,
      });
    });
  },

  /**
   * サーバー側 token の取得（ローカルキャッシュ付き）
   */
  getServerToken(): string | undefined {
    return this.globalData.serverToken;
  },
});
```

> 💡 **H5 モードとの比較**：H5 モードでは OAuth2 ウェブ認可リダイレクトを経由して code を取得する必要があり、ページリダイレクトと URL パラメータの処理が発生します。ミニプログラムモードでは `wx.qyLogin` で直接 code を取得でき、ページジャンプが不要で、よりスムーズな体験を提供します。

### 3.4 TypeScript 設定

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

### 3.5 企業WeChat API 型宣言

WeChatミニプログラムのベースライブラリ型には企業WeChat専用 API が含まれていないため、補充宣言が必要です：

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
  // 企業WeChat専用 API
  qyLogin(option: WeComQyLoginOption): void;
  selectEnterpriseContact(option: WeComSelectEnterpriseContactOption): void;
  qwChooseEnterpriseContact(option: WeComSelectEnterpriseContactOption): void;

  // 汎用 API（WeChatミニプログラムベースライブラリ）
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

## 四、企業WeChatミニプログラムの本人認証

### 4.1 ログインフロー全体像

企業WeChatミニプログラムのログインフローは H5 OAuth より簡潔で、全プロセスがユーザーに意識されません：

```
ミニプログラム側              バックエンドサービス           企業WeChat API
  │                          │                        │
  │  1. wx.qyLogin()         │                        │
  │ ─────────────────────────│                        │
  │  code を取得             │                        │
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
  │                          │  5. JWT/Session を生成  │
  │                          │    Redis にキャッシュ    │
  │                          │                        │
  │  6. JWT + userInfo を返却 │                        │
  │ ◀─────────────────────────                        │
  │                          │                        │
  │  7. 後続リクエストに JWT を付与 │                    │
  │ ─────────────────────────▶                        │
```

### 4.2 ミニプログラム側：wx.qyLogin

`wx.qyLogin` は企業WeChatミニプログラム専用 API で、返される `code` をサーバー側でユーザー身元と交換するために使用します。

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
   * 企業WeChatログイン
   * wx.qyLogin が返す code の有効期限は5分間、一度のみ使用可能
   */
  async qyLogin(): Promise<void> {
    const { code } = await this.callQyLogin();
    if (!code) {
      throw new Error('qyLogin で code を取得できませんでした');
    }

    const result = await this.exchangeToken(code);
    this.serverToken = result.token;
    this.userInfo = result.userInfo;

    // token をローカルキャッシュ（有効期限内は再ログイン不要）
    wx.setStorage({
      key: 'server_token',
      data: result.token,
    });
  }

  private callQyLogin(): Promise<{ code: string }> {
    return new Promise((resolve, reject) => {
      wx.qyLogin({
        desc: '企業WeChatの本人確認情報を取得',
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
              reject(new Error(res.data?.message || 'token の取得に失敗'));
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

### 4.3 バックエンド：code から userid への交換

バックエンドは `code` を使って企業WeChatの `jscode2session` インターフェースを呼び出し、`userid` と `session_key` を取得します。

**インターフェースアドレス**：

```
GET https://qyapi.weixin.qq.com/cgi-bin/service/miniprogram/jscode2session
  ?access_token=ACCESS_TOKEN
  &js_code=CODE
  &grant_type=authorization_code
```

**SpringBoot 実装**：

```java
/**
 * 企業WeChat認証 Controller
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
     * ミニプログラムログイン：code から userid を取得し、JWT を発行
     *
     * @param request ミニプログラムログインリクエスト
     * @return JWT token + ユーザー情報
     */
    @PostMapping("/qy-login")
    public Result<QyLoginVO> qyLogin(@RequestBody @Valid QyLoginDTO request) {
        log.info("企業WeChatミニプログラムログイン、code={}", request.getCode());
        try {
            // 1. code から userid と session_key を取得
            QySessionDTO session = qyAuthService.code2Session(request.getCode());
            log.info("ログイン成功、userid={}", session.getUserid());

            // 2. ユーザーレコードの照会/作成
            SysUser user = qyAuthService.getOrCreateUser(session.getUserid());

            // 3. JWT の発行
            String token = jwtTokenProvider.generateToken(user.getId(), user.getWecomUserId());

            // 4. session_key をキャッシュ（後続の暗号化データ復号に使用）
            qyAuthService.cacheSessionKey(session.getUserid(), session.getSessionKey());

            // 5. 返却オブジェクトの構築
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
            log.warn("企業WeChatログイン業務例外: {}", e.getMessage());
            return Result.fail(e.getCode(), e.getMessage());
        } catch (Exception e) {
            log.error("企業WeChatログインシステム例外", e);
            return Result.fail(ErrorCode.SYSTEM_ERROR);
        }
    }
}
```

```java
/**
 * 企業WeChat認証 Service
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
     * ミニプログラム code から session を取得
     *
     * @param code wx.qyLogin が返す code
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
                    "code からの session 取得に失敗: " + (response == null ? "null" : response.getString("errmsg")));
        }

        return QySessionDTO.builder()
                .userid(response.getString("userid"))
                .sessionKey(response.getString("session_key"))
                .build();
    }

    /**
     * システムユーザーの照会または作成
     */
    public SysUser getOrCreateUser(String wecomUserId) {
        SysUser user = userMapper.findByWecomUserId(wecomUserId);
        if (user != null) {
            return user;
        }

        // 新規ユーザー：アドレス帳 API で詳細を取得して登録
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
     * session_key をキャッシュ（有効期限7日間）
     */
    public void cacheSessionKey(String userid, String sessionKey) {
        String key = SESSION_KEY_CACHE_PREFIX + userid;
        redisTemplate.opsForValue().set(key, sessionKey, 7, TimeUnit.DAYS);
    }

    /**
     * キャッシュされた session_key を取得
     */
    public String getSessionKey(String userid) {
        return redisTemplate.opsForValue().get(SESSION_KEY_CACHE_PREFIX + userid);
    }

    /**
     * アドレス帳 API でユーザー詳細を取得
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
                    "ユーザー情報の取得に失敗: " + (response == null ? "null" : response.getString("errmsg")));
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

### 4.4 JWT 認証インターセプター

```java
/**
 * JWT 認証インターセプター
 * リクエストヘッダーの Authorization token を検証
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
        // ログインインターフェースとコールバックインターフェースをパス
        String uri = request.getRequestURI();
        if (uri.contains("/api/auth/") || uri.contains("/api/wecom/callback/")) {
            return true;
        }

        String header = request.getHeader(AUTH_HEADER);
        if (header == null || !header.startsWith(TOKEN_PREFIX)) {
            sendError(response, 401, "認証情報が不足しています");
            return false;
        }

        String token = header.substring(TOKEN_PREFIX.length());
        try {
            Claims claims = jwtTokenProvider.parseToken(token);
            Long userId = claims.get("userId", Long.class);
            String wecomUserId = claims.get("wecomUserId", String.class);

            // ユーザー情報を request に格納し、Controller で使用可能に
            request.setAttribute("currentUserId", userId);
            request.setAttribute("currentWecomUserId", wecomUserId);

            return true;
        } catch (ExpiredJwtException e) {
            sendError(response, 401, "token が期限切れです、再ログインしてください");
            return false;
        } catch (Exception e) {
            log.warn("JWT 検証失敗", e);
            sendError(response, 401, "無効な認証情報です");
            return false;
        }
    }

    private void sendError(HttpServletResponse response, int code, String msg) {
        response.setStatus(code);
        response.setContentType("application/json;charset=UTF-8");
        try {
            response.getWriter().write(JSONUtil.toJsonStr(Result.fail(code, msg)));
        } catch (IOException e) {
            log.error("エラーレスポンスの書き込みに失敗", e);
        }
    }
}
```

> 💡 **H5 モードとの違い**：H5 モードでは OAuth2 ウェブ認可を使用し、認可リンクの構築 -> ユーザーの同意 -> リダイレクトコールバック -> バックエンドでの userid 取得というフローになり、複数回のページジャンプが発生します。ミニプログラムモードでは `wx.qyLogin` で1ステップで code を取得し、バックエンドで直接 userid と交換できるため、ユーザーの認知が不要で、より良い体験を提供します。

## 五、勤怠打刻機能の実装

### 5.1 バックエンド API 連携

#### 5.1.1 access_token 管理

access_token は企業WeChat API のグローバルチケットであり、すべてのサーバー側 API 呼び出しで付与する必要があります。

**取得インターフェース**：

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

**レスポンス**：

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "access_token": "***",
  "expires_in": 7200
}
```

**重要な戦略**：
- 有効期限は7200秒（2時間）、事前更新が必要
- 同一アプリケーションの有効な access_token は一意、重複取得すると古い token が無効になる
- **サーバー側で取得が必須**、フロントエンドで直接呼び出してはならない（secret が漏洩する）
- Redis キャッシュの使用を推奨、有効期限を7100秒に設定（100秒の余裕を残す）
- 複数インスタンスデプロイでは分散ロックで並行更新を防止

**SpringBoot Token 管理器**：

```java
/**
 * 企業WeChat access_token 管理器
 * Redis キャッシュ + 分散ロックで並行更新を防止
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
     * access_token を取得（ダブルチェック + 分散ロック）
     */
    public String getAccessToken() {
        // 1. まずキャッシュを確認
        String cached = redisTemplate.opsForValue().get(TOKEN_CACHE_KEY);
        if (StrUtil.isNotBlank(cached)) {
            return cached;
        }

        // 2. 分散ロックを取得
        Boolean locked = redisTemplate.opsForValue()
                .setIfAbsent(TOKEN_LOCK_KEY, "1", 10, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(locked)) {
            // ロック取得失敗、待機してリトライ
            return waitForToken();
        }

        try {
            // 3. ダブルチェック
            cached = redisTemplate.opsForValue().get(TOKEN_CACHE_KEY);
            if (StrUtil.isNotBlank(cached)) {
                return cached;
            }

            // 4. 企業WeChat API を呼び出して更新
            return refreshTokenFromWecom();
        } finally {
            // 5. ロック解放
            redisTemplate.delete(TOKEN_LOCK_KEY);
        }
    }

    /**
     * 企業WeChat API を呼び出して新規 token を取得
     */
    private String refreshTokenFromWecom() {
        String url = String.format(
                "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=%s&corpsecret=%s",
                corpId, secret
        );

        JSONObject response = restTemplate.getForObject(url, JSONObject.class);
        if (response == null || response.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR,
                    "access_token の取得に失敗: " + (response == null ? "null" : response.getString("errmsg")));
        }

        String accessToken = response.getString("access_token");
        redisTemplate.opsForValue().set(
                TOKEN_CACHE_KEY, accessToken,
                TOKEN_EXPIRE_SECONDS, TimeUnit.SECONDS
        );

        log.info("企業WeChat access_token の更新に成功");
        return accessToken;
    }

    /**
     * 他インスタンスの token 更新を待機
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
        throw new BusinessException(ErrorCode.WECOM_API_ERROR, "access_token の取得がタイムアウト");
    }
}
```

#### 5.1.2 アドレス帳管理

アドレス帳 API を使用して企業の組織構造と従業員情報を同期できます。

**部門リストの取得**：

```
GET https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=TOKEN&id=0
```

**部門メンバー詳細の取得**：

```
GET https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token=TOKEN&department_id=1&fetch_child=1
```

**レスポンス例**：

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "userlist": [
    {
      "userid": "zhangsan",
      "name": "張三",
      "department": [1, 2],
      "position": "プロダクトマネージャー",
      "mobile": "13800138000",
      "email": "zhangsan@company.com",
      "status": 1,
      "avatar": "https://..."
    }
  ]
}
```

**同期戦略**：毎日早朝にアドレス帳のフル同期を1回実行し、同時にアドレス帳変更コールバック（後述のコールバック章节を参照）を設定して、増分リアルタイム同期を実現することを推奨します。

#### 5.1.3 リクエストユーティリティのカプセル化

ミニプログラム側で統一リクエストユーティリティをカプセル化し、JWT token を自動注入します：

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

  // JWT token を自動注入
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
          // token 期限切れ、再ログイン
          app.qyLogin();
          reject(new Error('ログインの有効期限が切れました'));
          return;
        }
        if (res.statusCode === 200) {
          const body = res.data as ApiResponse<T>;
          if (body.code === 0) {
            resolve(body.data);
          } else {
            wx.showToast({ title: body.message || 'リクエスト失敗', icon: 'error' });
            reject(new Error(body.message));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      },
      fail: (err) => {
        wx.showToast({ title: 'ネットワークエラー', icon: 'error' });
        reject(err);
      },
    });
  });
}
```

### 5.2 位置情報ベースの打刻

位置情報は勤怠管理システムの中核機能です。ミニプログラムは `wx.getLocation` で直接デバイスの位置情報を取得でき、JS-SDK 署名検証は不要です（H5 モードでは必要）。

#### 5.2.1 ミニプログラム側の実装

```typescript
// utils/location.ts

interface LocationInfo {
  latitude: number;
  longitude: number;
  accuracy: number;  // 位置情報精度（メートル）
  speed: number;
}

/**
 * 現在の位置情報を取得
 * app.json で requiredPrivateInfos: ["getLocation"] の宣言が必要
 */
export async function getCurrentLocation(): Promise<LocationInfo> {
  // 位置情報権限を確認
  const hasPermission = await checkLocationPermission();
  if (!hasPermission) {
    const granted = await requestLocationPermission();
    if (!granted) {
      throw new Error('打刻機能を使用するには位置情報権限を許可してください');
    }
  }

  // 高精度位置情報モード
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
        console.error('位置情報の取得に失敗', err);
        reject(new Error('位置情報の取得に失敗、GPS が有効か確認してください'));
      },
    });
  });
}

/**
 * 位置情報権限の確認
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
 * 位置情報権限のリクエスト
 */
function requestLocationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.authorize({
      scope: 'scope.userLocation',
      success: () => resolve(true),
      fail: () => {
        // ユーザーを設定ページに誘導
        wx.showModal({
          title: '位置情報権限',
          content: '打刻には位置情報権限が必要です、設定で有効にしてください',
          confirmText: '設定へ',
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
 * 2点間の距離を計算（Haversine 公式）
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // 地球の半径（メートル）
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}
```

#### 5.2.2 打刻ページ

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

// 会社の打刻範囲設定
const COMPANY_LAT = 30.2741;
const COMPANY_LNG = 120.1551;
const ALLOWED_RADIUS = 200; // 打刻許可半径（メートル）

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
      // 1. 位置情報を取得
      const location = await getCurrentLocation();

      // 2. 距離を計算
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
        locationText: inRange ? '打刻範囲内です' : `会社まで ${Math.round(distance)} メートル`,
      });

      if (!inRange) {
        wx.showModal({
          title: '打刻範囲外',
          content: `現在会社まで ${Math.round(distance)} メートル、許可範囲 ${ALLOWED_RADIUS} メートルを超過しています。`,
          showCancel: false,
        });
        return;
      }

      // 3. 打刻を送信
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

      wx.showToast({ title: '打刻成功', icon: 'success' });
      console.log('打刻結果', result);
    } catch (err) {
      console.error('打刻失敗', err);
      wx.showToast({
        title: err.message || '打刻失敗',
        icon: 'error',
      });
    } finally {
      this.setData({ loading: false });
    }
  },
});
```

#### 5.2.3 バックエンド打刻インターフェース

```java
/**
 * 勤怠打刻 Controller
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
     * 打刻を送信
     *
     * @param request 打刻リクエスト
     * @param userId 現在のユーザー ID（JWT インターセプターから注入）
     */
    @PostMapping("/submit")
    public Result<CheckinVO> submit(
            @RequestBody @Valid CheckinDTO request,
            HttpServletRequest httpRequest
    ) {
        Long userId = (Long) httpRequest.getAttribute("currentUserId");
        String wecomUserId = (String) httpRequest.getAttribute("currentWecomUserId");

        log.info("ユーザー {} が打刻を送信、位置=({},{})",
                wecomUserId, request.getLatitude(), request.getLongitude());

        CheckinVO vo = checkinService.checkin(userId, request);
        return Result.success(vo);
    }

    /**
     * 今日の打刻記録を照会
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
 * 勤怠打刻 Service
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
     * 打刻
     */
    @Transactional(rollbackFor = Exception.class)
    public CheckinVO checkin(Long userId, CheckinDTO dto) {
        // 1. 距離検証
        double distance = calculateDistance(
                dto.getLatitude(), dto.getLongitude(),
                companyLat, companyLng
        );

        if (distance > allowedRadius) {
            throw new BusinessException(ErrorCode.OUT_OF_RANGE,
                    String.format("打刻範囲外です、会社まで %.0f メートル", distance));
        }

        // 2. 重複打刻防止（同一タイプ5分以内の重複不可）
        String checkinType = determineCheckinType(LocalDateTime.now());
        CheckinRecord existing = checkinMapper.findRecentRecord(
                userId, checkinType, 5
        );
        if (existing != null) {
            throw new BusinessException(ErrorCode.DUPLICATE_CHECKIN,
                    "5分以内に打刻済みです、重複打刻しないでください");
        }

        // 3. 打刻記録を保存
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

        // 4. 打刻成功通知をプッシュ
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
            return "CLOCK_IN";  // 出勤打刻
        } else {
            return "CLOCK_OUT"; // 退勤打刻
        }
    }
}
```

> 💡 **H5 モードとの比較**：H5 モードでは JS-SDK の `wx.getLocation` で位置情報を取得する際、先に `wx.config` 署名検証が必要で、iOS/Android で署名 URL の処理が異なり、多くの落とし穴があります。ミニプログラムモードでは `wx.getLocation` を直接呼び出し、署名不要、API が統一され、開発体験が顕著に向上します。

### 5.3 写真撮影による打刻

写真撮影による打刻は、現場の写真による証明が必要なシーン（外勤打刻、再打刻申請など）で使用されます。

#### 5.3.1 ミニプログラム側の実装

```typescript
// pages/index/index.ts （写真撮影打刻部分）

import { request } from '../../utils/request';

/**
 * 写真撮影打刻
 * wx.chooseMedia で写真を取得（推奨、非推奨となった wx.chooseImage の代替）
 */
async handlePhotoCheckin() {
  if (this.data.loading) return;
  this.setData({ loading: true });

  try {
    // 1. 写真撮影
    const media = await this.takePhoto();
    if (!media.tempFilePath) {
      throw new Error('写真撮影に失敗');
    }

    // 2. 位置情報を取得（写真打刻でも位置検証が必要）
    const location = await getCurrentLocation();
    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      COMPANY_LAT,
      COMPANY_LNG,
    );

    // 3. 写真をサーバーにアップロード
    const uploadResult = await this.uploadPhoto(
      media.tempFilePath,
      location.latitude,
      location.longitude,
    );

    wx.showToast({ title: '写真打刻成功', icon: 'success' });
    console.log('アップロード結果', uploadResult);
  } catch (err) {
    console.error('写真打刻失敗', err);
    wx.showToast({ title: err.message || '写真打刻失敗', icon: 'error' });
  } finally {
    this.setData({ loading: false });
  }
}

/**
 * カメラで写真撮影
 */
private takePhoto(): Promise<{ tempFilePath: string }> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],     // 撮影のみ、アルバム選択不可（不正防止）
      camera: 'back',              // バックカメラ
      sizeType: ['compressed'],    // 圧縮アップロード
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          resolve({ tempFilePath: res.tempFiles[0].tempFilePath });
        } else {
          reject(new Error('写真を取得できませんでした'));
        }
      },
      fail: (err) => {
        reject(new Error('撮影がキャンセルまたは失敗しました'));
      },
    });
  });
}

/**
 * 写真をサーバーにアップロード
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
            reject(new Error(body.message || 'アップロード失敗'));
          }
        } else {
          reject(new Error(`アップロード失敗 HTTP ${res.statusCode}`));
        }
      },
      fail: reject,
    });
  });
}
```

#### 5.3.2 バックエンド写真アップロードインターフェース

```java
/**
 * 写真撮影打刻 Controller
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
     * 写真撮影打刻アップロード
     *
     * @param file 写真ファイル
     * @param latitude 緯度
     * @param longitude 経度
     */
    @PostMapping("/photo")
    public Result<CheckinVO> photoCheckin(
            @RequestParam("photo") MultipartFile file,
            @RequestParam("latitude") double latitude,
            @RequestParam("longitude") double longitude,
            HttpServletRequest httpRequest
    ) {
        Long userId = (Long) httpRequest.getAttribute("currentUserId");

        // 1. ファイルを検証
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.PARAM_ERROR, "写真は空にできません");
        }
        if (file.getSize() > 5 * 1024 * 1024) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE, "写真は5MBを超えられません");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new BusinessException(ErrorCode.FILE_TYPE_ERROR, "画像形式のみサポート");
        }

        // 2. 写真を内部ネットワークに保存（外部非公開）
        String photoPath = fileStorageService.store(file, "checkin/" + userId);

        // 3. 打刻記録を作成
        CheckinDTO dto = new CheckinDTO();
        dto.setLatitude(latitude);
        dto.setLongitude(longitude);
        dto.setPhotoPath(photoPath);

        CheckinVO vo = checkinService.photoCheckin(userId, dto);
        return Result.success(vo);
    }
}
```

### 5.4 QRコードスキャンによる打刻

QRコードスキャンによる打刻は、席のチェックイン、会議室のチェックインなどのシーンに適用され、ユーザーが固定のQRコードをスキャンして打刻を完了します。

#### 5.4.1 ミニプログラム側の実装

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
      // 1. スキャンを呼び出し
      const res = await this.scanQRCode();
      const qrContent = res.result;

      if (!qrContent) {
        throw new Error('スキャン内容が空です');
      }

      // 2. QRコード内容を検証（特定のプレフィックスを含む必要あり）
      if (!qrContent.startsWith('wecom-attendance://')) {
        throw new Error('勤怠QRコードではありません、打刻できません');
      }

      // 3. token を抽出
      const qrToken = qrContent.replace('wecom-attendance://', '');

      // 4. 同時に位置情報を取得（不正防止：スキャン+位置情報の二重検証）
      const location = await getCurrentLocation();

      // 5. スキャン打刻を送信
      const result = await request<{ checkinId: string; time: string }>({
        url: '/api/checkin/scan',
        method: 'POST',
        data: {
          qrToken,
          latitude: location.latitude,
          longitude: location.longitude,
        },
      });

      this.setData({ result: '打刻成功' });
      wx.showToast({ title: 'スキャン打刻成功', icon: 'success' });
      console.log('スキャン打刻結果', result);
    } catch (err) {
      console.error('スキャン打刻失敗', err);
      this.setData({ result: err.message || 'スキャン打刻失敗' });
      wx.showToast({ title: err.message || 'スキャン打刻失敗', icon: 'error' });
    } finally {
      this.setData({ scanning: false });
    }
  },

  /**
   * wx.scanCode でQRコードをスキャン
   */
  scanQRCode(): Promise<{ result: string }> {
    return new Promise((resolve, reject) => {
      wx.scanCode({
        onlyFromCamera: true,   // カメラからのスキャンのみ許可（スクリーンショット不正防止）
        scanType: ['qrCode'],   // QRコードのみスキャン
        success: resolve,
        fail: () => {
          reject(new Error('スキャンがキャンセルまたは失敗しました'));
        },
      });
    });
  },
});
```

#### 5.4.2 バックエンドスキャン打刻インターフェース

```java
/**
 * スキャン打刻 Controller
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
     * スキャン打刻
     *
     * @param request スキャン打刻リクエスト
     */
    @PostMapping("/scan")
    public Result<CheckinVO> scanCheckin(
            @RequestBody @Valid ScanCheckinDTO request,
            HttpServletRequest httpRequest
    ) {
        Long userId = (Long) httpRequest.getAttribute("currentUserId");

        log.info("ユーザー {} がスキャン打刻、qrToken={}", userId, request.getQrToken());

        CheckinVO vo = checkinService.scanCheckin(userId, request);
        return Result.success(vo);
    }
}
```

```java
/**
 * スキャン打刻 Service 実装
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
        // 1. QRコード token を検証
        QrToken qrToken = qrTokenMapper.findByToken(dto.getQrToken());
        if (qrToken == null) {
            throw new BusinessException(ErrorCode.INVALID_QR_TOKEN, "無効な打刻QRコードです");
        }
        if (qrToken.getExpireTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.EXPIRED_QR_TOKEN, "打刻QRコードの有効期限が切れています");
        }
        if (qrToken.getStatus() == 0) {
            throw new BusinessException(ErrorCode.QR_TOKEN_DISABLED, "打刻QRコードは停止されています");
        }

        // 2. 位置情報検証
        double distance = calculateDistance(
                dto.getLatitude(), dto.getLongitude(),
                COMPANY_LAT, COMPANY_LNG
        );
        if (distance > ALLOWED_RADIUS) {
            throw new BusinessException(ErrorCode.OUT_OF_RANGE,
                    String.format("打刻範囲外です、会社まで %.0f メートル", distance));
        }

        // 3. 重複打刻防止
        CheckinRecord existing = checkinMapper.findRecentRecord(userId, "SCAN", 5);
        if (existing != null) {
            throw new BusinessException(ErrorCode.DUPLICATE_CHECKIN, "5分以内にスキャン打刻済みです");
        }

        // 4. 打刻記録を保存
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

        // 5. 通知をプッシュ
        messageService.sendCheckinNotification(record);

        return CheckinVO.builder()
                .checkinId(record.getId().toString())
                .time(record.getCheckinTime().toString())
                .type("SCAN")
                .distance(Math.round(distance))
                .build();
    }

    // ... その他のメソッドは省略
}
```

## 六、メッセージプッシュとコールバック

### 6.1 アプリメッセージプッシュ

メッセージプッシュは企業WeChatアプリの重要な機能であり、勤怠リマインド、申請通知などのシーンで使用できます。

**アプリメッセージ送信**：

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

**テキストメッセージ**：

```json
{
  "touser": "zhangsan|lisi",
  "toparty": "2|3",
  "totag": "tag1",
  "msgtype": "text",
  "agentid": 1000002,
  "text": {
    "content": "本日の出勤打刻時間は 09:00 です、時間通りに打刻してください。"
  },
  "duplicate_check_interval": 1800
}
```

**テキストカードメッセージ**（推奨、アプリページへジャンプ可能）：

```json
{
  "touser": "zhangsan",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "勤怠リマインド",
    "description": "出勤打刻の締切まであと15分です、時間通りに打刻してください。",
    "url": "https://attendance.yourcompany.com/checkin",
    "btntxt": "打刻に移動"
  }
}
```

**テンプレートカードメッセージ**（インタラクティブボタンをサポート、申請通知に適用）：

```json
{
  "touser": "zhangsan",
  "msgtype": "template_card",
  "agentid": 1000002,
  "template_card": {
    "card_type": "button_interaction",
    "source": {
      "desc": "勤怠管理システム"
    },
    "main_title": {
      "title": "再打刻申請の承認",
      "desc": "李四が2026-07-08午前の再打刻を申請"
    },
    "sub_title_text": "再打刻理由：打刻忘れ、席の監視カメラ映像で証明あり",
    "button_list": [
      {
        "text": "承認",
        "style": 1,
        "key": "approve"
      },
      {
        "text": "却下",
        "style": 2,
        "key": "reject"
      }
    ],
    "task_id": "task_20260708_001"
  }
}
```

> 💡 **ミニプログラムジャンプ**：テキストカードとテンプレートカードの `url` フィールドはミニプログラムジャンプパスをサポート（例：`#wecom-miniprogram://pages/index/index`）、ユーザーがメッセージをクリックすると H5 リンクではなくミニプログラムの対応ページを直接開きます。

**SpringBoot メッセージプッシュ実装**：

```java
/**
 * 企業WeChatメッセージプッシュ Service
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
     * 打刻成功通知を送信
     */
    public void sendCheckinNotification(CheckinRecord record) {
        String userid = getUserId(record.getUserId());
        if (StrUtil.isBlank(userid)) {
            log.warn("企業WeChat userid を取得できません、プッシュをスキップ: userId={}", record.getUserId());
            return;
        }

        String typeText = "CLOCK_IN".equals(record.getCheckinType()) ? "出勤" : "退勤";
        if ("SCAN".equals(record.getCheckinType())) {
            typeText = "スキャン";
        }

        Map<String, Object> message = new HashMap<>();
        message.put("touser", userid);
        message.put("msgtype", "textcard");
        message.put("agentid", agentId);

        Map<String, Object> textCard = new HashMap<>();
        textCard.put("title", "打刻成功");
        textCard.put("description", String.format(
                "%s打刻成功\n時間：%s\n会社まで：%dメートル",
                typeText,
                record.getCheckinTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                record.getDistance()
        ));
        // ミニプログラムジャンプリンク
        textCard.put("url", "#wecom-miniprogram://pages/records/index");
        textCard.put("btntxt", "記録を確認");
        message.put("textcard", textCard);

        sendMessage(message);
    }

    /**
     * 勤怠リマインドを送信
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
                log.info("メッセージプッシュ成功: {}", response.getString("msgid"));
            } else {
                log.error("メッセージプッシュ失敗: {}", response);
            }
        } catch (Exception e) {
            log.error("メッセージプッシュ例外", e);
        }
    }

    private String getUserId(Long userId) {
        // システムユーザーテーブルを照会し、企業WeChat userid を取得
        return userMapper.findWecomUserIdById(userId);
    }
}
```

### 6.2 データコールバック

企業WeChatは複数のイベントコールバックをサポートし、アドレス帳変更、アドレス帳アプリ状態変更、テンプレートカードボタンコールバックなどが含まれます。コールバックは HTTP POST で開発者が設定した URL に送信されます。

#### 6.2.1 コールバックアドレスの設定

企業WeChat管理コンソールで設定：

```
アプリ管理 -> 自前アプリ -> メッセージ受信 -> API受信の設定
  -> URL: https://api.attendance.yourcompany.com/api/wecom/callback/message
  -> Token: カスタム Token（署名検証用）
  -> EncodingAESKey: ランダム生成（メッセージの暗号化・復号用）
```

#### 6.2.2 コールバック署名検証と復号

企業WeChatのコールバックメッセージは AES 暗号化を使用しており、署名検証と復号の実装が必要です：

```java
/**
 * 企業WeChatコールバック Controller
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
     * URL 検証（GET リクエスト）
     * 企業WeChatがコールバックアドレス設定時に URL の有効性を検証
     */
    @GetMapping("/message")
    public String verifyUrl(
            @RequestParam("msg_signature") String msgSignature,
            @RequestParam("timestamp") String timestamp,
            @RequestParam("nonce") String nonce,
            @RequestParam("echostr") String echoStr
    ) {
        log.info("企業WeChatコールバック URL 検証");
        try {
            return callbackService.verifyUrl(msgSignature, timestamp, nonce, echoStr);
        } catch (Exception e) {
            log.error("URL 検証失敗", e);
            return "";
        }
    }

    /**
     * イベントコールバック受信（POST リクエスト）
     */
    @PostMapping(value = "/message", produces = "application/xml")
    public String receiveCallback(
            @RequestParam("msg_signature") String msgSignature,
            @RequestParam("timestamp") String timestamp,
            @RequestParam("nonce") String nonce,
            @RequestBody String encryptedMsg
    ) {
        log.info("企業WeChatコールバックを受信");
        try {
            callbackService.handleCallback(msgSignature, timestamp, nonce, encryptedMsg);
            return "success";
        } catch (Exception e) {
            log.error("コールバック処理失敗", e);
            return "success"; // success を返し企業WeChatのリトライを防止
        }
    }
}
```

#### 6.2.3 テンプレートカードボタンコールバック

ユーザーがテンプレートカードメッセージのボタンをクリックした際、企業WeChatはコールバック URL にボタンイベントをプッシュします：

```java
/**
 * 企業WeChatコールバック Service
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
     * コールバックイベントの処理
     */
    public void handleCallback(String msgSignature, String timestamp,
                               String nonce, String encryptedMsg) {
        // 1. メッセージを復号
        WecomCallbackMessage message = decryptMessage(msgSignature, timestamp, nonce, encryptedMsg);

        // 2. イベントタイプに応じて処理
        String eventType = message.getEventType();
        switch (eventType) {
            case "template_card_event":
                handleTemplateCardEvent(message);
                break;
            case "change_contact":
                handleContactChange(message);
                break;
            default:
                log.info("未処理のイベントタイプ: {}", eventType);
        }
    }

    /**
     * テンプレートカードボタンクリックイベントの処理
     */
    private void handleTemplateCardEvent(WecomCallbackMessage message) {
        String taskId = message.getTaskId();
        String buttonKey = message.getButtonKey();
        String userId = message.getUserId();

        log.info("テンプレートカードボタンクリック: taskId={}, buttonKey={}, userId={}",
                taskId, buttonKey, userId);

        if ("approve".equals(buttonKey)) {
            approvalService.approve(taskId, userId);
        } else if ("reject".equals(buttonKey)) {
            approvalService.reject(taskId, userId);
        }
    }

    /**
     * アドレス帳変更の処理
     */
    private void handleContactChange(WecomCallbackMessage message) {
        String changeType = message.getChangeType();
        String userId = message.getUserId();

        log.info("アドレス帳変更: type={}, userId={}", changeType, userId);

        switch (changeType) {
            case "create_user":
                // 従業員追加：システムユーザーを作成
                break;
            case "update_user":
                // 従業員更新：情報を同期
                break;
            case "delete_user":
                // 従業員削除：アカウントを無効化
                break;
            default:
                log.info("未処理のアドレス帳変更タイプ: {}", changeType);
        }
    }

    /**
     * 企業WeChatコールバックメッセージの復号
     */
    private WecomCallbackMessage decryptMessage(String msgSignature, String timestamp,
                                                 String nonce, String encryptedMsg) {
        // 署名検証
        String calculatedSignature = Sha1Util.sha1(
                callbackToken, timestamp, nonce, encryptedMsg
        );
        if (!calculatedSignature.equals(msgSignature)) {
            throw new BusinessException(ErrorCode.SIGN_VERIFY_FAILED, "コールバック署名検証失敗");
        }

        // AES 復号
        String decryptedXml = AesUtil.decrypt(encodingAesKey, encryptedMsg, corpId);
        return XmlUtil.parseXml(decryptedXml, WecomCallbackMessage.class);
    }
}
```

### 6.3 ミニプログラムと H5 の OAuth 差異比較

| 比較項目 | 企業WeChatミニプログラム | H5 アプリ |
|--------|--------------|---------|
| 認証エントリ | `wx.qyLogin()` API 呼び出し | OAuth2 認可リンクのページジャンプ |
| code の来源 | `wx.qyLogin` が返す `code` | OAuth2 リダイレクトパラメータ `code` |
| code 交換インターフェース | `jscode2session` | `getuserinfo` |
| ユーザー認知 | 完全にサイレント、認知なし | ユーザーの同意が必要な場合あり（snsapi_base はサイレント、snsapi_privateinfo は確認が必要） |
| 取得情報 | userid + session_key | userid（snsapi_base）または詳細情報（snsapi_privateinfo） |
| セキュリティメカニズム | session_key で暗号化データを復号 | 追加の暗号化レイヤーなし |
| ドメイン要件 | サーバードメイン（request ドメイン） | 信頼できるドメイン（ウェブ認可ドメイン） |
| コールバック処理 | リダイレクトコールバック不要 | redirect_uri コールバックページで code を処理 |
| マルチプラットフォーム一致性 | 企業WeChatが一致性を保証 | iOS/Android WebView の差異を処理する必要あり |

**H5 OAuth2 認可フロー（比較参考）**：

```
ユーザーがアプリエントリをクリック
  -> 企業WeChatが認可リンクを構築、ユーザーが認可に同意
  -> コールバックアドレスにリダイレクト、code を付携
  -> バックエンドが code で userid を取得
  -> セッションを確立、ビジネス token を返却
```

**認可リンクの構築**：

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

| パラメータ | 説明 |
|------|------|
| `appid` | 企業の corpid |
| `redirect_uri` | コールバックアドレス、信頼できるドメイン配下である必要あり、URL エンコードが必要 |
| `scope` | `snsapi_base`（サイレント認可、userid のみ取得）または `snsapi_privateinfo`（詳細情報を取得） |
| `agentid` | アプリの agentid |
| `state` | CSRF 対策、そのまま返却 |

## 七、セキュリティ設計

### 7.1 access_token のセキュリティ管理

- access_token はフロントエンドに絶対に公開してはならず、サーバー側で取得・管理する
- キャッシュ（Redis 等）での保存を推奨、TTL を7100秒に設定（100秒の余裕を残す）
- 複数インスタンスデプロイ時は分散ロックで並行更新による旧 token 無効化を防止
- token の更新頻度を定期的に監視、異常な高頻度更新は漏洩の可能性を示す

### 7.2 機密設定の分離

corpid、secret、agentid などの機密情報はハードコードやコードリポジトリへのコミットを避ける：

```yaml
# application-prod.yml（本番環境）
wecom:
  corpid: ${WECOM_CORPID}        # 環境変数注入
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}
```

```bash
# 環境変数注入（デプロイスクリプト）
export WECOM_CORPID="your_corpid"
export WECOM_AGENTID="your_agentid"
export WECOM_SECRET="your_secret"
```

### 7.3 ミニプログラムのセキュリティ設計

ミニプログラムモードでは以下のセキュリティ要点に注意が必要です：

**1. サーバードメインホワイトリスト**：
- すべての `wx.request`、`wx.uploadFile` 呼び出しは設定済みの合法ドメインを指す必要あり
- 開発者ツールで「合法ドメインを検証しない」をチェック可能だが、**本番環境では正確に設定が必須**
- ドメインは HTTPS 必須、HTTP と IP は非対応

**2. JWT Token 管理**：
- token の有効期限は長くしすぎない（2-7日を推奨）、期限切れ後は `wx.qyLogin` でサイレント更新
- token はミニプログラムの Storage に保存、企業WeChat退出後に自動クリア
- サーバー側は token に対応するデバイス情報を記録、リモート無効化をサポート

**3. コードパッケージのセキュリティ**：
- ミニプログラムのコードパッケージはユーザーのデバイスにキャッシュされるため、コード内に機密情報をハードコードしない
- 環境変数とインターフェースアドレスはビルド時に注入し、dev/prod 環境を区別

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

**4. session_key の保護**：
- `session_key` はサーバー側のみで使用、フロントエンドに絶対に返却しない
- 暗号化データ（電話番号、位置情報等の暗号化情報）の復号に使用
- Redis にキャッシュし、適切な TTL を設定

### 7.4 API セキュリティ

- すべてのビジネスインターフェースは認証（JWT）が必要、OAuth2 コールバックと企業WeChatコールバックインターフェースを除く
- リプレイ防止：インターフェース署名 + タイムスタンプ検証
- レート制限：悪意のある呼び出しを防止、Redis + トークンバケットまたはスライディングウィンドウを使用
- 入力検証：`@Valid` アノテーションでリクエストパラメータを検証

```java
/**
 * インターフェースレート制限アノテーション
 *
 * @author cuckoom
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {
    /** レート制限 key プレフィックス */
    String key() default "";
    /** 時間ウィンドウ内の許可リクエスト数 */
    int limit() default 60;
    /** 時間ウィンドウ（秒） */
    int window() default 60;
}

/**
 * レート制限アスペクト
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
            throw new BusinessException(ErrorCode.RATE_LIMIT_EXCEEDED, "リクエストが頻繁すぎます、しばらくしてから再試行してください");
        }

        return joinPoint.proceed();
    }
}
```

### 7.5 データセキュリティ

- 打刻写真などの機密データは内部ネットワークファイルシステムに保存、外部に非公開
- ユーザーの電話番号などの機密フィールドは暗号化して保存（AES-256）
- データベースの定期バックアップ
- 打刻記録の位置情報データはマスキング表示（百メートル単位まで）

## 八、落とし穴ガイド

### 8.1 access_token の並行更新

**問題**：複数インスタンスが同時に access_token を更新し、旧 token が無効化され、他インスタンスのリクエストがエラーになる。

**解決策**：分散ロックで1つのインスタンスのみ更新を保証し、他インスタンスは待機。ダブルチェックパターン：ロック取得後に再度キャッシュを確認し、重複更新を回避。第5章の `WecomTokenManager` 実装を参照。

### 8.2 ミニプログラム code は一度のみ使用可能

**問題**：`wx.qyLogin` が返す `code` は一度のみ使用可能、かつ5分間有効。同一 code で `jscode2session` を繰り返し呼び出すとエラーになる。

**解決策**：
- ミニプログラム側は起動のたびに `wx.qyLogin` を呼び出し、新しい code を取得
- バックエンドは code 受領後ただちに交換、キャッシュしない
- 交換成功後に JWT を発行し、後続リクエストは code ではなく JWT を使用

### 8.3 requiredPrivateInfos 宣言の欠落

**問題**：`wx.getLocation` の呼び出しで `getLocation is not a function` エラーまたは app.json での宣言が必要という警告が出る。

**解決策**：`app.json` で必要なプライベート API を宣言：

```json
{
  "requiredPrivateInfos": [
    "getLocation",
    "chooseLocation"
  ]
}
```

同時に `permission` フィールドで権限の用途説明を宣言する必要があり、そうしないと審査で却下される可能性がある。

### 8.4 位置情報精度と不正防止

**問題**：GPS の位置情報精度は約10-50メートルで、ドリフトが発生する。一部のユーザーが仮想位置情報ソフトウェアで不正を行う可能性がある。

**解決策**：
- 許可半径を100-300メートルに設定、厳格すぎると誤検知が発生
- ミニプログラム側で高精度位置情報をリクエスト（`isHighAccuracy: true`）、`accuracy` フィールドをチェックし、精度が100メートルより悪い場合は空曠な場所への移動を促す
- バックエンドで異常検知：頻繁な再打刻、非勤務日の打刻、遠隔地での打刻等
- 写真打刻にウォーターマークを付加（時間 + 位置 + デバイスフィンガープリント）
- スキャン打刻は位置情報との二重検証を組み合わせ
- 模擬位置情報の検出：ミニプログラムは `wx.getLocation` の `accuracy` で判断、模擬位置情報は通常精度が0または固定値

### 8.5 ミニプログラムのサーバードメイン設定

**問題**：開発環境のバックエンドアドレスは `http://localhost:8080` で、ミニプログラムのリクエストが「以下の request 合法ドメインリストにない」というエラーで失敗する。

**解決策**：
- 開発段階：WeChat開発者ツール -> 詳細 -> ローカル設定 ->「合法ドメイン、web-view（ビジネスドメイン）、TLS バージョンおよび HTTPS 証明書を検証しない」をチェック
- 体験版と正式版：管理コンソールでのサーバードメイン設定が必須、localhost と IP は非対応
- request、uploadFile、downloadFile ドメインはそれぞれ設定が必要
- ドメイン設定は毎月最大50回まで変更可能

### 8.6 wx.chooseImage は非推奨

**問題**：`wx.chooseImage` 使用時に一部デバイスで異常が返される。

**解決策**：`wx.chooseMedia` に移行し、画像と動画の同時選択をサポート、API がより安定：

```typescript
// 旧 API（非推奨）
wx.chooseImage({ ... });

// 新 API（推奨）
wx.chooseMedia({
  count: 1,
  mediaType: ['image'],
  sourceType: ['camera'],
  ...
});
```

### 8.7 ミニプログラムのバージョン公開とロールバック

**問題**：ミニプログラムは審査提出後にのみ公開可能、審査中はオンラインバージョンが旧版のままで、緊急バグがあっても即座にロールバックできない。

**解決策**：
- ミニプログラムは「体験版」と「正式版」の分離をサポート、開発とテストは体験版で実施
- 正式版公開前に体験版で完全テストを実施
- 企業WeChatのグレード公開機能を活用し、小範囲公開後に全量公開
- バックエンド API は後方互換性を維持し、ミニプログラム旧バージョンの呼び出し失敗を回避
- 緊急時は管理コンソールで「公開済みバージョンの撤回」が可能（回数制限あり）

### 8.8 H5 JS-SDK 署名 URL の iOS/Android 差異

**問題**：H5 モードの JS-SDK 署名 URL は iOS と Android で処理方式が異なる：
- Android：現在のページ URL を使用
- iOS：エントリページ URL（初回アプリケーションに入った URL）を使用

**解決策**：iOS ではエントリ URL を記録し、後続の署名はすべてこの URL を使用。Android は現在のページ URL を使用。ミニプログラムモードではこの問題がなく、ミニプログラムを選択する大きな利点の一つ。

### 8.9 企業WeChat API の頻度制限

| API | 制限 |
|-----|------|
| access_token 取得 | 同一企業で5分間最大1000回 |
| メッセージ送信 | アプリごと1分間最大200回 |
| アドレス帳読取 | 1日最大10000回 |
| 打刻データ取得 | 1日最大1000回 |
| jscode2session | アプリごと1分間最大600回 |

高頻度の呼び出しではキャッシュとバッチ処理が必要です。

### 8.10 ミニプログラムのパッケージサイズ制限

**問題**：ミニプログラムのメインパッケージが2MBを超えるとプレビュー/アップロード不可、総パッケージが20MBを超えると公開不可。

**解決策**：
- 打刻記録リスト、再打刻申請などの非コアページをサブパッケージに配置
- 画像リソースは CDN にアップロードし、コードパッケージに内包しない
- `wx.subPackages` でサブパッケージを設定

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

## 九、プロジェクト構築の実践補足

### 9.1 バックエンドプロジェクト構造

```
attendance-backend/
├── pom.xml
├── src/main/java/com/company/attendance/
│   ├── AttendanceApplication.java
│   ├── config/
│   │   ├── WebMvcConfig.java          # Web 設定（インターセプター登録、CORS）
│   │   ├── WecomConfig.java           # 企業WeChat設定クラス
│   │   ├── RestTemplateConfig.java     # RestTemplate 設定
│   │   └── RedisConfig.java           # Redis 設定
│   ├── controller/
│   │   ├── QyAuthController.java       # 認証（ミニプログラムログイン）
│   │   ├── CheckinController.java      # 勤怠打刻
│   │   ├── CheckinPhotoController.java # 写真撮影打刻
│   │   ├── ScanCheckinController.java  # スキャン打刻
│   │   └── WecomCallbackController.java # 企業WeChatコールバック
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

### 9.2 コア設定ファイル

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

# 企業WeChat設定
wecom:
  corpid: ${WECOM_CORPID}
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}

# 勤怠設定
attendance:
  company:
    latitude: 30.2741
    longitude: 120.1551
  allowed-radius: 200

# JWT 設定
jwt:
  secret: ${JWT_SECRET}
  expiration: 604800  # 7日間（秒）

mybatis-plus:
  mapper-locations: classpath*:/mapper/**/*.xml
  type-aliases-package: com.company.attendance.entity
  configuration:
    map-underscore-to-camel-case: true
```

### 9.3 データベーステーブル設計

```sql
-- 打刻記録テーブル
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

-- スキャン token テーブル
CREATE TABLE qr_token (
    id              BIGSERIAL PRIMARY KEY,
    token           VARCHAR(100) NOT NULL UNIQUE,
    location_name   VARCHAR(100),
    status          SMALLINT     NOT NULL DEFAULT 1,
    expire_time     TIMESTAMP    NOT NULL,
    create_time     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ユーザーテーブル
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

-- インデックス
CREATE INDEX idx_checkin_user_time ON checkin_record (user_id, checkin_time);
CREATE INDEX idx_checkin_type ON checkin_record (checkin_type);
CREATE INDEX idx_qr_token_token ON qr_token (token);
```

## まとめ

企業WeChatアプリ開発の核心は以下の重要なセクションを理解することにあります：

- **開発モードの選定**：ミニプログラムモードは体験がネイティブに近く、API 呼び出しがより直接的で、勤怠などの高頻度シーンに適しています。H5 モードは柔軟性が高く、頻繁なイテレーションが必要なコンテンツ型アプリに適しています
- **認証体系**：corpid/secret/agentid の三要素 -> access_token グローバルチケット -> ミニプログラム `wx.qyLogin` で code を取得 -> バックエンド `jscode2session` で userid を交換
- **デバイス機能の呼び出し**：ミニプログラムは `wx.getLocation`、`wx.chooseMedia`、`wx.scanCode` でネイティブ機能を直接呼び出し、JS-SDK 署名不要
- **バックエンド API 連携**：access_token 管理（Redis キャッシュ + 分散ロック）、アドレス帳同期、メッセージプッシュ（テキストカード / テンプレートカード）
- **セキュリティ設計**：機密設定の環境変数注入、JWT 認証、session_key 保護、API レート制限、データマスキング
- **デプロイ要件**：ミニプログラムサーバードメインの HTTPS が必須要件、バックエンドで access_token を一元管理

重要な落とし穴：access_token の並行更新、ミニプログラム code の一回限り使用、`requiredPrivateInfos` 宣言、サーバードメイン設定、パッケージサイズ制限、API 頻度制限。

公式ドキュメント：[https://developer.work.weixin.qq.com/document/](https://developer.work.weixin.qq.com/document/)

> 本記事は勤怠管理システムを手がかりとして、企業WeChatミニプログラムモードをメインラインに据え、アプリ開発の完全な技術チェーンを整理しました。コアパターン（`wx.qyLogin` 認証 -> ネイティブ API 呼び出し -> バックエンド API 連携 -> メッセージプッシュ -> コールバック処理）はすべてのタイプの企業WeChatミニプログラムアプリ開発に適用できます。H5 モードは比較として、迅速なイテレーションやコンテンツ表示が主のシーンでは依然として代替不可能な利点があります。
