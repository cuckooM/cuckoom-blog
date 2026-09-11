---
title: "企業微信アプリ開発完全ガイド：既存の勤怠＋Activiti承認システムをH5で連携する実践"
date: 2026-07-09 21:00:00
tags:
  - 企業微信
  - H5開発
  - 勤怠システム
  - Activiti
  - ワークフロー
  - シングルサインオン
  - API連携
categories:
  - 技術実践
lang: ja
---

多くのチームにとって企業微信（WeCom）開発は、ゼロから新しいシステムを作ることではなく、より一般的で現実的なシナリオに向き合うことです。**業務システムはすでに存在し、長年稼働している**——勤怠モジュールはとうにリリース済みで、承認フローは Activiti 上に会签（全員承認）、或签（いずれか1名が承認）、組織構造に基づく段階的承認といった複雑なフローが実装されており、承認プロセスから勤怠データを参照・連携することもあります。いまの要望は、このシステムを企業微信に持ち込み、従業員が企業微信のワークベンチからタップするだけで利用でき、**ユーザー名とパスワードを再入力する必要がなく、開いた瞬間に自分の勤怠と承認待ちタスクが表示される**ことです。

こうした前提では、H5 アプリ方式はミニプログラムよりも適した選択肢になることが多いです。既存システム自体が Angular + SpringBoot の Web 構成であり、H5 なら既存のフロントエンド画面とバックエンド API をそのまま再利用できます。企業微信の OAuth2 Web 認可（`snsapi_base`）と組み合わせれば、完全にシームレスなシングルサインオン／自動ログイン（免登）を実現でき、デプロイすれば即座に有効化され、審査やリリースも不要なため、承認フォームを頻繁に調整する場合のイテレーションコストが最小になります。

本記事では「**既存の勤怠管理システム ＋ Activiti の複雑な承認フロー**」を背景に、**H5 方式を主线**として、業務システムを書き直さずに企業微信側の連携を完成させる方法を体系的に解説します。特に、OAuth2 シームレス自動ログインの完全な流れ、企業微信アカウントとシステムアカウントの紐付けマッピング、JS-SDK によるデバイス機能の呼び出し、そして Activiti の会签（全員承認）／或签（1名承認）／組織構造承認と勤怠連携を企業微信側で実現する方法（承認待ちプッシュ、カードからのワンタップ承認、組織構造同期）について詳しく掘り下げます。

<!-- more -->

## 1. シナリオ分析と方式選定

### 1.1 既存システムの前提

本記事では、業務システムの現状を次のとおり仮定します（これは中堅・大規模企業の社内システムの典型的な形でもあります）：

- **勤怠管理**：打刻、打刻記録、打刻補正（補カード）申請、勤怠集計の各機能がすでに揃っており、バックエンドが REST API を提供している
- **承認フローエンジン**：Activiti（6.x/7.x）ベースで実装され、フロー定義に以下が含まれる：
  - **会签（全員承認）**：1つのノードで複数人全員の承認が必要（例：打刻補正に直属上司と HR 双方の同意が必要）
  - **或签（いずれか1名が承認）**：1つのノードの複数人のうち誰か1名が承認すればよい（例：部門の当直承認グループ）
  - **組織構造に基づく承認**：申請者の所属部門に応じて承認者が動的に決まる（部門責任者 → 管掌役員 → HRBP）
  - **勤怠データ連携**：承認フロー中に勤怠データの読み取り／書き戻しが発生する（例：打刻補正の承認後に打刻記録を自動修正、年次休暇承認後に残日数を減算）
- **アカウント体系**：システム独自のユーザーテーブル、ロール・権限体系を持つ（例：Spring Security + JWT/Session）
- **フロントエンド**：Web 版がすでに存在し、Angular シングルページアプリケーション（TypeScript）

解決すべき本質的な課題は2つだけです：

1. **アイデンティティの問題**：企業微信から入ってきた人は誰か？ システムアカウントとどう対応付け、自動ログインを実現するか？
2. **入口とリーチの問題**：企業微信のワークベンチからどうアプリに入るか？ 承認待ちタスクをどう従業員の企業微信に能動的にプッシュするか？

業務ロジック（打刻ルール、承認フロー遷移）は**1行たりとも企業微信に移す必要はありません**。企業微信が担うのは「入口 ＋ アイデンティティプロバイダ（IdP）＋ メッセージチャネル」という3つの役割だけです。

### 1.2 なぜこのシナリオで H5 を第一選択にするのか

| 比較軸 | H5 アプリ（本記事の方式） | 企業微信ミニプログラム |
|----------|--------------------|----------------|
| 既存 Web フロントの再利用 | 既存の Angular 画面をそのまま再利用 | WXML/WXSS で全画面を書き直し必要 |
| 既存バックエンド API の再利用 | そのまま再利用、OAuth ログインエンドポイントを1つ追加するだけ | 同様に再利用できるが、フロントは全面作り直し |
| 自動ログイン | OAuth2 `snsapi_base` のシームレス認可、完全に無感覚 | `wx.qyLogin` でシームレス、こちらも無感覚 |
| リリース・イテレーション | デプロイ即有効、承認フォームはいつでも変更可能 | 審査提出・リリースが必要で、緊急修正が遅い |
| 複雑なフォーム／フロー画面 | Web 技術の柔軟性が高く、承認のようなフォーム中心の画面に適する | フォームエンジン的な画面の開発コストが高い |
| デバイス機能 | JS-SDK：位置情報／撮影／スキャン（署名が必要） | ネイティブ API を直接呼び出し、体験はやや良好 |
| 承認フローのような「低頻度・フォーム重度・高頻度イテレーション」業務 | 非常に適合する | やや重い |

**結論**：勤怠打刻自体は頻度が高くデバイス機能に強く依存するため、打刻体験は確かにミニプログラムのほうが優れています。しかし「**既存システムの連携、承認フローが複雑で頻繁に変わる、最優先は低コストでのリリースと自動ログイン**」という前提では、H5 の総合的なメリットは体験上のわずかな差をはるかに上回ります。しかも H5 でも JS-SDK で位置情報、撮影、スキャンを起動でき、勤怠シナリオを完全にカバーできます。本記事の後半では、JS-SDK の完全な署名方式と iOS/Android でのハマりどころ対処も示します。

> 将来的に打刻体験のさらなる向上が求められる場合は、ハイブリッド方式も可能です。同一の自作アプリに H5 ホームページ（承認、記録、集計）とミニプログラム（打刻）の両方を設定し、メッセージカードを業務種別ごとにそれぞれへ遷移させ、バックエンドのアカウント体系は完全に共有します。

### 1.3 全体アーキテクチャ

```
┌───────────────────────────────┐
│          企業微信クライアント    │
│  ワークベンチ / メッセージカード / スキャン │
└───────────────┬───────────────┘
                │ H5 を開く（内蔵 WebView）
                ▼
┌───────────────────────────────┐
│  H5 フロント（既存 Web プロジェクトを再利用）│
│  Angular SPA + wx JS-SDK     │
│  ルートガード：token なし → OAuth へ遷移 │
└───────────────┬───────────────┘
                │ HTTPS（JWT）
                ▼
┌───────────────────────────────────────────────────────┐
│                 既存業務バックエンド（SpringBoot）       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ WecomOAuth   │  │ 勤怠モジュール │  │ Activiti 承認 │ │
│  │ 免登/アカウント紐付け │  │ (既存、再利用) │  │ (既存、再利用) │ │
│  └──────┬───────┘  └──────────────┘  └───────┬───────┘ │
│         │          アカウント対応表 user_id ↔ wecom_userid │
└─────────┼────────────────────────────────────┼─────────┘
          ▼                                    ▼
┌───────────────────┐              ┌──────────────────────┐
│ 企業微信サーバー API │              │ PostgreSQL / Redis   │
│ gettoken           │              │ 業務テーブル + act_* ワークフローテーブル│
│ auth/getuserinfo   │              └──────────────────────┘
│ jsapi_ticket       │
│ message/send プッシュ │◀──── 承認待ちタスク発生時、バックエンドが能動的にカードをプッシュ
└───────────────────┘
```

重要な設計原則：**企業微信の userid は、システムのユーザーテーブル上の1つの外部 ID フィールドにすぎない**ということです。勤怠や Activiti の候補者／処理者には、あくまでシステム内部の userId を使用します（userid と統一する方法については 4.5 節で議論します）。こうすることで企業微信は新しいログイン手段の1つにとどまり、既存の権限モデルやワークフローモデルに侵入しません。

## 2. 開発環境の構築

### 2.1 自作アプリの作成と3要素の取得

1. [企業微信管理コンソール](https://work.weixin.qq.com/) にアクセスし、管理者アカウントでログインします
2. 「アプリ管理」→「自作」→「アプリ作成」で、アプリ名（例：「モバイル勤怠承認」）、ロゴ、表示範囲を入力します
3. 作成後、3つの重要なパラメータを記録します：

| パラメータ | 説明 | 取得場所 |
|------|------|----------|
| `corpid` | 企業の一意識別子 | 自社情報 → 企業情報 → 企業 ID |
| `agentid` | アプリの一意識別子 | アプリ管理 → 自作アプリ → AgentId |
| `secret` | アプリのシークレット | アプリ管理 → 自作アプリ → Secret |

> ⚠️ `secret` は最上位の機密クレデンシャルです。**サーバー側にのみ保存**し、H5 フロントのコード、Git リポジトリ、ブラウザリクエストには絶対に含めないでください。

### 2.2 アプリホームページの設定（H5 入口）

アプリ詳細ページの「アプリホームページ」で H5 のトップページ URL を設定します：

```
アプリ管理 → 自作アプリ → アプリホームページ → Web ページを設定
  ホームページ URL：https://attendance.yourcompany.com/mobile/
```

従業員が企業微信のワークベンチでアプリアイコンをタップすると、企業微信内蔵ブラウザでこの URL が開かれます。H5 モバイル版は独立したパス（例：`/mobile/`）を使用し、PC 管理画面と分けることで、ルーティング分流と独立レイアウトを行いやすくすることをおすすめします。

### 2.3 信頼ドメインの設定（H5 で最も重要な管理コンソール設定）

H5 方式では、OAuth Web 認可のコールバックドメインと JS-SDK の両方が「信頼ドメイン」に依存します：

```
アプリ管理 → 自作アプリ → 開発者インターフェース → Web 認可およびJS-SDK
  → 信頼ドメインを設定：attendance.yourcompany.com
  → ドメイン所有権確認ファイルをダウンロード（WW_verify_xxxx.txt）
  → ファイルをドメインのルートディレクトリに配置し、アクセス可能にする：
    https://attendance.yourcompany.com/WW_verify_xxxx.txt
```

ドメインの要件：

- **HTTPS** 必須（OAuth 認可と JS-SDK で強制）
- ICP 登録（中国大陸のサーバー）が完了していること
- ドメイン所有権確認ファイルはフロントの静的リソースサービスまたは Nginx が直接ホスティングすること
- 1つのアプリに複数の信頼ドメインを設定可能（ドメイン主体は一致が必要）。コールバック URL はこれらのドメイン配下である必要があります

あわせて「企業信頼 IP」も設定します。サーバー API を呼び出すサーバーの出口 IP をホワイトリストに追加しないと、`gettoken` などのインターフェースが `60020 not allow to access from your ip` を返します。

### 2.4 メッセージ受信の設定（コールバック、カードボタン承認用）

「メッセージカード上で直接承認／却下をタップする」（画面を開かない）操作を実現するには、コールバックの設定が必要です：

```
アプリ管理 → 自作アプリ → メッセージ受信 → API 受信を設定
  URL:             https://attendance.yourcompany.com/api/wecom/callback/message
  Token:           任意（署名検証に使用）
  EncodingAESKey:  ランダム生成（メッセージ本体の AES 暗号化／復号に使用）
```

承認待ちからの遷移だけでカード内インタラクションを行わないなら、いったん未設定でも構いません。ただし最初から設定しておくことをおすすめします（第7章で使用します）。

### 2.5 ローカル開発環境

H5 のローカル開発で中核となる難所は、OAuth コールバックと JS-SDK に信頼ドメイン ＋ HTTPS が要求される一方、ローカルは `http://localhost` であることです。よく使われる方法は2つあります。

**方法1：内部ネットワーク穿透（リバースプロキシトンネル）（推奨、実環境に最も近い）**

```bash
# frp または ngrok を使い、ローカルの 8080／フロントのポートを
# 登録済みドメインのサブパスにマッピングする
# 例：https://dev-attendance.yourcompany.com を公開
frpc -c frpc.ini

# Angular dev server がホスト名経由でアクセスされることを許可する（angular.json）
# serve オプション：host を 0.0.0.0 に、デフォルトポート 4200
# angular.json -> projects/<name>.architect.serve.options
{ "host": "0.0.0.0", "port": 4200 }
# またはコマンドライン：ng serve --host 0.0.0.0 --port 4200
```

穿透で公開したドメインを（開発段階では）管理コンソールの信頼ドメインに追加し、確認ファイルをローカルの静的ディレクトリに置けば確認を通過できます。

**方法2：hosts ＋ mkcert（公網不要、純粋な画面連携向け）**

```bash
mkcert -install
mkcert attendance.yourcompany.com        # ローカル信頼証明書を生成
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

> 注意：hosts 方式はブラウザの証明書検証を通せるだけです。企業微信クライアントの OAuth 認可は実際の企業微信サーバーを経由して戻ってくるため、実機デバッグ時にスマートフォンはあなたの PC の hosts を使えません。したがって**実機デバッグでは必ず穿透ドメインを使用**してください。

**バックエンドのローカル起動**：

```bash
cd ~/work/code/attendance-backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

## 3. H5 フロントエンドプロジェクトの組み込み

### 3.1 ディレクトリ構成（既存 Angular プロジェクトを再利用し、モバイルモジュールを追加）

新規プロジェクトを作る必要はありません。既存の Angular + TypeScript プロジェクトに、モバイル向けの遅延ロードモジュール（feature module / routes）と企業微信アダプション層を追加するだけです：

```
attendance-web/
├── src/
│   ├── main.ts
│   ├── index.html                   # ここで <script> により jweixin を読み込むことも可能
│   ├── app/
│   │   ├── app.routes.ts            # ルーティング総入口（PC/モバイル分流）
│   │   ├── mobile/                  # 企業微信内 H5 モバイル（遅延ロードモジュール）
│   │   │   ├── mobile.routes.ts     # モバイルサブルート
│   │   │   ├── guards/
│   │   │   │   └── wecom-auth.guard.ts   # 免登ルートガード（CanActivate）
│   │   │   └── pages/
│   │   │       ├── checkin/checkin.component.ts      # 打刻ホーム
│   │   │       ├── records/records.component.ts      # 打刻記録
│   │   │       ├── todo/todo-list.component.ts       # 承認待ち（Activiti tasks）
│   │   │       ├── todo/approval-detail.component.ts # 承認詳細（会签/或签の進捗）
│   │   │       ├── apply/makeup-apply.component.ts   # 打刻補正申請（フロー開始）
│   │   │       └── oauth/oauth-callback.component.ts # OAuth コールバック着陸ページ
│   │   ├── core/
│   │   │   ├── interceptors/
│   │   │   │   └── auth.interceptor.ts   # HttpClient インターセプター（JWT 注入、401 で再ログイン）
│   │   │   └── services/            # 既存業務 Service を再利用
│   │   │       ├── checkin.service.ts
│   │   │       └── approval.service.ts
│   │   └── wecom/                   # 企業微信アダプション層（今回新規追加する中核）
│   │       ├── env.service.ts       # 企業微信環境かどうか、UA 判定
│   │       ├── oauth.service.ts     # OAuth2 免登（自動ログイン）遷移ロジック
│   │       ├── jssdk.service.ts     # wx.config / agentConfig / 署名
│   │       └── device.service.ts    # 位置情報、撮影、スキャンのラッパー
├── public/ （または src/）
│   └── WW_verify_xxxx.txt           # ドメイン所有権確認ファイル（静的リソースのルートに配置）
└── angular.json
```

### 3.2 企業微信 JS-SDK の組み込み

企業微信 H5 では `jweixin` モジュールを使用します（WeChat 公式アカウントの JSSDK と同源で、企業微信がその上に `wx.agentConfig` と企業専用インターフェースを拡張しています）：

```bash
npm install weixin-js-sdk --save
# または index.html で直接読み込み
# <script src="https://res.wx.qq.com/open/js/jweixin-1.2.0.js"></script>
```

```typescript
// src/app/wecom/env.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WecomEnvService {
  /** 現在企業微信クライアント内で動作しているか */
  isInWecom(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    // 企業微信の UA には wxwork と micromessenger の両方が含まれる
    return /wxwork/.test(ua) && /micromessenger/.test(ua);
  }

  /** iOS かどうか（JS-SDK 署名 URL の扱いが異なる、第5章参照） */
  isIOS(): boolean {
    return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  }
}
```

### 3.3 ルーティングと免登ガード

モバイル側のすべての業務ルートを同一の `CanActivate` ガード配下に置きます。システムの token がなければ OAuth 免登（自動ログイン）を開始し、ログイン成功後に元のページへ戻ります。これが「アプリを開くと自動ログイン」を実現するマスタースイッチであり、第4章で詳しく展開します。

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
  // OAuth コールバック着陸ページ：ガードは付けない
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

  // 中核：ログイン済みであることを保証する。未ログイン時は redirectToWecomAuth 内で
  // OAuth へのフルページ遷移がトリガーされる
  if (oauth.hasToken()) {
    return true;
  }
  oauth.redirectToWecomAuth(state.url);   // 現在ページから離脱する
  return new Promise<boolean>(() => false); // 今回のナビゲーションを停止し、フルページ遷移を待つ
};
```

ルートルーティングでは、`mobile` パス配下にモバイルモジュール全体を遅延ロードします：

```typescript
// src/app/app.routes.ts
export const APP_ROUTES: Routes = [
  {
    path: 'mobile',
    loadChildren: () => import('./mobile/mobile.routes').then(m => m.MOBILE_ROUTES),
  },
  // ...PC 管理画面のルート
];
```
## 4. OAuth2 シームレス自動ログイン（免登）の完全な流れ

これが連携全体の中核です。目指す効果は、従業員が企業微信でアプリアイコン（または承認メッセージカード）をタップすると、ページが開く過程で**ログインページも確認ボタンも一切表示されず**、1〜2秒後には直接業務ページに着陸し、しかもバックエンドが「彼がシステム内の誰なのか」をすでに把握している状態です。

### 4.1 認可方式の選定：snsapi_base

企業微信の Web 認可は2種類の scope をサポートしています：

| scope | 確認ダイアログ | 取得できるもの | 用途 |
|-------|-----------|-----------|------|
| `snsapi_base` | **シームレス、ダイアログ一切なし** | メンバーの userid のみ（バックエンドで交換） | 社内アプリの自動ログイン、**本記事で採用** |
| `snsapi_privateinfo` | ユーザーの手動確認が必要 | userid ＋ 機密情報（携帯番号／メール等、メンバーの認可が必要） | 追加のプライバシー項目収集が必要なごく少数のケース |

社内自作アプリで、アプリの表示範囲に利用者がすでに含まれている場合、`snsapi_base` は企業微信クライアント内では完全にシームレスです——これこそが自動ログインの基盤です。この段階で携帯番号やメールを取得する必要はなく（それらはサーバー側の連絡先 API で userid から照会すればよい）、すべて `snsapi_base` を使用します。

### 4.2 全体のシーケンス

```
WeComクライアント     H5 フロント(WebView)     業務バックエンド          WeComサーバー
    │                   │                     │                     │
    │ アプリホームを開く  │                     │                     │
    │──────────────────▶│                     │                     │
    │                   │ ルートガード：token なし│                    │
    │                   │ 302 認可URLへ遷移     │                     │
    │◀──────────────────│                     │                     │
    │ シームレス認可(無感覚)│                  │                     │
    │───────────────────────────────────────▶│                     │
    │ 302 callback?code=xxx&state=yyy へ戻る  │                     │
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
    │                   │                     │ userid→システムアカウント照会/作成 │
    │                   │                     │ JWT を発行           │
    │                   │◀────────────────────│                     │
    │                   │ token を保存、目的ページへ遷移 │           │
    │                   │ 以降のリクエストに JWT を付与 │           │
```

2つの重要点に注意してください：

1. **code の交換はバックエンドでのみ行う**：フロントエンドが直接企業微信 API を呼ぶことは絶対にありません（secret が露出します）。フロントが担うのは「遷移の誘導」と「戻り URL 上の code をバックエンドに渡す」ことだけです。
2. **認可 URL の組み立てはフロントでもバックエンドでも構いません**が、`state` による CSRF 対策と「ログイン後に元のページへ戻る」ロジックは自分で管理する必要があります。

### 4.3 ステップ1：認可 URL を構築して遷移する

認可 URL の形式：

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

| パラメータ | 説明 |
|------|------|
| `appid` | 企業の corpid（ここは appid という名前ですが、corpid を入れる点に注意） |
| `redirect_uri` | 認可後の戻り先アドレス。URL Encode が必要で、信頼ドメイン配下でなければならない |
| `response_type` | 固定 `code` |
| `scope` | `snsapi_base` |
| `agentid` | 自作アプリの agentid（**必須**。これがないと一部バージョンで当該アプリの身份を取得できない） |
| `state` | 任意パラメータ。企業微信がそのまま返送する。CSRF 対策 ＋ 戻り先パスの受け渡しに使用 |
| `#wechat_redirect` | 固定サフィックス。hash 形式で末尾に置く必要がある |

フロント側では注入可能な `WecomOAuthService`（`src/app/wecom/oauth.service.ts`）としてラップします：

```typescript
import { Injectable, inject } from '@angular/core';
import { WecomEnvService } from './env.service';

@Injectable({ providedIn: 'root' })
export class WecomOAuthService {
  private readonly env = inject(WecomEnvService);

  private readonly CORP_ID = 'ww your_corpid';        // corpid は高機密情報ではないためフロントに置ける
  private readonly AGENT_ID = '1000002';              // agentid も同様に公開可能
  private readonly CALLBACK =
    'https://attendance.yourcompany.com/mobile/oauth/callback';

  hasToken(): boolean {
    return !!localStorage.getItem('sys_token');
  }

  /** ランダムな state を生成し、同時に「ログイン後に遷移するページ」を sessionStorage に一時保存 */
  private buildState(redirectPath: string): string {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(`wx_state_${nonce}`, redirectPath || '/mobile/checkin');
    sessionStorage.setItem('wx_state_nonce', nonce);   // コールバック時に検証
    return nonce;
  }

  /** 免登を開始：企業微信の認可 URL へフルページ遷移する */
  redirectToWecomAuth(redirectPath: string): void {
    if (!this.env.isInWecom()) {
      // 企業微信環境以外（PC ブラウザで直接開いた場合など）は
      // システムのユーザー名／パスワードのログインページへ遷移
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

ルートガードでは `hasToken()` を呼んで判定し、未ログインなら `redirectToWecomAuth()` を呼ぶだけです（3.3 の `WecomAuthGuard` 参照）。

> corpid、agentid は「公開識別子」です（認可 URL はそもそもブラウザ内に平文で現れます）。フロントに置いても問題ありません。本当の鍵は secret だけであり、それは常にサーバー側にのみ存在します。

### 4.4 ステップ2：コールバック着陸ページで code をトークンに交換する

`/mobile/oauth/callback?code=xxx&state=yyy` に戻った後、コールバックページは3つの処理を行います：state の検証 → code をバックエンドに送信 → JWT を取得したら元の目的ページへ遷移、です。

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

  protected errMsg = signal('ログイン中...');

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code') ?? '';
    const state = this.route.snapshot.queryParamMap.get('state') ?? '';

    if (!code) { this.errMsg.set('認可失敗：code がありません'); return; }

    // 1. state を検証し CSRF を防ぐ：遷移前に保存した nonce と一致する必要がある
    const savedNonce = sessionStorage.getItem('wx_state_nonce');
    if (!state || state !== savedNonce) {
      this.errMsg.set('ログイン状態の検証に失敗しました。アプリを開き直してください');
      return;
    }
    const redirectPath = sessionStorage.getItem(`wx_state_${state}`) || '/mobile/checkin';

    try {
      // 2. code をバックエンドに渡しシステムの JWT と交換
      const { token } = await firstValueFrom(this.auth.loginByWecomCode(code));
      localStorage.setItem('sys_token', token);
      sessionStorage.removeItem(`wx_state_${state}`);
      sessionStorage.removeItem('wx_state_nonce');
      // 3. 元々行きたかったページへ戻る（特定の承認待ち詳細の場合もある）
      this.router.navigateByUrl(redirectPath, { replaceUrl: true });
    } catch (e: any) {
      this.errMsg.set('自動ログインに失敗しました：' + (e?.message || '再試行してください'));
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

  /** code を JWT に交換：token 不要の数少ないインターフェース（インターセプターで通過させる） */
  loginByWecomCode(code: string): Observable<WecomLoginResp> {
    return this.http
      .post<{ code: number; message: string; data: WecomLoginResp }>(
        '/api/auth/wecom/login', { code })
      // バックエンド統一レスポンス封筒 { code, message, data } をほどく（エラーコード処理はインターセプターに集約可能）
      .pipe(map((resp) => resp.data));
  }
}
```

### 4.5 ステップ3：バックエンドで code を userid に交換する（本人認証の中核）

バックエンドが code を受け取ったら、まず access_token を取得し、その後2つのインターフェースを呼びます：

- `auth/getuserinfo`：code → userid（社内メンバー）または openid（社外メンバー／外部連絡先）
- userid を取得した後、必要であればさらに `user/get`（連絡先）で氏名、部門、携帯番号を補完する

**インターフェース1：アクセス証明の取得**

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

`access_token` が返ります（有効期間 7200 秒）。access_token は集中管理が必須です（Redis キャッシュ ＋ 分散ロック、第8章参照）。フロントや他のサービスが個別に取得することはありません。

**インターフェース2：code を userid に交換**

```
GET https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=TOKEN&code=CODE
```

社内メンバーの場合の返却：

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "userid": "zhangsan",
  "user_ticket": "xxx"
}
```

> `userid` ではなく `openid` が返ってきた場合、現在の利用者がその企業アプリの表示範囲にいない（外部連絡先の可能性がある）ことを意味します。自動的にアカウントを作るのではなく、ログインを拒否し、管理者に連絡して権限を開通してもらうよう案内すべきです。

**ログイン Controller**：

```java
/**
 * 企業微信 H5 免登（自動ログイン）
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
     * H5 OAuth シームレスログイン：code を userid に交換し、
     * システムアカウントと紐付けたうえで JWT を発行する
     */
    @PostMapping("/login")
    public Result<WecomLoginVO> login(@RequestBody @Valid WecomLoginDTO dto) {
        log.info("企業微信 H5 免登、code={}", dto.getCode());
        WecomLoginVO vo = wecomAuthService.loginByCode(dto.getCode());
        return Result.success(vo);
    }
}
```

```java
/**
 * 企業微信免登 Service
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
        // 1. code を userid に交換
        String accessToken = tokenManager.getAccessToken();
        String url = String.format(
                "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=%s&code=%s",
                accessToken, code);

        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_AUTH_FAILED,
                    "企業微信の身份情報取得に失敗しました：" + (resp == null ? "null" : resp.getString("errmsg")));
        }

        String wecomUserId = resp.getString("userid");
        if (StrUtil.isBlank(wecomUserId)) {
            // openid しかない：社内メンバーではなく、アプリの表示範囲外
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE,
                    "現在のアカウントはアプリの認可範囲にありません。管理者に連絡してください");
        }

        // 2. userid をシステムアカウントに対応付ける（重要、4.6 参照）
        SysUser user = userService.getOrBindByWecomUserId(wecomUserId);
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "アカウントは無効化されています");
        }

        // 3. システム独自の JWT を発行し、既存認証体系を再利用
        String jwt = jwtTokenProvider.generateToken(user.getId(), user.getUsername());
        return WecomLoginVO.builder()
                .token(jwt)
                .userInfo(UserInfoVO.of(user))
                .build();
    }
}
```

### 4.6 ステップ4：企業微信アカウントとシステムアカウントの紐付け（既存システムで最も重要な設計）

これが「既存業務システム」と「ゼロから作るシステム」の最大の違いです。システムにはすでに多くのアカウントがあり（社員番号、メール、ドメインアカウントでログインしている可能性がある）、企業微信から入ってくるのは userid が1つあるだけです。**単純に「userid で新しいユーザーを作る」ことはできません**。さもないと同一人物が2つのアカウントになり、勤怠記録も Activiti の承認待ちもすべて整合しなくなります。

紐付け方法は3つ推奨できるものがあり、企業の実情に合わせて選択します：

**方法 A：社員番号／アカウントが一致、自動紐付け（最推奨、運用ゼロ）**

企業微信の連絡先にある「アカウント」項目は通常、企業統一の社員番号であり、企業微信の userid も社員番号になっていることが少なくありません。userid ＝ システムの username（または社員番号）という規約にし、ログイン時にアカウントで直接関連付けます：

```java
/**
 * 企業微信の userid でシステムアカウントを紐付ける
 * 規約：企業微信 userid とシステム社員番号(username)が一致
 */
public SysUser getOrBindByWecomUserId(String wecomUserId) {
    // 1. まず紐付け済みの wecom_user_id で検索
    SysUser user = userMapper.findByWecomUserId(wecomUserId);
    if (user != null) {
        return user;
    }

    // 2. 未紐付け：社員番号(username)で既存アカウントを自動マッチング
    user = userMapper.findByUsername(wecomUserId);
    if (user != null) {
        // 紐付け関係を構築し、次回は直接ヒットさせる
        user.setWecomUserId(wecomUserId);
        userMapper.updateById(user);
        log.info("システムアカウント {} を企業微信 userid {} に自動紐付け", user.getUsername(), wecomUserId);
        return user;
    }

    // 3. それでも一致しない：黙ってアカウント作成しない。紐付け誘導が必要な状態を返し、
    // 管理者またはセルフ紐付けフローで処理する
    throw new BusinessException(ErrorCode.WECOM_ACCOUNT_NOT_BOUND,
            "企業微信アカウントに関連するシステムアカウントが見つかりません。管理者に連絡して紐付けてください");
}
```

**方法 B：セルフ紐付け（アカウント体系が統一されていない場合）**

初回ログイン時に自動マッチングできなければ、ユーザーに一度だけシステムアカウントとパスワードを入力してもらって紐付けを完了させます。その後は当該 wecom_user_id と user_id の対応が DB に保存され、永続的に自動ログインになります：

```
初回企業微信ログイン → バックエンドが対応なしを検知 → NEED_BIND 状態を返す
  → H5 が紐付けページを表示（システムアカウント/パスワード、または社員番号＋SMS認証コードを入力）
  → バックエンド検証通過 → sys_user.wecom_user_id に書き込み → JWT 発行
```

紐付け関係は一度だけ構築し、クレデンシャルは検証後に破棄し、平文パスワードは保存しません。

**方法 C：管理者による事前紐付け／連絡先同期**

連絡先 API（`user/list`）で部門単位に一括同期し、企業微信の userid とシステムアカウントを社員番号で突き合わせます（同期方式は第8章に示します）。リリース前の一括初期化に適しています。

**ユーザーテーブルの改修**（既存ユーザーテーブルにフィールドを追加するだけで、既存構造は変更しない）：

```sql
ALTER TABLE sys_user ADD COLUMN wecom_user_id VARCHAR(64);
COMMENT ON COLUMN sys_user.wecom_user_id IS '企業微信 userid（外部身份）';
CREATE UNIQUE INDEX uk_sys_user_wecom ON sys_user (wecom_user_id) WHERE wecom_user_id IS NOT NULL;
```

> 設計のポイント：**内部 userId は不変を保つ**ことです。勤怠記録の外部キー、Activiti の `ACT_RU_TASK.ASSIGNEE_`、候補者グループはすべて引き続きシステム内部の userId（username）を使用します。企業微信の userid は「ログイン時に本人を認識する」ことと「プッシュ時の宛先指定」にのみ使い、`sys_user.wecom_user_id` という対応層でデカップリングします。これによりワークフロー定義を汚さず、PC のアカウント／パスワードや他の SSO といったログイン手段の併存も維持できます。

### 4.7 ステップ5：JWT と既存認証体系のシームレスな接続

免登で userid を取得した後のリクエストは PC 版とまったく同じで、すべてシステム既存の JWT/Session 認証を通します。これにより勤怠・承認 API の改造はゼロです。

フロントでは Angular の `HttpInterceptor` で token を一元注入し、401 時に免登をやり直します：

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
        // token 期限切れ：企業微信内ならシームレス免登をやり直し（無感覚）、外部環境ならログインページへ
        localStorage.removeItem('sys_token');
        const env = inject(WecomEnvService);
        if (env.isInWecom()) {
          location.reload();   // ルートガードが自動的に OAuth を再開始
        } else {
          location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
        }
      }
      return throwError(() => error);
    }),
  );
};
```

`app.config.ts` に登録します（関数型インターセプター、Angular 15+）：

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

> 免登インターフェース `/api/auth/wecom/login` 自体には token が付きません。インターセプターは「ローカルストレージに token がない」場合をそのまま通過させるため特別な判定は不要で、401 の場合にのみ免登のやり直しが発火します。

バックエンドは既存の Spring Security 設定（SecurityFilterChain Bean 形式）を踏襲し、企業微信のログインエンドポイントとコールバックエンドポイントだけを通過させます：

```java
/**
 * Spring Security セキュリティ設定
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
                        "/api/auth/wecom/**",      // 企業微信免登
                        "/api/wecom/callback/**"   // 企業微信コールバック
                ).permitAll()
                .anyRequest().authenticated()
            )
            // 前後端分離 + JWT：ステートレス、CSRF 無効、JWT フィルターでトークンを解析
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter(),
                    UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
    // JwtAuthenticationFilter：Authorization ヘッダーを解析し SecurityContext に書き込む。既存実装を踏襲
}
```

> プロジェクトがまだ Spring Security 5.x の `WebSecurityConfigurerAdapter` を使っている場合、同等の書き方は `configure(HttpSecurity)` をオーバーライドし、同じ2つのパスに対して `permitAll()` と `csrf().disable()` を指定する方法です。免登で発行される JWT は既存の JWT フィルターが一括検証し、アカウント／パスワードログインと完全に共用されます。

ここまでで「アプリを開く → 自動ログイン → 自分の勤怠と承認待ちがすぐ見える」という流れが完全につながり、しかも**勤怠と Activiti の既存インターフェース、権限、データは1行も変更していません**。
## 5. JS-SDK：H5 で位置情報、撮影、スキャンを使う

勤怠シナリオには位置情報、撮影、スキャンが欠かせません。H5 はミニプログラムのようにネイティブ API を直接呼べないため、企業微信 JS-SDK を通じ、署名認証を経て呼び出す必要があります。この章ではそのまま使える署名方式を示し、特にハマりやすい iOS/Android の署名 URL の差異を重点的に扱います。

### 5.1 wx.config と wx.agentConfig

企業微信 JS-SDK には2層の設定があり、初心者が最も混同しやすいポイントです：

| 設定 | 用途 | 署名チケット |
|------|------|----------|
| `wx.config` | 基本設定を注入し、汎用機能（シェア、位置情報 `getLocation`、スキャン `scanQRCode`、画像選択など大半のインターフェース）を起動 | `jsapi_ticket` で署名 |
| `wx.agentConfig` | 現在の**自作アプリ**の身份を注入し、企業微信専用インターフェース（`selectEnterpriseContact` の人選択、一部承認関連インターフェースなど）を起動 | `get_jsapi_ticket`（企業アプリチケット）で署名 |

勤怠打刻の位置情報／撮影／スキャンは `wx.config` が通れば十分です。「組織構造に沿った承認者／CC 対象者の選択ピッカー」といった企業専用機能にのみ、追加で `agentConfig` が必要になります。

### 5.2 バックエンド：jsapi_ticket 管理と署名

`jsapi_ticket` は access_token と交換し、有効期間は 7200 秒です。こちらも集中キャッシュが必要です：

```
GET https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=TOKEN
```

企業アプリの agentConfig で使うチケットのインターフェースは `ticket/get?type=agent_config` です。

署名アルゴリズム（企業微信の規定）：

```
string1 = jsapi_ticket={ticket}&noncestr={nonce}&timestamp={timestamp}&url={現在のページURL}
signature = SHA1(string1)
```

```java
/**
 * JS-SDK 署名 Service
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

    /** jsapi_ticket を取得（キャッシュ。ロジックは access_token と同様。分散ロックは省略、8.1 参照） */
    public String getJsapiTicket() {
        String cached = redisTemplate.opsForValue().get(JSAPI_TICKET_KEY);
        if (StrUtil.isNotBlank(cached)) {
            return cached;
        }
        String token = tokenManager.getAccessToken();
        String url = "https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=" + token;
        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR, "jsapi_ticket の取得に失敗しました");
        }
        String ticket = resp.getString("ticket");
        redisTemplate.opsForValue().set(JSAPI_TICKET_KEY, ticket, 7100, TimeUnit.SECONDS);
        return ticket;
    }

    /**
     * wx.config に必要な署名を生成
     * @param pageUrl フロントから送られた署名対象ページ URL（iOS の特殊扱いは 5.3 参照）
     */
    public WxConfigSignatureVO buildConfigSignature(String pageUrl) {
        String ticket = getJsapiTicket();
        String nonceStr = IdUtil.fastSimpleUUID();
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);

        // 注意：署名に参加する url はフロントの location.href と完全一致する必要がある
        // （hash の扱いルールは後述）
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

    /** フロントがページに入った後、現在の URL で署名と交換する */
    @GetMapping("/config")
    public Result<WxConfigSignatureVO> config(@RequestParam("url") String url) {
        return Result.success(jsapiService.buildConfigSignature(url));
    }
}
```

### 5.3 フロント：署名初期化（iOS 入口ページ問題を重点対応）

JS-SDK の最も古典的なハマりどころ：**Android は現在ページの URL で署名し、iOS（WKWebView）はアプリに最初に入ったときの入口ページ URL で署名する**という点です。SPA ではフロント側のルート切替でページが実際にはリフレッシュされないため、iOS で「現在のルートの href」で署名すると、着陸した最初のページでない限り `wx.config` が必ず `invalid signature` を返します。

統一的な解決法：**入口ページで最初の URL を記録し、以降の署名はすべてそれを使う（iOS）。Android は常に現在 URL を使う。**

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

  /** 署名対象 URL を取得：#hash 部分を除去する（企業微信の署名ルールでは url に hash を含めない） */
  private signableUrl(href: string): string {
    const idx = href.indexOf('#');
    return idx >= 0 ? href.slice(0, idx) : href;
  }

  /** 入口ページ URL を記録（iOS のみ必要。アプリ起動直後・ルート遷移前に1回呼ぶ） */
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
    return this.signableUrl(location.href);   // Android は現在ページ
  }

  /** wx.config の完了を保証（全体で1回だけ、SPA 内で再利用可） */
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
          beta: true,                 // 必須！企業微信専用インターフェースには beta:true が必要
          debug: false,
          appId: cfg.corpId,
          agentId: cfg.agentId,
          timeStamp: cfg.timestamp,
          nonceStr: cfg.nonceStr,
          signature: cfg.signature,
          jsApiList: ['getLocation', 'chooseImage', 'scanQRCode'],
        });
        wx.ready(() => resolve());
        wx.error((res: any) => reject(new Error('wx.config 失敗: ' + res.errMsg)));
      });
    })();

    return this.configPromise;
  }
}
```

アプリ起動時（ルートの初回遷移前）に早めに iOS 入口 URL を記録します。`APP_INITIALIZER` が使えます：

```typescript
// src/app/app.config.ts に起動初期化を登録
import { APP_INITIALIZER } from '@angular/core';

function recordWxEntryUrl() {
  const jssdk = inject(WecomJssdkService);
  const env = inject(WecomEnvService);
  return () => {
    // ensureWxConfig の入口記録ロジックを1回呼ぶ（iOS は初回遷移前に着陸ページ URL を固定化）
    if (env.isInWecom()) {
      // wx.config をウォームアップ。ブロックしなくてもよく、
      // 実際に位置情報/スキャンを呼ぶとき service 内部でフォールバックされる
      jssdk.ensureWxConfig().catch(() => void 0);
    }
  };
}

// providers に追加：
// { provide: APP_INITIALIZER, useFactory: recordWxEntryUrl, multi: true }
```

> 重要なのは iOS の入口 URL を、フロント側のルート遷移が一切発生する前に `location.href` から読み取って固定化することです。`APP_INITIALIZER`（Angular のルーター起動前に実行される）に置くのが最も確実です。署名のウォームアップをしない場合でも、少なくともこのフックで入口 URL を sessionStorage に書き込んでください。

> ルーティングモードのおすすめ：hash と署名の認知負荷を減らすため、H5 モバイルは **history モード**を使えます。hash モードを使う場合は、上記の `signableUrl` のとおり必ず `#` の位置で切断し、前後端で署名に参加する URL が完全に一致するようにしてください。`encodeURIComponent` を使うかどうかも両者で統一します。

### 5.4 地理位置情報による打刻

```typescript
// src/app/wecom/device.service.ts
import { Injectable, inject } from '@angular/core';
import wx from 'weixin-js-sdk';
import { WecomJssdkService } from './jssdk.service';

export interface LngLat { longitude: number; latitude: number; accuracy: number; }

@Injectable({ providedIn: 'root' })
export class WecomDeviceService {
  private jssdk = inject(WecomJssdkService);

  /** JS-SDK 位置情報（gcj02 火星座標、中国国内の地図と一致） */
  getLocation(): Promise<LngLat> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res: any) => resolve({
          longitude: res.longitude,
          latitude: res.latitude,
          accuracy: res.accuracy,
        }),
        fail: (err: any) => reject(new Error('位置情報の取得に失敗しました。位置情報権限を確認してください：' + err.errMsg)),
      });
    }));
  }

  /** カメラ撮影を起動（カメラのみ、アルバム不可で不正防止）、localId を返す */
  takePhoto(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera'],
        sizeType: ['compressed'],
        success: (res: any) => resolve(res.localIds[0]),
        fail: (err: any) => reject(new Error('撮影に失敗しました：' + err.errMsg)),
      });
    }));
  }

  /** スキャン（執務席／会議室の QR コード打刻） */
  scanQRCode(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.scanQRCode({
        needResult: 1,              // 1=フロントが結果を受け取り自前で処理
        scanType: ['qrCode'],
        success: (res: any) => resolve(res.resultStr),
        fail: (err: any) => reject(new Error('スキャンに失敗しました：' + err.errMsg)),
      });
    }));
  }
}

/** Haversine 距離（メートル）。純関数なので共通 utils に置ける */
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

打刻コンポーネントからの呼び出し（`checkin.component.ts`）。通知はチーム既存の UI ライブラリ（NG-ZORRO の `NzMessageService` など）を使います：

```typescript
// src/app/mobile/pages/checkin/checkin.component.ts（抜粋）
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
      this.msg.error(`打刻範囲外です。会社から ${Math.round(dist)} メートル離れています`);
      return;
    }
    await firstValueFrom(this.checkinApi.submit({
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      distance: Math.round(dist),
    }));
    this.msg.success('打刻に成功しました');
  }
}
```

バックエンドの打刻 API はシステム既存の実装と同じです（距離の二次検証、重複打刻防止、DB 保存、プッシュ）。これらのロジックはすでに存在し、H5 は新しい呼び出し元の1つにすぎません。バックエンドは**距離を必ず再検証**し、フロントから渡される緯度経度を信用してはいけません（フロントの座標はパケットキャプチャで改ざん可能です）。

### 5.5 撮影打刻とスキャン打刻

撮影とスキャンは 5.4 の `WecomDeviceService` にすでにラップ済みです（`takePhoto()` は localId、`scanQRCode()` は QR コード内容を返す）。コンポーネントではそのまま await で呼ぶだけです。`takePhoto` で得た localId の画像はさらにアップロードが必要です：

- `wx.uploadImage` でまず画像を企業微信にアップロードして `serverId` を得て、バックエンドが企業微信メディア API `media/get` を呼んで社内ネットワークに引き戻す方法——H5 から直接ファイルをアップロードしたくないケースに適します；
- または、localId を canvas に描画して Blob に変換し、Angular の `FormData` ＋ `HttpClient` で既存ファイルサービスに直接 POST し、システム既存の添付ファイルストレージを再利用する方法。

どちらの方式でもバックエンドは既存の写真保存とウォーターマーク（時刻＋位置＋デバイス情報）ロジックを踏襲します。スキャン打刻ではバックエンドが QR コードの token 有効性・有効期限を検証し、位置情報との二重検証を重ねます。こちらも同様に既存 API を再利用します。
## 6. Activiti の複雑な承認フローを企業微信側で実現する

勤怠関連の承認（打刻補正、休暇、外勤、残業申し立てなど）フローはすでに Activiti に定義されて稼働しています。企業微信側でフローを再実装する必要はなく、やることは3つだけです：**承認待ちを取り出す、承認操作を接続する、承認待ちを能動的に企業微信へプッシュする**。この章では会签（全員承認）、或签（1名承認）、組織構造に基づく承認という3つの代表的ノードを例に、再利用方法を説明します。

### 6.1 まず処理者識別子を統一する

Activiti はタスク処理者（`ACT_RU_TASK.ASSIGNEE_`）または候補者／グループ（`ACT_RU_IDENTITYLINK`）を1つの文字列で識別します。以下を必ず保証してください：**フロー定義にハードコードされた、または実行時に計算される処理者識別子が `sys_user.username`（内部アカウント、すなわち wecom_user_id に紐付く一意キー）と一致すること**。

社員番号／ユーザー名（例：`zhangsan`）をシステム全体の一意な人員識別子として統一することをおすすめします：

- Activiti の assignee / candidateUser = `sys_user.username`
- 企業微信との対応 = `sys_user.wecom_user_id`（多くの企業ではこれも社員番号で2つが同じ場合もあるが、論理的には分離する）
- 企業微信メッセージをプッシュするとき：`username → sys_user を照会 → wecom_user_id を取得` を `touser` とする

こうすることで Activiti のフロー定義、UEL 式、候補者クエリを企業微信向けに一切変更する必要がありません。

### 6.2 3つの代表的ノードのフロー定義での表現

「打刻補正申請」フローを例に、会签、或签、組織構造承認の BPMN での書き方を示します。

**会签（複数人全員の同意で通過）**——マルチインスタンスノード（multiInstanceLoopCharacteristics）＋ 完了条件を使います：

```xml
<userTask id="countersignLeaderHr" name="直属上司とHRの会签">
  <documentation>全員が承認し、全員が同意して初めて通過。1人でも差し戻したら終了</documentation>
  <multiInstanceLoopCharacteristics isSequential="false"
                                   activiti:collection="${countersignUsers}"
                                   activiti:elementVariable="approver">
    <completionCondition>${approveResultList.size() == nrOfInstances
        &amp;&amp; !approveResultList.contains('REJECT')}</completionCondition>
  </multiInstanceLoopCharacteristics>
  <userTask><extensionElements/></userTask>
</userTask>
```

- `isSequential="false"`：並行会签。各人に同時に1つの task が生成される
- `nrOfInstances`：会签の総人数；`approveResultList`：各人の承認結論を収集するフロー変数
- 完了条件：全員が処理し、かつ REJECT がなければ次へ進む

**或签（複数人のうち誰か1人が処理すればよい）**——同じくマルチインスタンスですが、完了条件を「1件処理したら終了」に変えます。より一般的なのは候補者（candidateUsers）を使う方法で、1つのタスクが複数人に見え、誰が引き受けても処理できます：

```xml
<userTask id="orSignDuty" name="当直グループ或签" activiti:candidateUsers="${dutyGroupUsers}">
  <documentation>候補グループの誰か1人が引き受けて承認すればよい</documentation>
</userTask>
```

またはマルチインスタンス ＋ `nrOfCompletedInstances >= 1` で、各人に承認待ちを1つずつ作り、1人が処理したら残りを自動キャンセルする実装も可能です。

**組織構造に基づく動的承認**——処理者を固定せず、フロー式で組織構造から実時刻に計算します（申請者 → 直属部門責任者 → 管掌役員）：

```xml
<userTask id="deptLeaderApprove" name="部門責任者承認"
          activiti:assignee="${orgService.findLeader(applyUserId)}"/>
<userTask id="directorApprove" name="管掌役員承認"
          activiti:assignee="${orgService.findDirector(applyUserId)}"/>
```

`orgService` は Activiti の式コンテキストに登録された Spring Bean で、内部で部門ツリーを上方向にたどって責任者を検索します。部門責任者が異動した後も、新しいフローインスタンスは自動的に最新の組織構造でルーティングされ、フロー定義の変更は不要です。

> この BPMN は PC 版ですでに稼働しています。企業微信側はあくまで「処理入口」を1つ追加するだけで、処理アクションの底層で呼ばれるのは同じ `taskService.complete()` です。したがって会签のカウント、或签の引き受け、組織ルーティング、ゲートウェイ条件はすべてエンジンが一貫性を保証し、「PC のフローとスマホのフローが違う」という問題は発生しません。

### 6.3 企業微信側の承認待ち一覧と詳細

**承認待ち一覧**——Activiti の TaskQuery をそのまま使い、現在のログインユーザーの username で承認待ちを照会します（会签では各人に別々の task が1件ある；或签の候補タスクは taskCandidateUser で照会）：

```java
/**
 * モバイル承認 Service（Activiti TaskService を再利用）
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

    /** 現在ユーザーの承認待ち（直接割当 ＋ 或签候補・未引受を含む） */
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
                .candidate(Objects.isNull(task.getAssignee()))  // 或签の未引受
                .build();
    }
}
```

**承認詳細**——フォーム、会签の進捗（誰が同意済みで誰が未処理か）、承認コメントのタイムラインを表示します：

```java
/** 会签進捗：履歴タスク ＋ 現在タスクから各処理者の状態を集約 */
public List<ApproverProgressVO> countersignProgress(String processInstanceId) {
    List<HistoricTaskInstance> done = historyService.createHistoricTaskInstanceQuery()
            .processInstanceId(processInstanceId)
            .finished()
            .list();
    List<Task> pending = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .list();
    // マージ：done には承認コメント（COMMENT）が付き、pending は「承認待ち」とする
    // 組み立ては省略。[{user, userName, status: APPROVED/REJECTED/PENDING, comment, time}] を返す
    return mergeProgress(done, pending);
}
```

フロントの `ApprovalDetailComponent` は `nodeType` に応じて描画します：会签なら複数アバターの進捗バー（処理済み／未処理）を表示し、或签なら「当直グループのメンバーは誰でも承認できます。タップして引き受けて処理」と表示します。

### 6.4 引き受け（或签）と承認操作

或签の候補タスクは、まず引き受け（claim）により assignee にならないと処理できません。会签タスクは直接割り当てなので引き受けはスキップします。

```java
@Transactional(rollbackFor = Exception.class)
public void approve(String taskId, String username, boolean agree, String comment) {
    Task task = taskService.createTaskQuery().taskId(taskId).active().singleResult();
    if (task == null) {
        throw new BusinessException(ErrorCode.TASK_NOT_FOUND, "承認待ちが存在しないか、すでに処理済みです");
    }

    // 或签：候補タスクはまず引き受ける
    if (task.getAssignee() == null) {
        boolean isCandidate = taskService.createTaskQuery()
                .taskId(taskId).taskCandidateUser(username).count() > 0;
        if (!isCandidate) {
            throw new BusinessException(ErrorCode.NO_PERMISSION, "このタスクを処理する権限がありません");
        }
        taskService.claim(taskId, username);
    } else if (!username.equals(task.getAssignee())) {
        throw new BusinessException(ErrorCode.NO_PERMISSION, "このタスクはあなたに割り当てられていません");
    }

    // 承認コメントを記録
    Authentication.setAuthenticatedUserId(username);
    taskService.addComment(taskId, task.getProcessInstanceId(),
            (agree ? "承認：" : "差戻し：") + comment);

    // フロー変数を書き込み：会签の完了条件は approveResultList に依存
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

    // 承認後処理：次ノードの承認待ちタスクをプッシュし、プロセス終了時に勤怠と連携する（6.5、6.6 参照）
    afterTaskComplete(task.getProcessInstanceId(), agree);
}
```

差し戻しポリシーは企業のルールに応じて選択できます：申請者へ差し戻し（再提出）、前ノードへ差し戻し、またはプロセスを直接終了する方法です。打刻補正（補カード）の場面では「いずれかが却下したら即終了＋申請者へ通知」がよく使われますが、これはまさに会签（全員承認）の完了条件における `!contains('REJECT')` のセマンティクスです。

### 6.5 承認と勤怠データの連携（既存機能を流用）

プロセス終了時に業務タイプに基づいて勤怠へ書き戻します。このロジックはシステムに既に存在し、WeCom 側の承認がトリガーするのも同じ `taskService.complete()` であるため、連携は自然に有効になります。打刻補正の典型的な処理は以下のとおりです：

```java
public void afterProcessFinished(String processInstanceId) {
    // プロセス終了後、プロセスインスタンス変数は履歴テーブルに移行済みのため、HistoricVariableInstance から業務変数を取得する
    Map<String, Object> vars = historyService.createHistoricVariableInstanceQuery()
            .processInstanceId(processInstanceId)
            .list()
            .stream()
            .collect(Collectors.toMap(HistoricVariableInstance::getVariableName,
                    HistoricVariableInstance::getValue, (a, b) -> a));
    String bizType = String.valueOf(vars.get("bizType"));     // MAKEUP / LEAVE / OVERTIME
    Boolean approved = (Boolean) vars.get("approved");

    if (!Boolean.TRUE.equals(approved)) {
        notifyApplicant(processInstanceId, false);   // 却下通知
        return;
    }

    switch (bizType) {
        case "MAKEUP":
            // 打刻補正が承認された場合：該当日の打刻記録を修正・補登録する（既存の勤怠 Service）
            attendanceService.applyMakeupCard(
                (Long) vars.get("recordId"),
                (String) vars.get("makeupTime"),
                String.valueOf(vars.get("reason")));
            break;
        case "LEAVE":
            // 休暇が承認された場合：休暇を登録し、休暇残日数を減算する
            leaveService.grantLeave(vars);
            break;
        default:
            break;
    }
    notifyApplicant(processInstanceId, true);
}
```

Activiti のプロセス終了イベントをリスニングしてトリガーするほうが、各承認インタフェース内で手動呼び出しするよりも堅牢です（PC、WeCom、定時タスクのどの入口から完了しても通過します）：

```java
import org.activiti.engine.delegate.event.ActivitiEntityEvent;
import org.activiti.engine.delegate.event.ActivitiEvent;
import org.activiti.engine.delegate.event.ActivitiEventListener;
import org.activiti.engine.delegate.event.ActivitiEventType;

/**
 * Activiti プロセス終了リスナー：承認が最終終了した後に勤怠と連携する
 * RuntimeService.addEventListener(...) または ProcessEngineConfiguration 経由で登録
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
        return false;   // リスナーの例外はプロセス自体に影響しない
    }
}
```

### 6.6 承認待ちタスクを企業微信（WeCom）へプッシュ通知

H5 の承認待ちリストがあるだけでは不十分です——従業員は自発的に開いて確認したりしません。フローが遷移して新しい承認待ちが発生したら、バックエンドから次の処理者の WeCom へ「承認カード」をプッシュすべきです。カードをタップすると H5 の該当承認詳細ページが直接開き、第4章のシングルサインオン（免登）により、開いた時点で既にログイン済みになっています。

タスク作成リスナーでプッシュをトリガーします（Activiti イベントリスニング）：

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

        // 直接アサイン（会签では各人に1タスク）→ assignee にプッシュ
        if (StrUtil.isNotBlank(task.getAssignee())) {
            pushToUser(task, task.getAssignee());
        } else {
            // 或签（いずれか1名が承認）の候補タスク → 全候補者／候選グループを展開したメンバーにプッシュし、入った順に先着で承認
            for (IdentityLink link : taskService.getIdentityLinksForTask(task.getId())) {
                if (StrUtil.isNotBlank(link.getUserId())) {
                    pushToUser(task, link.getUserId());
                } else if (StrUtil.isNotBlank(link.getGroupId())) {
                    // 候補グループ：グループからメンバーの username を取得して1人ずつプッシュする（実装は省略）
                    userMapper.findUsernamesByGroup(link.getGroupId())
                            .forEach(username -> pushToUser(task, username));
                }
            }
        }
    }

    private void pushToUser(TaskEntity task, String username) {
        SysUser u = userMapper.findByUsername(username);
        if (u == null || StrUtil.isBlank(u.getWecomUserId())) {
            log.warn("ユーザー {} は企業微信未連携のため、承認待ちプッシュをスキップします", username);
            return;
        }
        wecomMessageService.sendApprovalTodoCard(u.getWecomUserId(), task);
    }

    @Override
    public boolean isFailOnException() {
        return false;   // プッシュ失敗で Activiti のタスク作成をロールバックしない
    }
}
```

テキストカードメッセージ（タップで H5 承認ページへ直接遷移）：

```json
{
  "touser": "wangwu",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "承認待ち：李四の打刻補正申請",
    "description": "ノード：直属上司承認<br/>補正日：2026-09-08 午前<br/>理由：外勤先の顧客現場で打刻し忘れ",
    "url": "https://attendance.yourcompany.com/mobile/approval/123456",
    "btntxt": "今すぐ承認"
  }
}
```

重要ポイント：**カードの url は承認詳細ページまで直接組み立てる**ことです。従業員がタップ → トークンなし → 第4章の OAuth シングルサインオン（免登）がサイレント実行 → コールバック後に `state` に載せた戻り先パス（4.3 の redirectPath 参照）を経て、この承認詳細に戻ります。この効果を実現するには、メッセージカードのリンクに WeCom 所定の免登パラメータを付けるか、フロントエンドのガードで全 `/mobile/**` にログインを強制するだけでよく、特別な処理は不要です。

**テンプレートカードのボタンコールバック（応用：ページを開かず直接承認／却下）**

承認者が通知内で直接「承認／却下」をタップできるようにしたい場合は、`template_card`（button_interaction）と第6章のコールバック受信を組み合わせます。バックエンドがボタンイベントを受信したら `mobileApprovalService.approve()` を直接呼び、カードの状態を更新します。この方式は承認操作が極めて単純（ワンクリック承認）なノードに適しています。意見の記入や会签の詳細確認が必要な場合は、引き続き H5 へ遷移させることをおすすめします。両者の根底で呼ばれる承認メソッドは完全に同一です。

### 6.7 組織構造同期：動的な承認者へ確実にプッシュするために

「組織構造に基づく承認」で動的に算出される処理者は username であり、プッシュ時にはその wecom_user_id を引ける必要があります。保障方法は2つあります：

1. **アドレス帳コールバックの増分同期**（推奨、リアルタイム）：`change_contact` イベント（メンバーの追加／更新／削除、部門変更）を購読し、`sys_user` の wecom_user_id と部門所属をリアルタイム更新します。
2. **定時の全量同期**：毎日早朝にアドレス帳の部門／メンバー API を呼んで全量を突き合わせ、フォールバックとします。

```
GET /cgi-bin/department/list?id=0            # 部門ツリー
GET /cgi-bin/user/list?department_id=1&fetch_child=1   # 部門メンバー詳細
```

同期時には社員番号（username）で突き合わせ、WeCom の userid を `sys_user.wecom_user_id` に書き戻すとともに部門関係も同期し、`orgService.findLeader()` の組織ルーティングとプッシュ先の解決に利用します。アドレス帳読み取り API には1日あたりの呼び出し上限があるため（9.4 参照）、必ず「増分コールバックを主体に＋1日1回の全量同期をフォールバックに」し、高頻度のポーリングは避けてください。
## 七、メッセージプッシュとイベントコールバック

### 7.1 access_token とメッセージ送信

アプリメッセージは一元的にサーバー側から送信します。API は以下のとおりです：

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

よく使うメッセージタイプ：

- `text`：勤怠リマインダーなどのプレーンテキスト
- `textcard`：タイトル＋説明＋ボタン。タップで H5 へ遷移（承認待ちの第一選択）
- `template_card`：インタラクティブボタン付きで、通知内から直接操作できる（コールバックと併用）
- `markdown`：承認サマリーなどのリッチテキスト（企業微信内でサポート）

プッシュサービスのラッパー（`duplicate_check_interval` は短時間の重複プッシュ防止に使用します）：

```java
@Service
@Slf4j
public class WecomMessageService {

    @Resource private WecomTokenManager tokenManager;
    @Resource private RestTemplate restTemplate;
    @Value("${wecom.agentid}") private Integer agentId;

    /** 承認待ちカードを送信し、タップで H5 の承認詳細へ遷移させる */
    public void sendApprovalTodoCard(String wecomUserId, Task task) {
        Map<String, Object> card = new HashMap<>();
        card.put("title", "承認待ち：" + task.getName());
        card.put("description", "新しい承認待ちが1件あります。ご対応ください");
        card.put("btntxt", "今すぐ承認");
        card.put("url", "https://attendance.yourcompany.com/mobile/approval/" + task.getId());
        Map<String, Object> msg = new HashMap<>();
        msg.put("touser", wecomUserId);
        msg.put("msgtype", "textcard");
        msg.put("agentid", agentId);
        msg.put("textcard", card);
        msg.put("duplicate_check_interval", 1800);

        send(msg);
    }

    public void send(String msg) { /* message/send へ POST し、invaliduser/errcode を記録する */ }
}
```

> レスポンスボディの `invaliduser`／`invalidparty` は必ず記録してください。プッシュ先の中に未連携や可視範囲外の人がいることを示しており、「なぜあの人に承認待ち通知が届かないのか」を調査する際の最初の手がかりになります。

### 7.2 コールバックの署名検証と暗号化／復号

「メッセージ受信」を設定すると、企業微信からコールバック URL へ2種類のリクエストが送信されます：

- **GET**：設定保存時の URL 有効性検証。`echostr` を復号してそのまま返す必要があります
- **POST**：正式なイベントプッシュ（テンプレートカードのボタン、アドレス帳変更）。暗号文 XML で、署名検証＋AES 復号が必要です

```java
@RestController
@RequestMapping("/api/wecom/callback")
@Slf4j
public class WecomCallbackController {

    @Resource private WecomCallbackService callbackService;

    /** URL 検証 */
    @GetMapping("/message")
    public String verify(@RequestParam("msg_signature") String signature,
                         @RequestParam String timestamp,
                         @RequestParam String nonce,
                         @RequestParam String echostr) {
        try {
            return callbackService.verifyUrl(signature, timestamp, nonce, echostr);
        } catch (Exception e) {
            log.error("WeCom コールバック URL 検証に失敗しました", e);
            return "";
        }
    }

    /** イベント受信：必ず速やかに success を返し、時間のかかる処理は非同期化して WeCom の再試行を避ける */
    @PostMapping(value = "/message", produces = "application/xml")
    public String receive(@RequestParam("msg_signature") String signature,
                          @RequestParam String timestamp,
                          @RequestParam String nonce,
                          @RequestBody String encryptedBody) {
        try {
            callbackService.handleAsync(signature, timestamp, nonce, encryptedBody);
        } catch (Exception e) {
            log.error("WeCom コールバック処理に失敗しました", e);
        }
        return "success";   // 業務の成否にかかわらず先に success を返し、WeCom の指数退避再試行を防ぐ
    }
}
```

暗号化／復号は自作せず、公式の `aes-256` サンプルコードパッケージ（企業微信公式が提供する Java 版 `WXBizMsgCrypt`）をそのまま使用してください。これは SHA1 署名チェック、AES-256-CBC 復号、corpId 検証、XML 組み立てをカプセル化しています。`Token`、`EncodingAESKey`、`corpid` の3つのパラメータは管理画面のコールバック設定から取得します。

### 7.3 テンプレートカードのボタンとアドレス帳イベントの処理

```java
@Service
@Slf4j
public class WecomCallbackService {

    @Resource private MobileApprovalService approvalService;
    @Resource private ContactSyncService contactSyncService;
    @Resource private WXBizMsgCrypt crypt;   // 公式の暗号化／復号クラス

    /** 復号後にイベントタイプごとに振り分ける */
    public void handle(String sig, String ts, String nonce, String body) throws Exception {
        String xml = crypt.DecryptMsg(sig, ts, nonce, body);
        // XStream/Digester で XML を解析し、Event / ChangeType / TaskId / EventKey / FromUserName を取得する
        CallbackEvent event = CallbackEvent.parse(xml);

        switch (event.getEvent()) {
            case "template_card_event":
                // テンプレートカードのボタン：EventKey がボタン key、FromUserName がタップした人の userid
                onCardButton(event);
                break;
            case "change_contact":
                contactSyncService.handleChange(event.getChangeType(), event.getUserId());
                break;
            default:
                log.info("未処理の WeCom イベント: {}", xml);
        }
    }

    private void onCardButton(CallbackEvent e) {
        boolean agree = "approve".equals(e.getEventKey());
        String username = contactSyncService.wecomUserIdToUsername(e.getFromUserName());
        // task_id はカード送信時に当方が生成して Activiti の taskId と関連付け、Redis/DB に保存して取り戻す
        String taskId = taskCardMapping.get(e.getTaskId());
        approvalService.approve(taskId, username, agree, agree ? "承認" : "却下");
        // update_template_card を呼んで元のカードを「承認済み／却下済み」に更新し、重複タップを防げる
    }
}
```

イベント処理は必ず**冪等**にしてください。WeCom はタイムアウトにより同じイベントを再プッシュする可能性があります。`approve` 内部では「タスクが終了済み／処理済み」を判定しており（6.4 で active タスクを確認）、再プッシュされても二重承認は発生しません。時間のかかる操作（複数メッセージの送信、複数テーブルへの書き込みなど）は非同期スレッドまたはメッセージキューに置き、コールバックが秒単位で `success` を返せるようにします。

## 八、サーバー側インフラ

### 8.1 access_token / jsapi_ticket の集中管理

どちらのチケットも有効期間は7200秒、同一企業・同一アプリで一意であり（重複取得すると古いものが失効します）、サーバー側で集中キャッシュする必要があります。複数インスタンス構成では分散ロックにより、リフレッシュするインスタンスが1つだけになるよう保証します：

```java
@Component
@Slf4j
public class WecomTokenManager {

    private static final String TOKEN_KEY = "wecom:access_token";
    private static final String LOCK_KEY  = "wecom:access_token:lock";
    private static final long EXPIRE_SECONDS = 7100;   // 7200 より100秒の余裕を持たせる

    @Value("${wecom.corpid}") private String corpId;
    @Value("${wecom.secret}") private String secret;
    @Resource private StringRedisTemplate redis;
    @Resource private RestTemplate restTemplate;

    public String getAccessToken() {
        String cached = redis.opsForValue().get(TOKEN_KEY);
        if (StrUtil.isNotBlank(cached)) return cached;

        Boolean locked = redis.opsForValue().setIfAbsent(LOCK_KEY, "1", 10, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(locked)) return waitForToken();   // 他インスタンスのリフレッシュを待つ

        try {
            String again = redis.opsForValue().get(TOKEN_KEY);      // 二重チェック
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
            throw new BusinessException(ErrorCode.WECOM_API_ERROR, "access_token の取得に失敗しました");
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
        throw new BusinessException(ErrorCode.WECOM_API_ERROR, "access_token の取得がタイムアウトしました");
    }

    public String getCorpId() { return corpId; }
}
```

`jsapi_ticket` と agent_config のチケットは、全く同じパターンで別々にキャッシュしてください（キャッシュキーは分けます）。

### 8.2 機微な設定の分離

corpid／agentid は公開可能ですが、secret、コールバック Token、EncodingAESKey は環境変数または設定センター経由で注入し、Git には入れません：

```yaml
# application-prod.yml
wecom:
  corpid: ${WECOM_CORPID}
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  oauth:
    redirect: https://attendance.yourcompany.com/mobile/oauth/callback
  jssdk:
    # 署名に関与するフロントエンドのドメイン。バックエンドの検証／リンク生成に使用する
    frontend-base: https://attendance.yourcompany.com
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}
```

### 8.3 API セキュリティ

- OAuth ログインエンドポイントと WeCom コールバックエンドポイントは許可し、それ以外は全て既存の JWT 認証を通す
- `state` は使い捨てのランダム文字列＋sessionStorage 検証で CSRF を防止
- code は1回限り・5分間有効。バックエンドが受信したら即座に交換し、絶対にキャッシュしない
- 打刻座標はバックエンド側でも距離を再検証し、フロントエンドを信用しない。写真には透かしを入れ、QR スキャンには測位を重ねる
- コールバック API は署名検証＋AES 復号＋corpId 検証を行い、偽造イベントを拒否する
- 重要な API はレート制限（Redis スライディングウィンドウ）をかけて不正な連投を防ぐ

### 8.4 アドレス帳同期サービス

```java
@Service
public class ContactSyncService {

    /** 全量同期（毎日早朝のフォールバック） */
    public void syncAll() {
        String token = tokenManager.getAccessToken();
        // 1. 部門ツリー department/list
        // 2. 末端部門を巡回し user/list?fetch_child=1 でメンバーを取得
        // 3. 社員番号 sys_user.username で突き合わせ、wecom_user_id、部門、氏名、携帯、状態を書き戻す
        // 4. WeCom status=5（退職）／メンバー削除イベント → システムアカウントを無効化
    }

    /** 増分イベント（リアルタイム） */
    public void handleChange(String changeType, String wecomUserId) {
        switch (changeType) {
            case "create_user": case "update_user": upsertOne(wecomUserId); break;
            case "delete_user": disableByWecomUserId(wecomUserId); break;
            // 部門変更は部門テーブルを同期し、orgService.findLeader の組織ルーティングに供する
            default: break;
        }
    }

    public String wecomUserIdToUsername(String wecomUserId) {
        return userMapper.findUsernameByWecomId(wecomUserId);
    }
}
```

## 九、ハマりどころ回避ガイド

### 9.1 OAuth シングルサインオン（免登）関連

- **アプリホーム／コールバックドメインは必ず「信頼ドメイン」配下にする**こと。さもないと認可ページで `redirect_uri 参数错误` が出ます。
- **認可リンクには必ず `agentid` を付ける**こと。一部の企業微信バージョンでは、これがないと `getuserinfo` でアプリ身份を取得できません。
- **`appid` に入れるのは corpid** であって agentid ではありません。初心者が逆に入れがちです。
- **userid ではなく openid が返る**：利用者がアプリの可視範囲外です。アプリの「可視範囲」に当該メンバーの部門が含まれるか確認し、コード内で黙ってアカウント作成しないでください。
- **PC ブラウザでリンクを開いてもサイレント認可されない**：`snsapi_base` は WeCom クライアント内でのみ無感覚に動作します。フロントエンドは必ず先に UA を判定し、WeCom 外ならシステムのアカウント／パスワードログインへ流してください。
- **code は1回限り・5分で失効**：コールバックページを更新すると code 再利用エラーになります。ログイン成功後は `router.replace` で URL 上の code を消し、更新による再実行を防いでください。

### 9.2 JS-SDK 署名関連

- **iOS は入口ページ URL、Android は現在ページ URL で署名する**（5.3 参照）。SPA ではこれが `invalid signature` の最大の原因です。入口 URL は最初のルート遷移前に記録する必要があります。
- **署名に関与する URL と `location.href` は1文字単位で完全一致する必要がある**：プロトコル、ドメイン、ポート、query をすべて含めること。hash 部分はルールに沿って統一的に扱います（history モードで回避するのがおすすめ）。
- **フロントエンドが encode するならバックエンドも encode、どちらもしないならどちらもしない**。署名文字列の連結順は必ず `jsapi_ticket&noncestr&timestamp&url` です。
- 企業微信専用 API を呼ぶには `wx.config` に `beta: true` を設定し、さらに `wx.agentConfig` を1回実行する必要があります。
- 実機ローカルデバッグには、内部ネットワークを公開する HTTPS ドメインが必須です。hosts 方式はスマホには効きません。

### 9.3 Activiti とアカウントマッピング関連

- **処理者の識別子は必ず内部 username に統一する**こと。wecom_user_id を直接 BPMN の assignee に書かないでください。身份ソースを変えた場合（将来 DingTalk／Lark を接続する等）にフロー定義を全部書き換えることになります。
- **wecom_user_id で重複アカウントを新規作成しない**：既存システムにおける第一原則はバインド（マッピング）です（4.6）。さもないと勤怠と過去の承認待ちが2人分に分裂します。
- **或签の候補タスクは処理前に必ず claim する**こと。claim せず complete すると、タスクが現在のユーザーに属していないというエラーになります。
- **会签の却下時は残りのインスタンスを早期終了させる**：completionCondition に REJECT 判定を含める＋リスナーで残りの task を delete します。さもないと却下後も他の人に承認待ちが届きます。
- **勤怠連携はプロセス終了リスナーに置く**こと。特定の承認ボタン API に置くのではなく、これにより PC、H5、カードコールバックのどの入口でも有効になり、かつ承認が実際に通っていなければ勤怠を誤変更しません。

### 9.4 WeCom API のレート制限とその他

| API | 制限（参考。公式ドキュメントを優先） |
|-----|------|
| gettoken | 同一企業で5分以内の呼び出し回数に制限あり、キャッシュ必須 |
| メッセージ送信 | アプリごとに1分あたりの上限あり、touser はなるべくバッチ化・重複排除 |
| アドレス帳読み取り | 1日あたりの総回数上限あり、増分コールバックを主体にする |
| メッセージカード更新 | API のレート制限あり、ループ更新を避ける |

その他よくある問題：

- **サーバーの出口 IP を「企業の信頼済み IP」ホワイトリストに追加する**こと。さもないと `60020` になります。
- **HTTPS＋ICP 備案が必須**（中国本土のサーバー）。証明書が切れるとアプリ全体が、分かりやすい警告もなく開けなくなるため、監視に組み込んでください。
- **コールバックは秒単位で `success` を返す必要がある**。業務処理は非同期化し、さもないと WeCom の再プッシュで二重承認が発生します（冪等でフォールバック）。
- **textcard の url は詳細ページまで直接到達させるのがおすすめ**。免登＋state の戻り遷移と組み合わせ、「通知タップで承認へ直行」を実現します。
- **secret が漏洩したら**即座に管理画面でリセットしてサービスを再起動してください。コードレビューでは「フロントエンド／ログへの secret 出現」をレッドラインとします。

## 十、リリース前チェックリスト

**WeCom 管理画面**

- [ ] 自作アプリの可視範囲が全利用者の部門をカバーしている
- [ ] アプリホームが H5 モバイルアドレス（https）に設定されている
- [ ] 信頼ドメインが設定済みで、所有権確認ファイルにアクセスできる
- [ ] 企業の信頼済み IP にホワイトリスト登録済み（サーバー出口 IP）
- [ ] メッセージ受信の URL／Token／EncodingAESKey が設定済みで GET 検証を通過する

**アカウントと身份**

- [ ] `sys_user.wecom_user_id` がアドレス帳同期で初期化済みで、社員番号のマッピングが正しい
- [ ] 未マッチアカウントには「管理者へ連絡／セルフバインド」の明確な案内があり、黙ってアカウント作成されない
- [ ] `snsapi_base` のサイレント免登が実機（iOS＋Android）で検証通過
- [ ] トークン失効後の再免登が無感覚に動作し、元のページへ正しく戻る（承認詳細ディープリンクを含む）

**機能**

- [ ] JS-SDK の `wx.config` が iOS／Android 両端で通過する（特に署名 URL を検証）
- [ ] 測位／撮影／スキャンが実機で利用可能で、バックエンドの距離再検証が有効
- [ ] 会签：各人に独立した承認待ち、1名でも却下したら即終了し申請者へ通知
- [ ] 或签：候補者全員に届き、1人が claim して処理した後は他の人の承認待ちが消える
- [ ] 組織構造承認：申請者の部門に応じて正しく責任者／管掌上司へルーティングされる
- [ ] 承認通過後の勤怠連携（打刻補正／休暇残数減算）が正しく DB に反映される
- [ ] 承認待ちカードが届き、タップでログイン済みの状態で詳細へ直行する。カードボタンのコールバックは冪等

**セキュリティと運用**

- [ ] secret／Token／AESKey は環境変数経由で、Git に入っておらずログにも出ていない
- [ ] access_token／jsapi_ticket のキャッシュ＋分散ロックを検証済み（複数インスタンス）
- [ ] HTTPS 証明書の有効期限監視、API のレート制限、重要操作の監査ログ
- [ ] アドレス帳の増分コールバック＋毎日の全量フォールバックタスクが有効化済み

## まとめ

「既存の勤怠システム＋Activiti による複雑な承認」を前提に企業微信を統合するうえで、正しいアプローチは作り直しではなく、WeCom を**入口、身份プロバイダ、メッセージチャネル**として位置付けることです：

- **方式選定**：既存 Web システムがあり、承認フォームが複雑で、高速なイテレーションと審査不要のリリースが求められる場合、ミニプログラムより H5 が適しています。OAuth2 の `snsapi_base` サイレント認可でアプリを開くだけの自動ログイン（免登）を実現でき、JS-SDK で測位、撮影、スキャンを十分カバーできます。
- **自動ログインの流れ**：フロントのルートガードがトークンなしを検知 → 302 で WeCom 認可へ（state 付き）→ サイレントに code 付きで戻る → バックエンドが gettoken＋`auth/getuserinfo` で userid を取得 → **社員番号で既存システムのアカウントへマッピング（新規作成しない）** → システム従来の JWT を発行。以降の勤怠・承認 API は無改造で再利用できます。
- **アカウントの分離**：Activiti の assignee／候補者は引き続き内部 username を使い、WeCom の userid は `sys_user` 上の外部身份フィールドにとどめます。ログイン時の本人確認とプッシュ先解決のときだけ変換し、複数のログイン方式が併存できる余地を残します。
- **承認の再利用**：会签（マルチインスタンス＋完了条件）、或签（candidateUsers＋claim）、組織構造承認（UEL 式による責任者の動的解決）はすべて既存 BPMN を流用します。H5 は承認待ちリスト／詳細／処理の入口を追加するだけで、根底はすべて同じ `taskService.complete()` を通ります。
- **連携と到達**：勤怠連携はプロセス終了リスナーに置いて全入口での一貫性を保証し、新しい承認待ちは textcard でプッシュしてリンクから承認詳細へ直行させ免登を再利用します。カード内のワンクリック承認はコールバック経由とし、操作は必ず冪等にします。
- **主要なハマりどころ**：信頼ドメインと企業の信頼済み IP、iOS／Android の署名 URL の違い、code の使い捨てと state による CSRF 対策、重複アカウントを絶対に作らないこと、或签の claim、コールバックの秒速 success 応答、チケットの集中キャッシュ。

公式ドキュメント：[企業微信開発者センター](https://developer.work.weixin.qq.com/document/)

> 本アプローチの本質は「作り直し」ではなく「統合」です。最小限の新規コード（OAuth ログインエンドポイント1つ、アカウントマッピング層、JS-SDK 署名サービス1つ、承認待ちプッシュリスナー群）によって、長年培ってきた勤怠と Activiti 承認の機能を従業員の企業微信へシームレスに届け、無感覚な自動ログインを実現します。今後、打刻体験のさらなる向上が必要になれば、ミニプログラムの打刻入口を追加し、H5 承認と同一のバックエンドアカウント・ワークフローを共有する形でスムーズに進化できます。
